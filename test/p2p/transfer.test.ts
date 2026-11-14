import { File as NativeFile } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TransferSession } from '@/lib/transfer';
import { Crc32, MAX_FILES_PER_TRANSFER, MAX_TEXT_BYTES, MAX_TRANSFER_BYTES } from '@/lib/protocol';
import { frameChunk, readChunk } from '@/lib/transfer-protocol';
import { createFile } from '../shared/fixtures';
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

// ─── Additional protocol coverage ───────────────────────────────────────────

type Role = 'sender' | 'receiver';

function setup(role: Role = 'receiver', max = 4096) {
  const dc = new FakeDataChannel();
  const events = makeEvents();
  const session = new TransferSession(dc.asRTCDataChannel(), events, {
    role,
    maxMessageSize: () => max,
  });
  sessions.push(session);
  return { dc, events, session };
}

function handshake(role: Role = 'receiver', max = 4096) {
  const context = setup(role, max);
  context.dc.emit(JSON.stringify({ v: 2, kind: 'hello' }));
  return context;
}

function controls(dc: FakeDataChannel): Array<Record<string, unknown>> {
  return dc.sent
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => JSON.parse(entry) as Record<string, unknown>);
}

function lastControl(dc: FakeDataChannel): Record<string, unknown> {
  const message = controls(dc).at(-1);
  if (!message) throw new Error('No control message was sent');
  return message;
}

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const descriptors = [{ name: 'payload.bin', size: 3, type: 'application/octet-stream', index: 0 }];

describe('p2p/transfer — negotiation', () => {
  it('sends exactly one hello and reports readiness once', () => {
    const { dc, events, session } = setup();
    dc.emit(JSON.stringify({ v: 2, kind: 'hello' }));
    dc.emit(JSON.stringify({ v: 2, kind: 'hello' }));

    expect(controls(dc).filter((message) => message.kind === 'hello')).toHaveLength(1);
    expect(events.onReady).toHaveBeenCalledTimes(1);
    session.start();
    expect(controls(dc).filter((message) => message.kind === 'hello')).toHaveLength(1);
  });

  it('fails when the peer never negotiates', async () => {
    vi.useFakeTimers();
    const { events, session } = setup();
    session.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(events.onProtocolError).toHaveBeenCalledWith(expect.stringContaining('Update or reload'));
    session.dispose();
  });

  it('fails when the transport is already closed', () => {
    const { dc, events, session } = setup();
    dc.readyState = 'closed';
    session.start();
    expect(events.onProtocolError).toHaveBeenCalledWith('Could not start the transfer protocol');
  });

  it('rejects payloads before version negotiation', () => {
    const { dc, events } = setup();
    dc.emit(JSON.stringify({ v: 2, kind: 'ack', id: 'a'.repeat(32) }));
    expect(events.onProtocolError).toHaveBeenCalledWith('Transfer started before version negotiation');
  });

  it('rejects malformed, oversized, and unknown control frames', () => {
    const malformed = setup();
    malformed.dc.emit('{not json');
    expect(malformed.events.onProtocolError).toHaveBeenCalledWith('Invalid transfer data or unavailable channel');

    const oversized = setup('receiver', 10);
    oversized.dc.emit(JSON.stringify({ v: 2, kind: 'hello', padding: 'x'.repeat(100) }));
    expect(oversized.events.onProtocolError).toHaveBeenCalledWith('Oversized control message');

    const unknown = handshake();
    unknown.dc.emit(JSON.stringify({ v: 2, kind: 'nope' }));
    expect(unknown.events.onProtocolError).toHaveBeenCalledWith('Invalid transfer control message');
  });
});

