/**
 * Data-channel file/text transfer protocol + chunked send/receive.
 *
 * Backpressure is driven by the `bufferedamountlow` event (no setInterval
 * polling). Files are streamed in 64KB chunks; text is sent as a single
 * control message.
 *
 * Everything the peer sends is untrusted: control messages are validated by
 * `parseTransferMessage` before they touch the session state, the receive
 * buffer is capped by the announced size, and a CRC-32 over the transferred
 * bytes is checked before a file is handed to the UI.
 */

import type { FileDescriptor, SignalingMessage } from '../types';
import {
  Crc32,
  MAX_FILES_PER_TRANSFER,
  MAX_TEXT_BYTES,
  MAX_TRANSFER_BYTES,
  parseTransferMessage,
  truncateToBytes,
} from './protocol';

export type TransferEvents = {
  onProgress: (progress: number) => void;
  onTransferComplete: () => void;
  onFileComplete?: (index: number, file: File) => void;
  onFileAcknowledged?: (index: number) => void;
  onFileDescriptorsReceived?: (files: FileDescriptor[]) => void;
  onTextReceived?: (text: string) => void;
  /** Raised when the peer breaks the protocol or a resource limit is hit. */
  onProtocolError?: (message: string) => void;
};

const CHUNK_SIZE = 64 * 1024;
const BUFFER_HIGH_WATER = 256 * 1024;
const BUFFER_LOW_WATER = 64 * 1024;
const PROGRESS_EVERY = 50;

export class TransferSession {
  private dc: RTCDataChannel;
  private events: TransferEvents;

  private receiveBuffer: ArrayBuffer[] = [];
  private receivedSize = 0;
  private receivedCrc = new Crc32();
  private receivedChunksSinceProgress = 0;
  private metadata: FileDescriptor | null = null;
  private pendingFileList: File[] | null = null;
  private pendingFileDescriptors: FileDescriptor[] = [];
  private isProcessingTransfer = false;
  private currentProcessingIndex = -1;
  private pendingFileIndicesQueue: number[] = [];

  constructor(dc: RTCDataChannel, events: TransferEvents) {
    this.dc = dc;
    this.events = events;
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = BUFFER_LOW_WATER;
    dc.onmessage = (e) => this.onMessage(e.data);
  }

