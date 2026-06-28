/**
 * Data-channel file/text transfer protocol + chunked send/receive.
 *
 * Backpressure is driven by the `bufferedamountlow` event (no setInterval
 * polling). Files are streamed in 64KB chunks; text is sent as a single
 * control message.
 */

import type { FileDescriptor, SignalingMessage } from '../types';

export type TransferEvents = {
  onProgress: (progress: number) => void;
  onTransferComplete: () => void;
  onFileComplete?: (index: number, file: File) => void;
  onFileAcknowledged?: (index: number) => void;
  onFileDescriptorsReceived?: (files: FileDescriptor[]) => void;
  onTextReceived?: (text: string) => void;
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
  private metadata: FileDescriptor | null = null;
  private pendingFileList: FileList | null = null;
  private pendingFileDescriptors: FileDescriptor[] = [];
  private isProcessingTransfer = false;
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
      let msg: SignalingMessage;
      try {
        msg = JSON.parse(data) as SignalingMessage;
      } catch (err) {
        console.warn('[transfer] bad control message:', err);
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
        this.metadata = { name: msg.name, size: msg.size, type: msg.type, index: msg.index };
        this.receiveBuffer = [];
        this.receivedSize = 0;
        break;
      case 'transfer-complete': {
        if (this.isProcessingTransfer || !this.metadata) return;
        if (this.receivedSize < this.metadata.size) return;
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
      case 'text':
        this.events.onTextReceived?.(msg.text);
        break;
    }
  }

  private handleBinary(data: unknown): void {
    if (!this.metadata) return;
    const buffer = data instanceof ArrayBuffer ? data : new Uint8Array(data as ArrayBuffer).buffer;
    this.receiveBuffer.push(buffer);
    this.receivedSize += buffer.byteLength;
    this.events.onProgress(Math.min((this.receivedSize / this.metadata.size) * 100, 99));
  }

  // ─── Sender API ─────────────────────────────────────────────────────────

  sendMeta(files: FileList | File[]): void {
    const fileArray = files instanceof FileList ? Array.from(files) : files;
    this.pendingFileList = files instanceof FileList ? files : null;
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
    this.send({ kind: 'text', text });
  }

  requestFile(index: number): void {
    if (this.dc.readyState !== 'open') return;
    this.send({ kind: 'file-request', index });
  }

  handleFileRequest(index: number): void {
    if (this.dc.readyState !== 'open') return;
    if (this.isProcessingTransfer) {
      if (!this.pendingFileIndicesQueue.includes(index)) {
        this.pendingFileIndicesQueue.push(index);
      }
      return;
    }
    const file = this.pendingFileList?.[index];
    if (!file) return;
    this.isProcessingTransfer = true;
    void this.sendFileChunked(file, index);
  }

  private async sendFileChunked(file: File, fileIndex: number): Promise<void> {
    if (this.dc.readyState !== 'open') return;
    this.send({
      kind: 'file-metadata',
      name: file.name,
      size: file.size,
      type: file.type,
      index: fileIndex,
    });

    let offset = 0;
    let chunksSinceProgress = 0;
    while (offset < file.size) {
      if (this.dc.readyState !== 'open') break;
      if (this.dc.bufferedAmount > BUFFER_HIGH_WATER) {
        await this.waitForDrain();
      }
      if (this.dc.readyState !== 'open') break;
      const slice = file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size));
      const buffer = await slice.arrayBuffer();
      this.dc.send(buffer);
      offset += buffer.byteLength;
      chunksSinceProgress++;
      if (chunksSinceProgress >= PROGRESS_EVERY) {
        this.events.onProgress(Math.min((offset / file.size) * 100, 99));
        chunksSinceProgress = 0;
      }
    }

    this.send({ kind: 'transfer-complete', fileIndex });
    this.events.onProgress(100);
    this.events.onTransferComplete();
    this.isProcessingTransfer = false;

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