describe('p2p/transfer — descriptors and requests', () => {
  it('stores one ordered descriptor list', () => {
    const { dc, events } = handshake();
    dc.emit(JSON.stringify({ v: 2, kind: 'descriptors', files: descriptors }));
    expect(events.onFileDescriptorsReceived).toHaveBeenCalledWith(descriptors);

    dc.emit(JSON.stringify({ v: 2, kind: 'descriptors', files: descriptors }));
    expect(events.onProtocolError).toHaveBeenCalledWith('Unexpected file list');
  });

  it('rejects descriptors sent to the share side', () => {
    const { dc, events } = handshake('sender');
    dc.emit(JSON.stringify({ v: 2, kind: 'descriptors', files: descriptors }));
    expect(events.onProtocolError).toHaveBeenCalledWith('Unexpected file list');
  });

  it('only requests a known descriptor while idle and ready', () => {
    const idle = setup();
    idle.session.requestFile(0);
    expect(idle.dc.sent).toEqual([]);

    const notReady = setup();
    notReady.session.sendMeta([]);
    notReady.session.requestFile(0);
    expect(controls(notReady.dc)).toHaveLength(0);

    const { dc, events, session } = handshake();
    session.requestFile(3);
    expect(controls(dc)).toHaveLength(1);
    expect(events.onTransferFailed).not.toHaveBeenCalled();
  });

  it('fails a request that cannot be written', () => {
    const { dc, events, session } = handshake();
    dc.emit(JSON.stringify({ v: 2, kind: 'descriptors', files: descriptors }));
    dc.readyState = 'closed';
    session.requestFile(0);
    expect(events.onTransferFailed).toHaveBeenCalledWith(0, 'Could not request the file');
  });

  it('rejects requests for unknown files and to the receiving side', () => {
    const sender = handshake('sender');
    sender.session.handleFileRequest(0, 'b'.repeat(32));
    expect(sender.events.onProtocolError).toHaveBeenCalledWith('Unknown requested file');

    const receiver = handshake();
    receiver.dc.emit(JSON.stringify({ v: 2, kind: 'descriptors', files: descriptors }));
    receiver.session.handleFileRequest(0, 'b'.repeat(32));
    expect(receiver.events.onProtocolError).toHaveBeenCalledWith('Unknown requested file');
  });

  it('answers a busy sender with a retryable failure and ignores duplicate requests', async () => {
    const { dc, session } = handshake('sender');
    session.sendMeta([file(new Uint8Array([1, 2, 3]))]);
    const first = 'b'.repeat(32);
    session.handleFileRequest(0, first);
    session.handleFileRequest(0, first);
    session.handleFileRequest(0, 'c'.repeat(32));
    await flush();

    expect(controls(dc).filter((message) => message.kind === 'start')).toHaveLength(1);
    expect(controls(dc).some((message) => message.kind === 'failed' && message.reason === 'Another transfer is still active. Retry shortly.')).toBe(true);
  });
});

