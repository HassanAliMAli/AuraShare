/** Ordered, bounded file/text transfers with per-attempt framing and acknowledgements. */
import type { FileDescriptor } from '../types';
import { Crc32, MAX_FILES_PER_TRANSFER, MAX_TEXT_BYTES, MAX_TRANSFER_BYTES, parseTransferMessage } from './protocol';
import { HEADER_BYTES, frameChunk, newTransferId, parseControl, readChunk, type Control } from './transfer-protocol';
import { abortError } from './async';

export type TransferEvents = {
  onProgress: (progress: number) => void;
  onTransferComplete: () => void;
  onReady?: () => void;
  onFileComplete?: (index: number, file: File) => void;
  onFileAcknowledged?: (index: number) => void;
  onFileDescriptorsReceived?: (files: FileDescriptor[]) => void;
  onTextReceived?: (text: string) => void;
  onTextAcknowledged?: () => void;
  onTransferFailed?: (index: number, message: string) => void;
  onProtocolError?: (message: string) => void;
};
type Attempt = {
  id: string; index: number; media: 'file' | 'text'; size: number;
  stage: 'requested' | 'transferring' | 'awaiting-ack';
  bytes: number; sequence: number; crc: Crc32; buffers: ArrayBuffer[];
  lastProgress: number; abort: AbortController; timer: ReturnType<typeof setTimeout> | null;
};
const INACTIVITY_MS = 120_000;
const RESPONSE_MS = 30_000;
const HIGH_WATER = 256 * 1024;
const LOW_WATER = 64 * 1024;

export class TransferSession {
  private readonly dc: RTCDataChannel;
  private readonly events: TransferEvents;
  private readonly options: { maxMessageSize?: () => number; role?: 'sender' | 'receiver' };
  private files: File[] = [];
  private descriptors: FileDescriptor[] = [];
  private incoming: Attempt | null = null;
  private outgoing: Attempt | null = null;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private ready = false;
  private disposed = false;
  private paused = false;
  private readonly resumeWaiters = new Set<() => void>();
  private lastIncomingId: string | null = null;

