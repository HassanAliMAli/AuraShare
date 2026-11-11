import { afterEach, describe, expect, it, vi } from 'vitest';
import { TransferSession } from '@/lib/transfer';
import { FakeDataChannel, makeEvents } from './fakes';

function setup() {
  const dc = new FakeDataChannel();
  const events = makeEvents();
  const session = new TransferSession(dc.asRTCDataChannel(), events);
  return { dc, events, session };
}

function sentJson(dc: FakeDataChannel, index: number): Record<string, unknown> {
  const entry = dc.sent[index];
  if (typeof entry !== 'string') throw new Error(`sent[${index}] is not a control message`);
  return JSON.parse(entry) as Record<string, unknown>;
}

function binaryChunks(dc: FakeDataChannel): ArrayBuffer[] {
  return dc.sent.filter((entry): entry is ArrayBuffer => entry instanceof ArrayBuffer);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('p2p/transfer — configuration and control messages', () => {
  it('configures the data channel for binary streaming', () => {
    const { dc } = setup();
    expect(dc.binaryType).toBe('arraybuffer');
    expect(dc.bufferedAmountLowThreshold).toBe(64 * 1024);
  });

  it('forwards descriptors and text to their callbacks', () => {
    const { dc, events } = setup();
    const files = [{ name: 'a.txt', size: 10, type: 'text/plain', index: 0 }];

    dc.emit(JSON.stringify({ kind: 'file-descriptors', files }));
    dc.emit(JSON.stringify({ kind: 'text', text: 'hello' }));

    expect(events.onFileDescriptorsReceived).toHaveBeenCalledWith(files);
    expect(events.onTextReceived).toHaveBeenCalledWith('hello');
  });

  it('ignores malformed control messages', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { dc, events } = setup();

    expect(() => dc.emit('{not-json')).not.toThrow();

    expect(warn).toHaveBeenCalled();
    expect(events.onTextReceived).not.toHaveBeenCalled();
    expect(events.onFileDescriptorsReceived).not.toHaveBeenCalled();
  });

  it('ignores binary data that arrives before metadata', () => {
    const { dc, events } = setup();
    dc.emit(new ArrayBuffer(8));
    expect(events.onProgress).not.toHaveBeenCalled();
  });
});

