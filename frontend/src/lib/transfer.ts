/** Ordered, bounded file/text transfers with per-attempt framing and acknowledgements. */
import type { FileDescriptor } from '../types';
import { Crc32, MAX_FILES_PER_TRANSFER, MAX_TEXT_BYTES, MAX_TRANSFER_BYTES, parseTransferMessage } from './protocol';
import { DIRECT_HEADER_BYTES, HEADER_BYTES, LEGACY_CHUNK_BYTES, MAX_CHUNK_BYTES, frameChunk, newTransferId, parseControl, readChunk, type Control } from './transfer-protocol';
import { abortError } from './async';
import { ReceiveBuffer } from './receive-buffer';
import { DirectSave, saveError, supportsDirectSave, fingerprintFile } from './direct-save';
import { MAX_DIRECT_FILE_SIZE } from './validation';

export type TransferEvents = {
  onProgress: (progress: number) => void;
  onReady?: () => void;
  onDirectSaved?: (index: number, warning?: string) => void;
  onDirectSettled?: (error?: string) => void;
  onDirectAvailability?: (available: boolean) => void;
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
  bytes: number; sequence: number; crc: Crc32; buffer: ReceiveBuffer | null;
  direct: boolean; destination?: DirectSave; writing?: boolean;
  credit?: () => void;
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
  /** Largest payload the peer said it accepts; legacy peers keep 16 KiB. */
  private peerChunk = LEGACY_CHUNK_BYTES;
  private peerResume = false;
  private peerDirect = false;
  private peerReceiveDirect = false;
  private readonly receiveDirect = supportsDirectSave();
  private partial: Attempt | null = null;
  private readonly resumeWaiters = new Set<() => void>();
  private lastIncomingId: string | null = null;
  private readonly recentRequests = new Set<string>();

  constructor(dc: RTCDataChannel, events: TransferEvents, options: { maxMessageSize?: () => number; role?: 'sender' | 'receiver' } = {}) {
    this.dc = dc; this.events = events; this.options = options;
    dc.binaryType = 'arraybuffer'; dc.bufferedAmountLowThreshold = LOW_WATER;
    dc.onmessage = (event) => this.onMessage(event.data);
  }
  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.handshakeTimer = setTimeout(() => this.fatal('Update or reload AuraShare on both devices'), 10_000);
    try { this.control({ v: 2, kind: 'hello', maxChunk: MAX_CHUNK_BYTES, resume: true, direct: true, receiveDirect: this.receiveDirect }); } catch { this.fatal('Could not start the transfer protocol'); }
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
      crc: new Crc32(), direct: false, buffer: null, lastProgress: 0, abort: new AbortController(), timer: null };
  }
  private watch(attempt: Attempt, ms = INACTIVITY_MS): void {
    if (attempt.timer !== null) clearTimeout(attempt.timer);
    attempt.timer = setTimeout(() => this.fail(attempt, 'Transfer timed out. Retry the file.'), ms);
  }
  private release(attempt: Attempt): void {
    if (attempt.timer !== null) clearTimeout(attempt.timer);
    if (attempt.destination) {
      void attempt.destination.abort().then(
        () => this.events.onDirectSettled?.(),
        (error: unknown) => this.events.onDirectSettled?.(saveError(error)),
      );
      attempt.destination = undefined;
    }
    attempt.abort.abort(); attempt.buffer?.clear(); attempt.buffer = null;
    if (this.incoming === attempt) this.incoming = null;
    if (this.outgoing === attempt) this.outgoing = null;
  }
  private fail(attempt: Attempt, reason: string, notify = true): void {
    if (this.incoming !== attempt && this.outgoing !== attempt) return;
    if (this.incoming === attempt && attempt.media === 'file' && attempt.buffer && attempt.bytes > 0 && this.peerResume) {
      if (this.partial) this.partial.buffer?.clear();
      if (attempt.timer !== null) clearTimeout(attempt.timer);
      attempt.abort.abort();
      this.incoming = null;
      this.partial = attempt;
    } else this.release(attempt);
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
        if (this.ready) return;
        if (message.maxChunk !== undefined) this.peerChunk = message.maxChunk;
        this.peerDirect = message.direct === true;
        this.peerReceiveDirect = this.peerDirect && message.receiveDirect === true;
        this.events.onDirectAvailability?.(this.receiveDirect && this.peerDirect);
        this.peerResume = message.resume === true;
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
        if ((!this.receiveDirect || !this.peerDirect) && message.files.some((file) => file.size > MAX_TRANSFER_BYTES)) {
          this.fatal('The peer announced a file above the 256 MiB receive limit'); return;
        }
        this.descriptors = message.files; this.events.onFileDescriptorsReceived?.(message.files); return;
      case 'request': this.handleFileRequest(message.index, message.id, message.offset, message.crc); return;
      case 'direct-request':
        this.handleFileRequest(message.index, message.id, message.offset, 0, true, message.digest, message.fingerprint); return;
      case 'credit': {
        const attempt = this.outgoing;
        if (!attempt || attempt.id !== message.id) return;
        if (!attempt.direct || !attempt.credit || message.sequence !== attempt.sequence) {
          this.fail(attempt, 'Unexpected write acknowledgement'); return;
        }
        attempt.credit();
        return;
      }
      case 'start': {
        if (message.media === 'text') {
          if (this.options.role === 'sender' || this.incoming || this.descriptors.length) { this.fatal('Unexpected text transfer'); return; }
          this.incoming = this.attempt(message.id, -1, 'text', message.size);
        }
        const attempt = this.incoming;
        if (!attempt || attempt.id !== message.id || (attempt.destination && attempt.stage === 'awaiting-ack')) return; // late frame from a cancelled attempt
        const descriptor = this.descriptors[message.index];
        if (attempt.stage !== 'requested' || attempt.media !== message.media || attempt.index !== message.index ||
          (message.media === 'file' && (!descriptor || descriptor.size !== message.size))) {
          this.fatal('File metadata does not match the requested file'); return;
        }
        if (attempt.destination) {
          if (!message.fingerprint || (attempt.destination.fingerprint && attempt.destination.fingerprint !== message.fingerprint)) {
            this.fail(attempt, 'The sender did not confirm the expected file fingerprint'); return;
          }
          attempt.destination.setFingerprint(message.fingerprint);
        }
        attempt.size = message.size;
        if (!attempt.direct) attempt.buffer ??= new ReceiveBuffer(message.size);
        attempt.stage = 'transferring'; this.watch(attempt); return;
      }
      case 'complete': {
        const attempt = this.incoming;
        if (!attempt || attempt.id !== message.id) return;
        if (attempt.stage === 'awaiting-ack') return;
        if (attempt.stage !== 'transferring' || attempt.writing || attempt.bytes !== attempt.size ||
          attempt.sequence !== message.chunks || attempt.crc.value !== message.crc) {
          // Corrupt or incomplete data must never be retained as a resume prefix.
          attempt.buffer?.clear(); attempt.buffer = null;
          if (attempt.destination) {
            const destination = attempt.destination;
            attempt.destination = undefined;
            void destination.abort(true).then(
              () => this.events.onDirectSettled?.(),
              (error: unknown) => this.events.onDirectSettled?.(saveError(error)),
            );
          }
          this.fail(attempt, 'Received data failed its size or integrity check'); return;
        }
        if (attempt.destination) {
          attempt.stage = 'awaiting-ack';
          if (attempt.timer !== null) clearTimeout(attempt.timer);
          void this.finishDirect(attempt, attempt.destination);
          return;
        }
        let text: string | null = null;
        let file: File | null = null;
        if (attempt.media === 'text') {
          const bytes = new Uint8Array(attempt.size);
          let offset = 0;
          for (const buffer of attempt.buffer!.parts()) { bytes.set(new Uint8Array(buffer), offset); offset += buffer.byteLength; }
          try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
          catch { this.fail(attempt, 'Received text is not valid UTF-8'); return; }
        } else {
          const descriptor = this.descriptors[attempt.index];
          if (!descriptor) { this.fatal('Unknown file'); return; }
          try { file = new File(attempt.buffer!.parts(), descriptor.name, { type: descriptor.type }); }
          catch { this.fail(attempt, 'Not enough memory to assemble this file. Try a smaller file.'); return; }
        }
        this.control({ v: 2, kind: 'ack', id: attempt.id });
        this.lastIncomingId = attempt.id;
        this.release(attempt);
        this.events.onProgress(100);
        if (file) this.events.onFileComplete?.(attempt.index, file);
        if (text !== null) this.events.onTextReceived?.(text);
        return;
      }
      case 'ack': {
        const attempt = this.outgoing;
        if (!attempt || attempt.id !== message.id || attempt.stage !== 'awaiting-ack') return;
        this.release(attempt); this.events.onProgress(100);
        if (attempt.media === 'file') this.events.onFileAcknowledged?.(attempt.index);
        else this.events.onTextAcknowledged?.();
        return;
      }
      case 'failed': case 'cancel': {
        const attempt = this.incoming?.id === message.id ? this.incoming : this.outgoing?.id === message.id ? this.outgoing : null;
        if (attempt && !(attempt.destination && attempt.stage === 'awaiting-ack')) {
          if (attempt === this.incoming && attempt.stage === 'requested') {
            attempt.buffer?.clear(); attempt.buffer = null;
          }
          this.fail(attempt, message.reason || 'Transfer cancelled', false);
        }
        else if (this.lastIncomingId === message.id) {
          // ACK was lost: retry is safe because every subsequent attempt has a new ID.
          this.lastIncomingId = null;
        }
        return;
      }
    }
  }
  private binary(data: unknown): void {
    const chunk = readChunk(data, this.incoming?.direct ? this.incoming.id : undefined);
    if (!chunk) { this.fatal('Invalid binary frame'); return; }
    const attempt = this.incoming;
    if (!attempt || attempt.id !== chunk.id) return;
    if (attempt.destination && attempt.stage === 'awaiting-ack') return;
    if (attempt.stage !== 'transferring' || attempt.writing || attempt.sequence !== chunk.sequence ||
      attempt.bytes + chunk.payload.byteLength > attempt.size) {
      attempt.buffer?.clear(); attempt.buffer = null;
      this.fail(attempt, 'Unexpected transfer chunk'); return;
    }
    if (attempt.destination) {
      attempt.crc.update(new Uint8Array(chunk.payload));
      if (attempt.crc.value !== chunk.crc) {
        this.fail(attempt, 'Received chunk failed its integrity check'); return;
      }
      attempt.writing = true;
      this.watch(attempt);
      void this.writeDirect(attempt, attempt.destination, chunk.payload);
      return;
    }
    try { attempt.buffer!.append(chunk.payload); }
    catch { this.fail(attempt, 'Not enough memory to receive this file. Try a smaller file.'); return; }
    attempt.crc.update(new Uint8Array(chunk.payload));
    attempt.bytes += chunk.payload.byteLength; attempt.sequence++; this.watch(attempt);
    this.progress(attempt);
  }
  private async writeDirect(attempt: Attempt, destination: DirectSave, payload: ArrayBuffer): Promise<void> {
    try {
      await destination.write(payload);
      if (this.incoming !== attempt) return;
      attempt.bytes += payload.byteLength;
      attempt.sequence++;
      attempt.writing = false;
      this.control({ v: 2, kind: 'credit', id: attempt.id, sequence: attempt.sequence });
      this.watch(attempt);
      this.progress(attempt);
    } catch (error) {
      this.fail(attempt, saveError(error));
    }
  }

  private async finishDirect(attempt: Attempt, destination: DirectSave): Promise<void> {
    try {
      const warning = await destination.finish();
      if (this.incoming !== attempt) return;
      attempt.destination = undefined;
      try { this.control({ v: 2, kind: 'ack', id: attempt.id }); }
      catch { /* The local file is committed even if the peer cannot receive its ACK. */ }
      this.lastIncomingId = attempt.id;
      this.release(attempt);
      this.events.onDirectSaved?.(attempt.index, warning);
    } catch (error) {
      this.fail(attempt, saveError(error));
    }
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
    if (list.length > MAX_FILES_PER_TRANSFER || list.some((file) => file.size > (this.peerReceiveDirect ? MAX_DIRECT_FILE_SIZE : MAX_TRANSFER_BYTES))) {
      this.fatal(this.peerReceiveDirect ? 'File count or size exceeds the transfer limit' : 'This receiver can receive files up to 256 MiB. Use a receiver that supports direct saving for larger files.'); return;
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
  requestFile(index: number, destination?: DirectSave): boolean {
    if (!this.ready || this.incoming || !this.descriptors[index] ||
        (destination ? !this.receiveDirect || !this.peerDirect : this.descriptors[index].size > MAX_TRANSFER_BYTES)) return false;
    const attempt = this.attempt(newTransferId(), index, 'file', this.descriptors[index].size);
    if (destination) {
      attempt.direct = true;
      attempt.destination = destination;
      attempt.bytes = destination.offset;
      attempt.crc = new Crc32(destination.checksum);
    } else if (this.partial?.index === index && this.peerResume) {
      attempt.buffer = this.partial.buffer; attempt.bytes = this.partial.bytes; attempt.crc = this.partial.crc;
      this.partial.buffer = null;
    }
    this.discardPartial();
    this.incoming = attempt; this.watch(attempt, destination ? INACTIVITY_MS : RESPONSE_MS);
    try { this.control(destination
      ? { v: 2, kind: 'direct-request', id: attempt.id, index, offset: destination.offset,
          ...(destination.offset ? { digest: destination.digest, fingerprint: destination.fingerprint } : {}) }
      : attempt.bytes > 0
      ? { v: 2, kind: 'request', id: attempt.id, index, offset: attempt.bytes, crc: attempt.crc.value }
      : { v: 2, kind: 'request', id: attempt.id, index }); }
    catch { this.fail(attempt, 'Could not request the file'); }
    return true;
  }
  handleFileRequest(index: number, id = newTransferId(), offset = 0, crc = 0, direct = false, digest?: string, fingerprint?: string): void {
    const file = this.files[index];
    if (!file || offset > file.size || this.options.role === 'receiver' ||
        (direct ? !this.peerReceiveDirect : file.size > MAX_TRANSFER_BYTES || (offset > 0 && !this.peerResume))) {
      this.control({ v: 2, kind: 'failed', id, reason: 'File request exceeds the negotiated receive capabilities' }); return;
    }
    if (this.recentRequests.has(id)) return;
    if (this.outgoing) {
      this.control({ v: 2, kind: 'failed', id, reason: 'Another transfer is still active. Retry shortly.' }); return;
    }
    this.recentRequests.add(id);
    if (this.recentRequests.size > 64) this.recentRequests.delete(this.recentRequests.values().next().value!);
    const attempt = this.attempt(id, index, 'file', file.size);
    attempt.bytes = offset; attempt.crc = new Crc32(crc);
    attempt.direct = direct;
    this.outgoing = attempt; void this.sendPayload(attempt, file, digest, fingerprint);
  }
  private async sendPayload(attempt: Attempt, blob: Blob, digest?: string, expectedFingerprint?: string): Promise<void> {
    try {
      this.watch(attempt);
      let fingerprint: string | undefined;
      if (attempt.direct || attempt.bytes > 0) {
        try {
          if (attempt.direct) {
            const result = await fingerprintFile(blob, attempt.bytes, digest, expectedFingerprint, attempt.abort.signal);
            fingerprint = result.fingerprint;
            attempt.crc = result.crc;
          }
          else {
            const crc = new Crc32();
            for (let offset = 0; offset < attempt.bytes; offset += MAX_CHUNK_BYTES) {
              attempt.abort.signal.throwIfAborted();
              crc.update(new Uint8Array(await blob.slice(offset, Math.min(offset + MAX_CHUNK_BYTES, attempt.bytes)).arrayBuffer()));
            }
            if (crc.value !== attempt.crc.value) throw new Error('The file prefix changed. Restart this file.');
          }
        } catch (error) {
          this.fail(attempt, saveError(error));
          return;
        }
      }
      await this.waitUntilResumed(attempt.abort.signal);
      this.control({ v: 2, kind: 'start', id: attempt.id, index: attempt.index, media: attempt.media, size: attempt.size, ...(fingerprint ? { fingerprint } : {}) });
      attempt.stage = 'transferring';
      const payloadSize = Math.min(MAX_CHUNK_BYTES, this.peerChunk, this.maxFrame() - (attempt.direct ? DIRECT_HEADER_BYTES : HEADER_BYTES));
      if (payloadSize < 1) throw new Error('Peer message limit too small');
      while (attempt.bytes < blob.size) {
        await this.waitUntilResumed(attempt.abort.signal);
        if (this.dc.bufferedAmount > HIGH_WATER) await this.waitForDrain(attempt.abort.signal);
        attempt.abort.signal.throwIfAborted();
        const buffer = await blob.slice(attempt.bytes, attempt.bytes + payloadSize).arrayBuffer();
        attempt.abort.signal.throwIfAborted();
        await this.waitUntilResumed(attempt.abort.signal);
        attempt.crc.update(new Uint8Array(buffer));
        this.dc.send(frameChunk(attempt.id, attempt.sequence, buffer, attempt.direct ? attempt.crc.value : undefined));
        attempt.bytes += buffer.byteLength; attempt.sequence++;
        this.watch(attempt);
        if (attempt.direct) await this.waitForCredit(attempt);
        this.progress(attempt);
      }
      attempt.stage = 'awaiting-ack'; this.watch(attempt, attempt.direct ? INACTIVITY_MS : RESPONSE_MS);
      this.control({ v: 2, kind: 'complete', id: attempt.id, crc: attempt.crc.value, chunks: attempt.sequence });
    } catch {
      if (!this.disposed && this.outgoing === attempt) this.fail(attempt, 'File or text could not be sent. Retry the transfer.');
    }
  }
  private waitForCredit(attempt: Attempt): Promise<void> {
    const signal = attempt.abort.signal;
    return new Promise((resolve, reject) => {
      const abort = () => { attempt.credit = undefined; reject(abortError()); };
      signal.addEventListener('abort', abort, { once: true });
      attempt.credit = () => {
        signal.removeEventListener('abort', abort);
        attempt.credit = undefined;
        resolve();
      };
      if (signal.aborted) abort();
    });
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
    if (!attempt || (attempt.destination && attempt.stage === 'awaiting-ack')) return;
    try { this.control({ v: 2, kind: 'cancel', id: attempt.id, reason: 'Transfer cancelled' }); } catch { /* close may already be underway */ }
    this.fail(attempt, 'Transfer cancelled', false);
  }
  discardPartial(): void { this.partial?.buffer?.clear(); this.partial = null; }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.handshakeTimer !== null) clearTimeout(this.handshakeTimer);
    // Let an already verified destination finish committing if the channel closes.
    if (this.incoming && !(this.incoming.destination && this.incoming.stage === 'awaiting-ack')) this.release(this.incoming);
    if (this.outgoing) this.release(this.outgoing);
    this.discardPartial();
    this.dc.onmessage = null; this.files = []; this.descriptors = [];
    this.resumeWaiters.clear(); this.recentRequests.clear();
  }
}