describe('p2p/transfer — start and chunk validation', () => {
  it('matches a start frame to the requested file', () => {
    const { dc, events, session } = handshake();
    dc.emit(JSON.stringify({ v: 2, kind: 'descriptors', files: descriptors }));
    session.requestFile(0);
    const request = lastControl(dc);

    dc.emit(JSON.stringify({ v: 2, kind: 'start', id: request.id, index: 0, media: 'file', size: 4 }));
    expect(events.onProtocolError).toHaveBeenCalledWith('File metadata does not match the requested file');

    dc.emit(JSON.stringify({ v: 2, kind: 'start', id: 'c'.repeat(32), index: 0, media: 'file', size: 3 }));
    expect(events.onProtocolError).toHaveBeenCalledTimes(1);
  });

  it('rejects text starts on the share side or beside a file list', () => {
    const sender = handshake('sender');
    sender.dc.emit(JSON.stringify({ v: 2, kind: 'start', id: 'b'.repeat(32), index: -1, media: 'text', size: 1 }));
    expect(sender.events.onProtocolError).toHaveBeenCalledWith('Unexpected text transfer');

    const receiver = handshake();
    receiver.dc.emit(JSON.stringify({ v: 2, kind: 'descriptors', files: descriptors }));
    receiver.dc.emit(JSON.stringify({ v: 2, kind: 'start', id: 'b'.repeat(32), index: -1, media: 'text', size: 1 }));
    expect(receiver.events.onProtocolError).toHaveBeenCalledWith('Unexpected text transfer');
  });

  it('accepts a text start, chunks, and a matching completion', () => {
    const { dc, events } = handshake();
    const id = 'd'.repeat(32);
    const bytes = new TextEncoder().encode('ok');
    const crc = new Crc32();
    crc.update(bytes);

    dc.emit(JSON.stringify({ v: 2, kind: 'start', id, index: -1, media: 'text', size: bytes.byteLength }));
    expect(events.onTransferFailed).not.toHaveBeenCalled();
    dc.emit(frameChunk(id, 0, bytes.buffer.slice(0) as ArrayBuffer));
    expect(events.onProgress).toHaveBeenCalled();
    dc.emit(JSON.stringify({ v: 2, kind: 'complete', id, crc: crc.value, chunks: 1 }));

    expect(events.onTextReceived).toHaveBeenCalledWith('ok');
    expect(events.onTransferComplete).toHaveBeenCalledTimes(1);
    expect(lastControl(dc)).toEqual({ v: 2, kind: 'ack', id });
  });
});

describe('p2p/transfer — binary frame validation', () => {
  it('rejects malformed and unexpected binary frames', () => {
    const malformed = handshake();
    malformed.dc.emit(new Uint8Array([1, 2, 3]));
    expect(malformed.events.onProtocolError).toHaveBeenCalledWith('Invalid binary frame');

    const short = handshake();
    short.dc.emit(new Uint8Array(19).buffer);
    expect(short.events.onProtocolError).toHaveBeenCalledWith('Invalid binary frame');

    const idle = handshake();
    idle.dc.emit(frameChunk('e'.repeat(32), 0, new Uint8Array([1]).buffer));
    expect(idle.events.onProtocolError).not.toHaveBeenCalled();
  });

  it('requires ordered chunks that fit the announced size', () => {
    const outOfOrder = handshake();
    outOfOrder.dc.emit(JSON.stringify({ v: 2, kind: 'descriptors', files: [{ ...descriptors[0], size: 4 }] }));
    outOfOrder.session.requestFile(0);
    const outOfOrderId = String(lastControl(outOfOrder.dc).id);
    outOfOrder.dc.emit(JSON.stringify({ v: 2, kind: 'start', id: outOfOrderId, index: 0, media: 'file', size: 4 }));
    outOfOrder.dc.emit(frameChunk(outOfOrderId, 1, new Uint8Array([1]).buffer));
    expect(outOfOrder.events.onProtocolError).toHaveBeenCalledWith('Unexpected transfer chunk');

    const overflow = handshake();
    overflow.dc.emit(JSON.stringify({ v: 2, kind: 'descriptors', files: [{ ...descriptors[0], size: 4 }] }));
    overflow.session.requestFile(0);
    const overflowId = String(lastControl(overflow.dc).id);
    overflow.dc.emit(JSON.stringify({ v: 2, kind: 'start', id: overflowId, index: 0, media: 'file', size: 4 }));
    overflow.dc.emit(frameChunk(overflowId, 0, new Uint8Array(5).buffer));
    expect(overflow.events.onProtocolError).toHaveBeenCalledWith('Unexpected transfer chunk');
  });

  it('ignores chunks for another attempt', () => {
    const { dc, events, session } = handshake();
    dc.emit(JSON.stringify({ v: 2, kind: 'descriptors', files: descriptors }));
    session.requestFile(0);
    const id = String(lastControl(dc).id);
    dc.emit(JSON.stringify({ v: 2, kind: 'start', id, index: 0, media: 'file', size: 3 }));
    dc.emit(frameChunk('f'.repeat(32), 0, new Uint8Array([1]).buffer));

    expect(events.onProtocolError).not.toHaveBeenCalled();
    expect(events.onProgress).not.toHaveBeenCalled();
  });

  it('reports size and checksum failures instead of completing', () => {
    const { dc, events, session } = handshake();
    dc.emit(JSON.stringify({ v: 2, kind: 'descriptors', files: descriptors }));
    session.requestFile(0);
    const id = String(lastControl(dc).id);
    dc.emit(JSON.stringify({ v: 2, kind: 'start', id, index: 0, media: 'file', size: 3 }));
    dc.emit(frameChunk(id, 0, new Uint8Array([1, 2, 3]).buffer));

    dc.emit(JSON.stringify({ v: 2, kind: 'complete', id, crc: 0, chunks: 1 }));
    expect(events.onTransferFailed).toHaveBeenCalledWith(0, 'Received data failed its size or integrity check');
    expect(events.onFileComplete).not.toHaveBeenCalled();
  });

  it('rejects text that is not valid UTF-8', () => {
    const { dc, events } = handshake();
    const id = '1'.repeat(32);
    const bytes = new Uint8Array([0xff, 0xff]);
    const crc = new Crc32();
    crc.update(bytes);
    dc.emit(JSON.stringify({ v: 2, kind: 'start', id, index: -1, media: 'text', size: bytes.byteLength }));
    dc.emit(frameChunk(id, 0, bytes.buffer.slice(0) as ArrayBuffer));
    dc.emit(JSON.stringify({ v: 2, kind: 'complete', id, crc: crc.value, chunks: 1 }));

    expect(events.onTransferFailed).toHaveBeenCalledWith(-1, 'Received text is not valid UTF-8');
    expect(events.onTextReceived).not.toHaveBeenCalled();
  });

  it('ignores completion for an unknown attempt', () => {
    const { dc, events } = handshake();
    dc.emit(JSON.stringify({ v: 2, kind: 'complete', id: '2'.repeat(32), crc: 0, chunks: 0 }));
    expect(events.onTransferComplete).not.toHaveBeenCalled();
  });
});