describe('p2p/transfer — receiving a file', () => {
  it('reassembles chunks, builds a File, acknowledges it, and completes', () => {
    const { dc, events } = setup();
    const bytes = new TextEncoder().encode('hello world');

    dc.emit(
      JSON.stringify({
        kind: 'file-metadata',
        name: 'hello.txt',
        size: bytes.byteLength,
        type: 'text/plain',
        index: 0,
      }),
    );
    dc.emit(JSON.stringify({ kind: 'file-descriptors', files: [{ name: 'hello.txt', size: 11, type: 'text/plain' }] }));
    dc.emit(bytes.buffer);
    dc.emit(JSON.stringify({ kind: 'transfer-complete', fileIndex: 0 }));

    expect(events.onFileComplete).toHaveBeenCalledTimes(1);
    const [index, file] = events.onFileComplete.mock.calls[0] as [number, File];
    expect(index).toBe(0);
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('hello.txt');
    expect(file.type).toBe('text/plain');
    expect(file.size).toBe(11);
    expect(events.onProgress).toHaveBeenCalledWith(100);
    expect(events.onTransferComplete).toHaveBeenCalledTimes(1);

    const ack = dc.sent.find(
      (entry) => typeof entry === 'string' && entry.includes('file-acknowledged'),
    );
    expect(ack).toBeDefined();
  });

  it('reports progress every 50 chunks', () => {
    const { dc, events } = setup();
    dc.emit(
      JSON.stringify({
        kind: 'file-metadata',
        name: 'big.bin',
        size: 50 * 10,
        type: 'application/octet-stream',
        index: 0,
      }),
    );

    for (let i = 0; i < 49; i += 1) dc.emit(new ArrayBuffer(10));
    expect(events.onProgress).not.toHaveBeenCalled();

    dc.emit(new ArrayBuffer(10));
    expect(events.onProgress).toHaveBeenCalledTimes(1);
    expect(events.onProgress.mock.calls[0]?.[0]).toBe(99);
  });

  it('ignores transfer-complete before metadata', () => {
    const { dc, events } = setup();
    dc.emit(JSON.stringify({ kind: 'transfer-complete', fileIndex: 0 }));
    expect(events.onFileComplete).not.toHaveBeenCalled();
    expect(events.onTransferComplete).not.toHaveBeenCalled();
  });

  it('ignores transfer-complete when bytes are missing', () => {
    const { dc, events } = setup();
    dc.emit(
      JSON.stringify({
        kind: 'file-metadata',
        name: 'short.bin',
        size: 20,
        type: 'application/octet-stream',
        index: 0,
      }),
    );
    dc.emit(new ArrayBuffer(5));
    dc.emit(JSON.stringify({ kind: 'transfer-complete', fileIndex: 0 }));

    expect(events.onFileComplete).not.toHaveBeenCalled();
    expect(events.onTransferComplete).not.toHaveBeenCalled();
  });

  it('falls back to the descriptor name when the index is unknown', () => {
    const { dc, events } = setup();
    dc.emit(
      JSON.stringify({
        kind: 'file-descriptors',
        files: [{ name: 'match.txt', size: 1, type: 'text/plain' }],
      }),
    );
    dc.emit(
      JSON.stringify({
        kind: 'file-metadata',
        name: 'match.txt',
        size: 1,
        type: 'text/plain',
        index: 99,
      }),
    );
    dc.emit(new Uint8Array([1]).buffer);
    dc.emit(JSON.stringify({ kind: 'transfer-complete', fileIndex: 99 }));

    expect(events.onFileComplete).toHaveBeenCalledWith(0, expect.any(File));
    expect(dc.sent.some((entry) => typeof entry === 'string' && entry.includes('"index":0'))).toBe(
      true,
    );
  });
});