  constructor(dc: RTCDataChannel, events: TransferEvents, options: { maxMessageSize?: () => number; role?: 'sender' | 'receiver' } = {}) {
    this.dc = dc; this.events = events; this.options = options;
    dc.binaryType = 'arraybuffer'; dc.bufferedAmountLowThreshold = LOW_WATER;
    dc.onmessage = (event) => this.onMessage(event.data);
  }
  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.handshakeTimer = setTimeout(() => this.fatal('Update or reload AuraShare on both devices'), 10_000);
    try { this.control({ v: 2, kind: 'hello' }); } catch { this.fatal('Could not start the transfer protocol'); }
  }
  private maxFrame(): number {
    const max = this.options.maxMessageSize?.() ?? 65536;
    return max === Infinity ? 65536 : Math.min(max, 65536);
  }
  private control(message: Control): void {
    if (this.disposed || this.dc.readyState !== 'open') throw abortError();
    const json = JSON.stringify(message);
    if (new TextEncoder().encode(json).byteLength > this.maxFrame()) throw new Error('Peer message limit is too small');
    this.dc.send(json);
  }
  private attempt(id: string, index: number, media: 'file' | 'text', size: number): Attempt {
    return { id, index, media, size, stage: 'requested', bytes: 0, sequence: 0,
      crc: new Crc32(), buffers: [], lastProgress: 0, abort: new AbortController(), timer: null };
  }
  private watch(attempt: Attempt, ms = INACTIVITY_MS): void {
    if (attempt.timer !== null) clearTimeout(attempt.timer);
    attempt.timer = setTimeout(() => this.fail(attempt, 'Transfer timed out. Retry the file.'), ms);
  }
  private release(attempt: Attempt): void {
    if (attempt.timer !== null) clearTimeout(attempt.timer);
    attempt.abort.abort(); attempt.buffers = [];
    if (this.incoming === attempt) this.incoming = null;
    if (this.outgoing === attempt) this.outgoing = null;
  }
  private fail(attempt: Attempt, reason: string, notify = true): void {
    if (this.incoming !== attempt && this.outgoing !== attempt) return;
    this.release(attempt);
    if (notify && !this.disposed && this.dc.readyState === 'open') {
      try { this.control({ v: 2, kind: 'failed', id: attempt.id, reason: reason.slice(0, 200) }); } catch { /* transport owns its error */ }
    }
    if (!this.disposed) this.events.onTransferFailed?.(attempt.index, reason);
  }
  private fatal(reason: string): void {
    if (this.disposed) return;
    this.dispose(); this.events.onProtocolError?.(reason);
  }
  private onMessage(data: unknown): void {
    if (this.disposed) return;
    try {
      if (typeof data !== 'string') { this.binary(data); return; }
      if (new TextEncoder().encode(data).byteLength > this.maxFrame()) { this.fatal('Oversized control message'); return; }
      const raw: unknown = JSON.parse(data);
      const message = parseControl(raw);
      if (!message) {
        this.fatal(parseTransferMessage(raw)
          ? 'Unsupported transfer protocol. Reload both devices.'
          : 'Invalid transfer control message');
        return;
      }
      if (message.kind === 'hello') {
        if (!this.started) this.start();
        if (!this.ready) {
          this.ready = true;
          if (this.handshakeTimer !== null) clearTimeout(this.handshakeTimer);
          this.handshakeTimer = null; this.events.onReady?.();
        }
        return;
      }
      if (!this.ready) { this.fatal('Transfer started before version negotiation'); return; }
      this.handle(message);
    } catch { this.fatal('Invalid transfer data or unavailable channel'); }
  }
  private handle(message: Exclude<Control, { kind: 'hello' }>): void {
    switch (message.kind) {
      case 'descriptors':
        if (this.options.role === 'sender' || this.incoming || this.descriptors.length) { this.fatal('Unexpected file list'); return; }
        this.descriptors = message.files; this.events.onFileDescriptorsReceived?.(message.files); return;
      case 'request': this.handleFileRequest(message.index, message.id); return;
      case 'start': {
        if (message.media === 'text') {
          if (this.options.role === 'sender' || this.incoming || this.descriptors.length) { this.fatal('Unexpected text transfer'); return; }
          this.incoming = this.attempt(message.id, -1, 'text', message.size);
        }
        const attempt = this.incoming;
        if (!attempt || attempt.id !== message.id) return; // late frame from a cancelled attempt
        const descriptor = this.descriptors[message.index];
        if (attempt.stage !== 'requested' || attempt.index !== message.index ||
          (message.media === 'file' && (!descriptor || descriptor.size !== message.size))) {
          this.fatal('File metadata does not match the requested file'); return;
        }
        attempt.size = message.size; attempt.stage = 'transferring'; this.watch(attempt); return;
      }
      case 'complete': {
        const attempt = this.incoming;
        if (!attempt || attempt.id !== message.id) return;
        if (attempt.stage !== 'transferring' || attempt.bytes !== attempt.size ||
          attempt.sequence !== message.chunks || attempt.crc.value !== message.crc) {
          this.fail(attempt, 'Received data failed its size or integrity check'); return;
        }
        let text: string | null = null;
        let file: File | null = null;
        if (attempt.media === 'text') {
          const bytes = new Uint8Array(attempt.size);
          let offset = 0;
          for (const buffer of attempt.buffers) { bytes.set(new Uint8Array(buffer), offset); offset += buffer.byteLength; }
          try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
          catch { this.fail(attempt, 'Received text is not valid UTF-8'); return; }
        } else {
          const descriptor = this.descriptors[attempt.index];
          if (!descriptor) { this.fatal('Unknown file'); return; }
          file = new File(attempt.buffers, descriptor.name, { type: descriptor.type });
        }
        this.control({ v: 2, kind: 'ack', id: attempt.id });
        this.lastIncomingId = attempt.id;
        this.release(attempt);
        this.events.onProgress(100);
        if (file) this.events.onFileComplete?.(attempt.index, file);
        if (text !== null) this.events.onTextReceived?.(text);
        this.events.onTransferComplete(); return;
      }
      case 'ack': {
        const attempt = this.outgoing;
        if (!attempt || attempt.id !== message.id || attempt.stage !== 'awaiting-ack') return;
        this.release(attempt); this.events.onProgress(100);
        if (attempt.media === 'file') this.events.onFileAcknowledged?.(attempt.index);
        else this.events.onTextAcknowledged?.();
        this.events.onTransferComplete(); return;
      }
      case 'failed': case 'cancel': {
        const attempt = this.incoming?.id === message.id ? this.incoming : this.outgoing?.id === message.id ? this.outgoing : null;
        if (attempt) this.fail(attempt, message.reason || 'Transfer cancelled', false);
        else if (this.lastIncomingId === message.id) {
          // ACK was lost: retry is safe because every subsequent attempt has a new ID.
          this.lastIncomingId = null;
        }
        return;
      }
    }
  }
  private binary(data: unknown): void {
    const chunk = readChunk(data);
    if (!chunk) { this.fatal('Invalid binary frame'); return; }
    const attempt = this.incoming;
    if (!attempt || attempt.id !== chunk.id) return;
    if (attempt.stage !== 'transferring' || attempt.sequence !== chunk.sequence ||
      attempt.bytes + chunk.payload.byteLength > attempt.size) { this.fatal('Unexpected transfer chunk'); return; }
    attempt.crc.update(new Uint8Array(chunk.payload)); attempt.buffers.push(chunk.payload);
    attempt.bytes += chunk.payload.byteLength; attempt.sequence++; this.watch(attempt);
    this.progress(attempt);
  }
  private progress(attempt: Attempt): void {
    const now = Date.now();
    if (now - attempt.lastProgress >= 100 || attempt.bytes === attempt.size) {
      attempt.lastProgress = now;
      this.events.onProgress(Math.min(99, attempt.size ? attempt.bytes / attempt.size * 100 : 0));
    }
  }
  sendMeta(files: FileList | File[]): void {
    const list = Array.from(files);
    if (list.length > MAX_FILES_PER_TRANSFER || list.some((file) => file.size > MAX_TRANSFER_BYTES)) {
      this.fatal('File count or size exceeds the transfer limit'); return;
    }
    this.files = list;
    if (!list.length) return;
    if (!this.ready) { this.fatal('Peer protocol is not ready'); return; }
    try { this.control({ v: 2, kind: 'descriptors', files: list.map((file, index) => ({ name: file.name, size: file.size, type: file.type, index })) }); }
    catch { this.fatal('Could not send file list'); }
  }
  sendText(text: string): void {
    const bytes = new TextEncoder().encode(text);
    if (bytes.byteLength > MAX_TEXT_BYTES) { this.events.onTransferFailed?.(-1, 'Text exceeds the 1 MiB limit'); return; }
    if (!this.ready || this.outgoing) return;
    const attempt = this.attempt(newTransferId(), -1, 'text', bytes.byteLength);
    this.outgoing = attempt;
    void this.sendPayload(attempt, new Blob([bytes]));
  }
  requestFile(index: number): void {
    if (!this.ready || this.incoming || !this.descriptors[index]) return;
    const attempt = this.attempt(newTransferId(), index, 'file', this.descriptors[index].size);
    this.incoming = attempt; this.watch(attempt, RESPONSE_MS);
    try { this.control({ v: 2, kind: 'request', id: attempt.id, index }); }
    catch { this.fail(attempt, 'Could not request the file'); }
  }
  handleFileRequest(index: number, id = newTransferId()): void {
    const file = this.files[index];
    if (!file || this.options.role === 'receiver') { this.fatal('Unknown requested file'); return; }
    if (this.outgoing?.id === id) return;
    if (this.outgoing) {
      this.control({ v: 2, kind: 'failed', id, reason: 'Another transfer is still active. Retry shortly.' }); return;
    }
    const attempt = this.attempt(id, index, 'file', file.size);
    this.outgoing = attempt; void this.sendPayload(attempt, file);
  }
  private async sendPayload(attempt: Attempt, blob: Blob): Promise<void> {
    try {
      this.watch(attempt);
      await this.waitUntilResumed(attempt.abort.signal);
      this.control({ v: 2, kind: 'start', id: attempt.id, index: attempt.index, media: attempt.media, size: attempt.size });
      attempt.stage = 'transferring';
      const payloadSize = Math.min(16 * 1024, this.maxFrame() - HEADER_BYTES);
      if (payloadSize < 1) throw new Error('Peer message limit too small');
      while (attempt.bytes < blob.size) {
        await this.waitUntilResumed(attempt.abort.signal);
        if (this.dc.bufferedAmount > HIGH_WATER) await this.waitForDrain(attempt.abort.signal);
        attempt.abort.signal.throwIfAborted();
        const buffer = await blob.slice(attempt.bytes, attempt.bytes + payloadSize).arrayBuffer();
        attempt.abort.signal.throwIfAborted();
        await this.waitUntilResumed(attempt.abort.signal);
        this.dc.send(frameChunk(attempt.id, attempt.sequence, buffer));
        attempt.crc.update(new Uint8Array(buffer)); attempt.bytes += buffer.byteLength; attempt.sequence++;
        this.watch(attempt); this.progress(attempt);
      }
      attempt.stage = 'awaiting-ack'; this.watch(attempt, RESPONSE_MS);
      this.control({ v: 2, kind: 'complete', id: attempt.id, crc: attempt.crc.value, chunks: attempt.sequence });
    } catch {
      if (!this.disposed && this.outgoing === attempt) this.fail(attempt, 'File or text could not be sent. Retry the transfer.');
    }
  }
  private waitForDrain(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.dc.removeEventListener('bufferedamountlow', low);
        for (const name of ['closing', 'close', 'error']) this.dc.removeEventListener(name, failed);
        signal.removeEventListener('abort', failed);
      };
      const low = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(abortError()); };
      this.dc.addEventListener('bufferedamountlow', low);
      for (const name of ['closing', 'close', 'error']) this.dc.addEventListener(name, failed);
      signal.addEventListener('abort', failed, { once: true });
      if (signal.aborted || this.dc.readyState !== 'open') failed();
      else if (this.dc.bufferedAmount <= LOW_WATER) low();
    });
  }
  private waitUntilResumed(signal: AbortSignal): Promise<void> {
    if (signal.aborted || this.disposed) return Promise.reject(abortError());
    if (!this.paused) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = () => { this.resumeWaiters.delete(finish); signal.removeEventListener('abort', abort); resolve(); };
      const abort = () => { this.resumeWaiters.delete(finish); signal.removeEventListener('abort', abort); reject(abortError()); };
      this.resumeWaiters.add(finish); signal.addEventListener('abort', abort, { once: true });
    });
  }
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) for (const resolve of [...this.resumeWaiters]) resolve();
  }
  cancelCurrent(): void {
    const attempt = this.incoming ?? this.outgoing;
    if (!attempt) return;
    try { this.control({ v: 2, kind: 'cancel', id: attempt.id, reason: 'Transfer cancelled' }); } catch { /* close may already be underway */ }
    this.fail(attempt, 'Transfer cancelled', false);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.handshakeTimer !== null) clearTimeout(this.handshakeTimer);
    if (this.incoming) this.release(this.incoming);
    if (this.outgoing) this.release(this.outgoing);
    this.dc.onmessage = null; this.files = []; this.descriptors = [];
    this.resumeWaiters.clear();
  }
}