describe('p2p/transfer — acknowledgement and cancellation', () => {
  it('completes an outgoing transfer only after the peer acknowledges it', async () => {
    const { dc, events, session } = handshake('sender');
    session.sendText('hi');
    await flush();
    const id = String(controls(dc).find((message) => message.kind === 'start')?.id);

    dc.emit(JSON.stringify({ v: 2, kind: 'ack', id: '3'.repeat(32) }));
    expect(events.onTextAcknowledged).not.toHaveBeenCalled();

    dc.emit(JSON.stringify({ v: 2, kind: 'ack', id }));
    expect(events.onTextAcknowledged).toHaveBeenCalledTimes(1);
    expect(events.onTransferComplete).toHaveBeenCalledTimes(1);
  });

  it('ignores acknowledgements with no pending attempt', () => {
    const { dc, events } = handshake('sender');
    dc.emit(JSON.stringify({ v: 2, kind: 'ack', id: '4'.repeat(32) }));
    expect(events.onTransferComplete).not.toHaveBeenCalled();
  });

  it('surfaces a peer failure and a cancellation for incoming attempts', () => {
    const { dc, events, session } = handshake();
    dc.emit(JSON.stringify({ v: 2, kind: 'descriptors', files: descriptors }));
    session.requestFile(0);
    const id = String(lastControl(dc).id);

    dc.emit(JSON.stringify({ v: 2, kind: 'failed', id, reason: 'disk full' }));
    expect(events.onTransferFailed).toHaveBeenCalledWith(0, 'disk full');
    expect(events.onProtocolError).not.toHaveBeenCalled();

    session.requestFile(0);
    const next = String(lastControl(dc).id);
    dc.emit(JSON.stringify({ v: 2, kind: 'cancel', id: next, reason: '' }));
    expect(events.onTransferFailed).toHaveBeenLastCalledWith(0, 'Transfer cancelled');
  });

  it('surfaces a peer failure for outgoing attempts', async () => {
    const { dc, events, session } = handshake('sender');
    session.sendText('hello');
    await flush();
    const id = String(controls(dc).find((message) => message.kind === 'start')?.id);
    dc.emit(JSON.stringify({ v: 2, kind: 'cancel', id, reason: 'peer cancelled' }));

    expect(events.onTransferFailed).toHaveBeenCalledWith(-1, 'peer cancelled');
  });

  it('forgets an acknowledged attempt whose failure arrived late', () => {
    const { dc, events, session } = handshake();
    dc.emit(JSON.stringify({ v: 2, kind: 'descriptors', files: descriptors }));
    session.requestFile(0);
    const id = String(lastControl(dc).id);
    dc.emit(JSON.stringify({ v: 2, kind: 'start', id, index: 0, media: 'file', size: 3 }));
    dc.emit(frameChunk(id, 0, new Uint8Array([1, 2, 3]).buffer));
    const crc = new Crc32();
    crc.update(new Uint8Array([1, 2, 3]));
    dc.emit(JSON.stringify({ v: 2, kind: 'complete', id, crc: crc.value, chunks: 1 }));
    dc.emit(JSON.stringify({ v: 2, kind: 'cancel', id, reason: 'late' }));
    dc.emit(JSON.stringify({ v: 2, kind: 'cancel', id, reason: 'later' }));

    expect(events.onFileComplete).toHaveBeenCalledTimes(1);
    expect(events.onTransferFailed).not.toHaveBeenCalled();
  });

  it('cancels the current attempt locally and notifies the peer', () => {
    const idle = handshake();
    idle.session.cancelCurrent();
    expect(idle.dc.sent).toHaveLength(1);

    const { dc, events, session } = handshake();
    dc.emit(JSON.stringify({ v: 2, kind: 'descriptors', files: descriptors }));
    session.requestFile(0);
    const id = String(lastControl(dc).id);
    session.cancelCurrent();

    expect(events.onTransferFailed).toHaveBeenCalledWith(0, 'Transfer cancelled');
    expect(lastControl(dc)).toEqual({ v: 2, kind: 'cancel', id, reason: 'Transfer cancelled' });

    session.cancelCurrent();
    expect(events.onTransferFailed).toHaveBeenCalledTimes(1);
  });
});