  private onMessage(data: unknown): void {
    if (typeof data === 'string') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch (err) {
        console.warn('[transfer] bad control message:', err);
        return;
      }
      const msg = parseTransferMessage(parsed);
      if (!msg) {
        console.warn('[transfer] rejected control message with an unexpected shape');
        return;
      }
      this.handleControl(msg);
    } else {
      this.handleBinary(data);
    }
  }

  private handleControl(msg: SignalingMessage): void {
    switch (msg.kind) {
      case 'file-metadata':
        if (this.isProcessingTransfer) {
          console.warn('[transfer] ignored metadata during an active transfer');
          return;
        }
        this.metadata = { name: msg.name, size: msg.size, type: msg.type, index: msg.index };
        this.receiveBuffer = [];
        this.receivedSize = 0;
        this.receivedCrc = new Crc32();
        break;
      case 'transfer-complete': {
        if (this.isProcessingTransfer || !this.metadata) return;
        if (this.receivedSize !== this.metadata.size) return;
        if (msg.crc !== undefined && msg.crc !== this.receivedCrc.value) {
          this.failCurrentTransfer('Received file failed the integrity check');
          return;
        }
        this.isProcessingTransfer = true;
        const file = new File([new Blob(this.receiveBuffer)], this.metadata.name, {
          type: this.metadata.type,
        });
        const fileIndex =
          msg.fileIndex >= 0 && msg.fileIndex < this.pendingFileDescriptors.length
            ? msg.fileIndex
            : this.pendingFileDescriptors.findIndex((f) => f.name === this.metadata!.name);
        if (fileIndex >= 0) {
          this.events.onFileComplete?.(fileIndex, file);
          this.send({ kind: 'file-acknowledged', index: fileIndex });
        }
        this.events.onProgress(100);
        this.events.onTransferComplete();
        this.metadata = null;
        this.receiveBuffer = [];
        this.receivedSize = 0;
        this.isProcessingTransfer = false;
        break;
      }
      case 'file-descriptors':
        this.pendingFileDescriptors = msg.files;
        this.events.onFileDescriptorsReceived?.(msg.files);
        break;
      case 'file-request':
        this.handleFileRequest(msg.index);
        break;
      case 'file-acknowledged':
        this.events.onFileAcknowledged?.(msg.index);
        break;
      case 'text': {
        const text = truncateToBytes(msg.text, MAX_TEXT_BYTES);
        if (text !== msg.text) console.warn('[transfer] received text was truncated');
        this.events.onTextReceived?.(text);
        break;
      }
    }
  }

  private handleBinary(data: unknown): void {
    if (!this.metadata) return;
    // binaryType is 'arraybuffer', so a payload is always a buffer.
    const buffer = toArrayBuffer(data);
    if (!buffer) {
      console.warn('[transfer] ignored a payload that is not binary data');
      return;
    }
    if (this.receivedSize + buffer.byteLength > this.metadata.size) {
      this.failCurrentTransfer('Peer sent more data than it announced');
      return;
    }
    this.receivedCrc.update(new Uint8Array(buffer));
    this.receiveBuffer.push(buffer);
    this.receivedSize += buffer.byteLength;
    this.receivedChunksSinceProgress++;
    if (this.receivedChunksSinceProgress >= PROGRESS_EVERY || this.receivedSize >= this.metadata.size) {
      this.events.onProgress(Math.min((this.receivedSize / this.metadata.size) * 100, 99));
      this.receivedChunksSinceProgress = 0;
    }
  }

  /** Drop the file currently being received and report the violation. */
  private failCurrentTransfer(reason: string): void {
    this.metadata = null;
    this.receiveBuffer = [];
    this.receivedSize = 0;
    this.receivedCrc = new Crc32();
    this.isProcessingTransfer = false;
    this.events.onProtocolError?.(reason);
  }

  // ─── Sender API ─────────────────────────────────────────────────────────

  sendMeta(files: FileList | File[]): void {
    const fileArray = files instanceof FileList ? Array.from(files) : files;
    if (fileArray.length > MAX_FILES_PER_TRANSFER) {
      this.events.onProtocolError?.(
        `A transfer can carry at most ${MAX_FILES_PER_TRANSFER} files`,
      );
      return;
    }
    const oversized = fileArray.find((file) => file.size > MAX_TRANSFER_BYTES);
    if (oversized) {
      this.events.onProtocolError?.(`"${oversized.name}" is larger than the transfer limit`);
      return;
    }
    this.pendingFileList = fileArray;
    if (this.dc.readyState !== 'open' || fileArray.length === 0) return;
    const descriptors: FileDescriptor[] = fileArray.map((file, idx) => ({
      name: file.name,
      size: file.size,
      type: file.type,
      index: idx,
    }));
    this.pendingFileDescriptors = descriptors;
    this.send({ kind: 'file-descriptors', files: descriptors });
  }

  sendText(text: string): void {
    if (this.dc.readyState !== 'open') return;
    const payload = truncateToBytes(text, MAX_TEXT_BYTES);
    if (payload !== text) console.warn('[transfer] text too large, truncating');
    this.send({ kind: 'text', text: payload });
  }

  requestFile(index: number): void {
    if (this.dc.readyState !== 'open') return;
    this.send({ kind: 'file-request', index });
  }

  handleFileRequest(index: number): void {
    if (this.dc.readyState !== 'open') return;
    if (this.currentProcessingIndex === index) return;
    if (this.isProcessingTransfer) {
      if (
        !this.pendingFileIndicesQueue.includes(index) &&
        this.pendingFileIndicesQueue.length < MAX_FILES_PER_TRANSFER
      ) {
        this.pendingFileIndicesQueue.push(index);
      }
      return;
    }
    const file = this.pendingFileList?.[index];
    if (!file) return;
    this.currentProcessingIndex = index;
    this.isProcessingTransfer = true;
    void this.sendFileChunked(file, index);
  }

  private async sendFileChunked(file: File, fileIndex: number): Promise<void> {
    if (this.dc.readyState !== 'open') {
      this.isProcessingTransfer = false;
      return;
    }
    this.send({
      kind: 'file-metadata',
      name: file.name,
      size: file.size,
      type: file.type,
      index: fileIndex,
    });

    let offset = 0;
    let chunksSinceProgress = 0;
    const crc = new Crc32();
    try {
      while (offset < file.size) {
        if (this.dc.readyState !== 'open') break;
        if (this.dc.bufferedAmount > BUFFER_HIGH_WATER) {
          await this.waitForDrain();
        }
        if (this.dc.readyState !== 'open') break;
        const slice = file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size));
        const buffer = await slice.arrayBuffer();
        this.dc.send(buffer);
        crc.update(new Uint8Array(buffer));
        offset += buffer.byteLength;
        chunksSinceProgress++;
        if (chunksSinceProgress >= PROGRESS_EVERY) {
          this.events.onProgress(Math.min((offset / file.size) * 100, 99));
          chunksSinceProgress = 0;
        }
      }

      if (offset >= file.size) {
        this.send({ kind: 'transfer-complete', fileIndex, crc: crc.value });
        this.events.onProgress(100);
        this.events.onTransferComplete();
      }
    } catch (err) {
      console.error('[transfer] sendFileChunked failed:', err);
    } finally {
      this.isProcessingTransfer = false;
      this.currentProcessingIndex = -1;
    }

    const next = this.pendingFileIndicesQueue.shift();
    if (next !== undefined) this.handleFileRequest(next);
  }

  private waitForDrain(): Promise<void> {
    return new Promise<void>((resolve) => {
      const dc = this.dc;
      const onLow = () => cleanup();
      const onStateChange = () => {
        if (dc.readyState !== 'open') cleanup();
      };
      const cleanup = () => {
        dc.removeEventListener('bufferedamountlow', onLow);
        dc.removeEventListener('statechange', onStateChange);
        resolve();
      };
      dc.addEventListener('bufferedamountlow', onLow);
      dc.addEventListener('statechange', onStateChange);
    });
  }

  private send(msg: SignalingMessage): void {
    if (this.dc.readyState === 'open') this.dc.send(JSON.stringify(msg));
  }
}

/** Narrow a data-channel payload to an ArrayBuffer. */
function toArrayBuffer(data: unknown): ArrayBuffer | null {
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice().buffer;
  }
  // `instanceof ArrayBuffer` is unreliable across realms (jsdom, workers),
  // so the brand check is used instead.
  if (Object.prototype.toString.call(data) === '[object ArrayBuffer]') {
    return new Uint8Array(data as ArrayBuffer).buffer;
  }
  return null;
}
