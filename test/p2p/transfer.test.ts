import { File as NativeFile } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TransferSession } from '@/lib/transfer';
import { MAX_TEXT_BYTES } from '@/lib/protocol';
import { readChunk } from '@/lib/transfer-protocol';
import { FakeDataChannel, makeEvents } from './fakes';

const sessions: TransferSession[] = [];
afterEach(() => { for (const session of sessions.splice(0)) session.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); });
async function pair() {
  const a = new FakeDataChannel(); const b = new FakeDataChannel();
  const senderEvents = makeEvents(); const receiverEvents = makeEvents();
  const sender = new TransferSession(a.asRTCDataChannel(), senderEvents, { role: 'sender', maxMessageSize: () => 4096 });
  const receiver = new TransferSession(b.asRTCDataChannel(), receiverEvents, { role: 'receiver', maxMessageSize: () => 4096 });
  sessions.push(sender, receiver);
  const sendA = a.send.bind(a); const sendB = b.send.bind(b);
  vi.spyOn(a, 'send').mockImplementation((value) => { sendA(value); queueMicrotask(() => b.emit(value)); });
  vi.spyOn(b, 'send').mockImplementation((value) => { sendB(value); queueMicrotask(() => a.emit(value)); });
  sender.start(); receiver.start(); await Promise.resolve(); await Promise.resolve();
  return { a, b, sender, receiver, senderEvents, receiverEvents };
}
function file(bytes: Uint8Array): File { return new NativeFile([bytes], 'payload.bin') as unknown as File; }

describe('p2p/transfer — version 2', () => {
  it('sends the complete UTF-8 text within a small negotiated frame limit', async () => {
    const p = await pair();
    const text = 'اردو🙂'.repeat(5000);
    p.sender.sendText(text);
    await vi.waitFor(() => expect(p.receiverEvents.onTextReceived).toHaveBeenCalledWith(text));
    await vi.waitFor(() => expect(p.senderEvents.onTextAcknowledged).toHaveBeenCalledTimes(1));
    const frames = p.a.sent.filter((entry): entry is ArrayBuffer => typeof entry !== 'string');
    expect(frames.length).toBeGreaterThan(1);
    expect(frames.every((frame) => frame.byteLength <= 4096)).toBe(true);
    expect(frames.map((frame) => readChunk(frame)?.sequence)).toEqual(frames.map((_, index) => index));
  });
  it('requires receiver acknowledgement before sender completion', async () => {
    const p = await pair();
    p.sender.sendMeta([file(new Uint8Array([1, 2, 3]))]); await Promise.resolve();
    vi.spyOn(p.b, 'send').mockImplementation(() => {});
    p.receiver.requestFile(0);
    // Deliver the request explicitly while withholding subsequent ACKs.
    const request = vi.mocked(p.b.send).mock.calls.at(-1)?.[0];
    if (!request) throw new Error('Missing request');
    p.a.emit(request);
    await vi.waitFor(() => expect(p.receiverEvents.onFileComplete).toHaveBeenCalledTimes(1));
    expect(p.senderEvents.onTransferComplete).not.toHaveBeenCalled();
    const ack = vi.mocked(p.b.send).mock.calls.map(([value]) => value).find((value) => typeof value === 'string' && JSON.parse(value).kind === 'ack');
    p.a.emit(ack);
    expect(p.senderEvents.onFileAcknowledged).toHaveBeenCalledWith(0);
  });
  it('rejects oversize text without silently sending a truncated success', async () => {
    const p = await pair(); p.sender.sendText('x'.repeat(MAX_TEXT_BYTES + 1));
    expect(p.senderEvents.onTransferFailed).toHaveBeenCalledWith(-1, expect.stringContaining('1 MiB'));
    expect(p.a.sent.filter((value) => typeof value !== 'string')).toEqual([]);
  });
  it('fails a missing file response, clears its attempt, and uses a new ID on retry', async () => {
    const p = await pair();
    p.sender.sendMeta([file(new Uint8Array([1]))]); await Promise.resolve();
    vi.spyOn(p.b, 'send').mockImplementation(() => {});
    vi.useFakeTimers(); p.receiver.requestFile(0);
    const first = JSON.parse(vi.mocked(p.b.send).mock.calls.at(-1)![0] as string).id;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(p.receiverEvents.onTransferFailed).toHaveBeenCalledWith(0, expect.stringContaining('timed out'));
    p.receiver.requestFile(0);
    const second = JSON.parse(vi.mocked(p.b.send).mock.calls.at(-1)![0] as string).id;
    expect(second).not.toBe(first);
  });
  it('aborts a pending backpressure wait and clears all listeners on disposal', async () => {
    const p = await pair(); p.a.bufferedAmount = 999999;
    p.sender.sendText('hello'); await Promise.resolve();
    p.sender.dispose();
    p.a.bufferedAmount = 0; p.a.dispatchEvent(new Event('bufferedamountlow'));
    await Promise.resolve();
    expect(p.a.sent.filter((value) => typeof value !== 'string')).toEqual([]);
    expect(p.senderEvents.onTransferComplete).not.toHaveBeenCalled();
  });
  it('asks an old peer to reload instead of accepting an unversioned payload', () => {
    const dc = new FakeDataChannel(); const events = makeEvents();
    const session = new TransferSession(dc.asRTCDataChannel(), events); sessions.push(session);
    dc.emit(JSON.stringify({ kind: 'text', text: 'legacy' }));
    expect(events.onProtocolError).toHaveBeenCalledWith(expect.stringContaining('Reload both devices'));
    expect(events.onTextReceived).not.toHaveBeenCalled();
  });
});