describe('p2p/transfer — sender API', () => {
  it('sends descriptors for a non-empty file list when open', () => {
    const { dc, session } = setup();
    const file = new File(['abc'], 'a.txt', { type: 'text/plain' });

    session.sendMeta([file]);

    expect(sentJson(dc, 0)).toEqual({
      kind: 'file-descriptors',
      files: [{ name: 'a.txt', size: 3, type: 'text/plain', index: 0 }],
    });
  });

  it('does not send descriptors for an empty list or a closed channel', () => {
    const { dc, session } = setup();
    session.sendMeta([]);
    expect(dc.sent).toHaveLength(0);

    dc.readyState = 'closed';
    session.sendMeta([new File(['x'], 'x.txt', { type: 'text/plain' })]);
    expect(dc.sent).toHaveLength(0);
  });

  it('sends text and truncates payloads over 1 MiB', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { dc, session } = setup();

    session.sendText('short');
    expect(sentJson(dc, 0)).toEqual({ kind: 'text', text: 'short' });

    session.sendText('a'.repeat(1024 * 1024 + 10));
    const truncated = sentJson(dc, 1).text as string;
    expect(truncated).toHaveLength(1024 * 1024);
    expect(warn).toHaveBeenCalled();
  });

  it('does not send text or requests on a closed channel', () => {
    const { dc, session } = setup();
    dc.readyState = 'closed';

    session.sendText('nope');
    session.requestFile(0);

    expect(dc.sent).toHaveLength(0);
  });

  it('requests a file by index', () => {
    const { dc, session } = setup();
    session.requestFile(2);
    expect(sentJson(dc, 0)).toEqual({ kind: 'file-request', index: 2 });
  });

  it('streams a requested file in 64 KB chunks and completes', async () => {
    const { dc, events, session } = setup();
    const size = 130 * 1024;
    const file = new File([new Uint8Array(size)], 'big.bin', {
      type: 'application/octet-stream',
    });
    session.sendMeta([file]);
    dc.sent = [];

    session.handleFileRequest(0);

    await vi.waitFor(() => {
      expect(events.onTransferComplete).toHaveBeenCalledTimes(1);
    });

    expect(sentJson(dc, 0)).toMatchObject({
      kind: 'file-metadata',
      name: 'big.bin',
      size,
      index: 0,
    });

    const chunks = binaryChunks(dc);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.byteLength).toBe(64 * 1024);
    expect(chunks[1]?.byteLength).toBe(64 * 1024);
    expect(chunks[2]?.byteLength).toBe(2 * 1024);

    const last = sentJson(dc, dc.sent.length - 1);
    expect(last).toEqual({ kind: 'transfer-complete', fileIndex: 0 });
    expect(events.onProgress).toHaveBeenCalledWith(100);
  });

  it('deduplicates a request for the file already in flight', async () => {
    const { dc, session } = setup();
    const file = new File([new Uint8Array(128 * 1024)], 'big.bin', {
      type: 'application/octet-stream',
    });
    session.sendMeta([file]);
    dc.sent = [];

    session.handleFileRequest(0);
    session.handleFileRequest(0);

    await vi.waitFor(() => {
      expect(dc.sent.some((entry) => entry instanceof ArrayBuffer)).toBe(true);
    });

    const metadataCount = dc.sent.filter(
      (entry) => typeof entry === 'string' && entry.includes('file-metadata'),
    );
    expect(metadataCount).toHaveLength(1);
  });

  it('queues a second file while the first is streaming', async () => {
    const { dc, session } = setup();
    const first = new File([new Uint8Array(1024)], 'one.bin', {
      type: 'application/octet-stream',
    });
    const second = new File([new Uint8Array(1024)], 'two.bin', {
      type: 'application/octet-stream',
    });
    session.sendMeta([first, second]);
    dc.sent = [];

    session.handleFileRequest(0);
    session.handleFileRequest(1);

    await vi.waitFor(() => {
      const metadata = dc.sent.filter(
        (entry) => typeof entry === 'string' && entry.includes('file-metadata'),
      );
      expect(metadata).toHaveLength(2);
    });

    const names = dc.sent
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => JSON.parse(entry) as { kind: string; name?: string })
      .filter((message) => message.kind === 'file-metadata')
      .map((message) => message.name);
    expect(names).toEqual(['one.bin', 'two.bin']);
  });

  it('waits for backpressure to drain before sending more chunks', async () => {
    const { dc, events, session } = setup();
    const file = new File([new Uint8Array(130 * 1024)], 'big.bin', {
      type: 'application/octet-stream',
    });
    session.sendMeta([file]);
    dc.sent = [];
    dc.bufferedAmount = 300 * 1024;

    session.handleFileRequest(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(binaryChunks(dc)).toHaveLength(0);

    dc.bufferedAmount = 0;
    dc.dispatchEvent(new Event('bufferedamountlow'));

    await vi.waitFor(() => {
      expect(events.onTransferComplete).toHaveBeenCalledTimes(1);
    });
    expect(binaryChunks(dc)).toHaveLength(3);
  });

  it('stops cleanly when the channel closes mid-stream', async () => {
    const { dc, events, session } = setup();
    const file = new File([new Uint8Array(300 * 1024)], 'big.bin', {
      type: 'application/octet-stream',
    });
    session.sendMeta([file]);
    dc.sent = [];
    dc.bufferedAmount = 512 * 1024;

    session.handleFileRequest(0);
    await Promise.resolve();
    await Promise.resolve();

    dc.readyState = 'closed';
    dc.dispatchEvent(new Event('statechange'));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(events.onTransferComplete).not.toHaveBeenCalled();
    expect(binaryChunks(dc)).toHaveLength(0);
  });
});