describe('p2p/transfer — backpressure, pausing, and limits', () => {
  it('pauses an outgoing payload and resumes it', async () => {
    const { dc, events, session } = handshake('sender');
    session.sendMeta([file(new Uint8Array([1, 2, 3]))]);
    session.setPaused(true);
    session.handleFileRequest(0, 'a'.repeat(32));
    await flush();
    expect(controls(dc).some((message) => message.kind === 'start')).toBe(false);

    session.setPaused(false);
    await flush();
    expect(controls(dc).some((message) => message.kind === 'start')).toBe(true);
    expect(events.onTransferFailed).not.toHaveBeenCalled();
  });

  it('waits for the buffer to drain before sending more', async () => {
    const { dc, session } = handshake('sender');
    session.sendMeta([file(new Uint8Array(64))]);
    dc.bufferedAmount = 999_999;
    session.handleFileRequest(0, 'b'.repeat(32));
    await flush();
    expect(dc.sent.filter((entry) => typeof entry !== 'string')).toHaveLength(0);

    dc.bufferedAmount = 0;
    dc.dispatchEvent(new Event('bufferedamountlow'));
    await flush();
    expect(dc.sent.filter((entry) => typeof entry !== 'string').length).toBeGreaterThan(0);
  });

  it('aborts a blocked send when the transport closes', async () => {
    const { dc, events, session } = handshake('sender');
    session.sendMeta([file(new Uint8Array(64))]);
    dc.bufferedAmount = 999_999;
    session.handleFileRequest(0, 'c'.repeat(32));
    await flush();

    dc.close();
    await flush();
    expect(events.onTransferFailed).toHaveBeenCalledWith(0, 'File or text could not be sent. Retry the transfer.');
  });

  it('aborts a blocked send when the session is disposed', async () => {
    const { dc, events, session } = handshake('sender');
    session.sendMeta([file(new Uint8Array(64))]);
    dc.bufferedAmount = 999_999;
    session.handleFileRequest(0, 'd'.repeat(32));
    await flush();

    session.dispose();
    await flush();
    expect(events.onTransferFailed).not.toHaveBeenCalled();
  });

  it('treats an unbounded SCTP message size as the protocol maximum', async () => {
    const unlimited = handshake('sender', Number.POSITIVE_INFINITY);
    unlimited.session.sendText('fits');
    await flush();
    expect(unlimited.dc.sent.filter((entry) => typeof entry !== 'string').length).toBeGreaterThan(0);
  });

  it('enforces file count and size limits before sending', () => {
    const { events, session } = handshake('sender');
    session.sendMeta(Array.from({ length: MAX_FILES_PER_TRANSFER + 1 }, (_, index) =>
      createFile(`${index}.txt`, 1)));
    expect(events.onProtocolError).toHaveBeenCalledWith('File count or size exceeds the transfer limit');

    const oversized = handshake('sender');
    oversized.session.sendMeta([createFile('huge.bin', MAX_TRANSFER_BYTES + 1, 'application/octet-stream')]);
    expect(oversized.events.onProtocolError).toHaveBeenCalledWith('File count or size exceeds the transfer limit');
  });

  it('refuses to announce files before negotiation or on a closed channel', () => {
    const early = setup('sender');
    early.session.sendMeta([file(new Uint8Array([1]))]);
    expect(early.events.onProtocolError).toHaveBeenCalledWith('Peer protocol is not ready');

    const closed = handshake('sender');
    closed.dc.readyState = 'closed';
    closed.session.sendMeta([file(new Uint8Array([1]))]);
    expect(closed.events.onProtocolError).toHaveBeenCalledWith('Could not send file list');
  });

  it('ignores empty file lists and empty text payloads', async () => {
    const empty = handshake('sender');
    empty.session.sendMeta([]);
    expect(controls(empty.dc)).toEqual([{ v: 2, kind: 'hello' }]);

    const text = handshake('sender');
    text.session.sendText('');
    await flush();
    expect(controls(text.dc).some((message) => message.kind === 'complete')).toBe(true);
  });

  it('ignores text and requests while the protocol is not ready or busy', async () => {
    const notReady = setup('sender');
    notReady.session.sendText('nope');
    expect(controls(notReady.dc)).toHaveLength(0);

    const busy = handshake('sender');
    busy.session.sendText('first');
    busy.session.sendText('second');
    await flush();
    expect(controls(busy.dc).filter((message) => message.kind === 'start')).toHaveLength(1);
  });

  it('stops all activity once disposed and tolerates repeated disposal', () => {
    const { dc, events, session } = handshake();
    dc.emit(JSON.stringify({ v: 2, kind: 'descriptors', files: descriptors }));
    session.requestFile(0);
    const sent = dc.sent.length;
    session.dispose();
    session.dispose();

    dc.emit(JSON.stringify({ v: 2, kind: 'complete', id: 'a'.repeat(32), crc: 0, chunks: 0 }));
    session.start();
    session.cancelCurrent();

    expect(dc.sent).toHaveLength(sent);
    expect(events.onTransferComplete).not.toHaveBeenCalled();
    expect(events.onTransferFailed).not.toHaveBeenCalled();
    expect(events.onProtocolError).not.toHaveBeenCalled();
  });
});
