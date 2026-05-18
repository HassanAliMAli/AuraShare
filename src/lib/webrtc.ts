import { Peer } from 'peerjs';

type FileDescriptor = {
  name: string;
  size: number;
  type: string;
  index?: number;
};

type P2PEvents = {
  onProgress: (progress: number) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onReceiverConnected?: () => void;
  onFileDescriptorsReceived?: (files: FileDescriptor[]) => void;
  onFilesReceived: (files: File[]) => void;
  onTransferComplete: () => void;
  onFileComplete?: (index: number, file: File) => void;
  onFileAcknowledged?: (index: number) => void;
  onError: (err: string) => void;
};

interface PeerConnection {
  on(event: string, handler: (...args: unknown[]) => void): void;
  send(data: unknown): void;
  open: boolean;
  dataChannel?: RTCDataChannel;
  close(): void;
}

export class P2PManager {
  private peer: Peer | null = null;
  private conn: PeerConnection | null = null;
  private events: P2PEvents;

  private receiveBuffer: ArrayBuffer[] = [];
  private receivedSize = 0;
  private metadata: FileDescriptor | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;

  private pendingFiles: File[] = [];
  private pendingFileList: FileList | null = null;
  private pendingFileDescriptors: FileDescriptor[] = [];
  private acknowledgedFiles: Set<number> = new Set();
  private isProcessingTransfer = false;
  private pendingFileIndicesQueue: number[] = [];

  constructor(events: P2PEvents) {
    this.events = events;
  }

  private generateId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private startConnectionSentinel() {
    this.clearConnectionSentinel();
    this.connectionTimeout = setTimeout(() => {
      if (!this.conn || !this.conn.open) {
        this.events.onError('Connection Timeout');
        this.close();
      }
    }, 300000);
  }

  private clearConnectionSentinel() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  async initialize(): Promise<string> {
    const id = this.generateId();
    this.peer = new Peer(id, {
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:openrelay.metered.ca:80' },
          { urls: 'turn:openrelay.metered.ca:80', username: 'openrelay', credential: 'openrelay' },
          { urls: 'turn:openrelay.metered.ca:443', username: 'openrelay', credential: 'openrelay' }
        ]
      }
    });

    this.startConnectionSentinel();

    return new Promise((resolve, reject) => {
      this.peer!.on('open', (peerId) => {
        resolve(peerId);
      });

      this.peer!.on('connection', (connection) => {
        this.conn = connection;
        
        connection.on('open', () => {
          this.clearConnectionSentinel();
          this.events.onConnected();
          this.events.onReceiverConnected?.();
        });

        connection.on('close', () => {
          this.events.onDisconnected();
        });

        connection.on('error', () => {
          this.events.onError('Connection Lost');
        });

        this.setupConnection();
      });

      this.peer!.on('error', (err) => {
        if (err.type === 'unavailable-id') {
            this.initialize().then(resolve).catch(reject);
        } else {
            this.events.onError('Aura Busy');
            reject(err);
        }
      });
    });
  }

  async join(targetId: string): Promise<void> {
    this.peer = new Peer({
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:openrelay.metered.ca:80' },
          { urls: 'turn:openrelay.metered.ca:80', username: 'openrelay', credential: 'openrelay' },
          { urls: 'turn:openrelay.metered.ca:443', username: 'openrelay', credential: 'openrelay' }
        ]
      }
    });

    this.startConnectionSentinel();

    return new Promise((resolve, reject) => {
      this.peer!.on('open', () => {
        this.conn = this.peer!.connect(targetId, {
          reliable: true
        });
        
        this.conn.on('open', () => {
          this.clearConnectionSentinel();
          this.events.onConnected();
          resolve();
        });

        this.conn.on('error', (err) => {
          this.events.onError('Connection Error');
          reject(err);
        });

        this.conn.on('close', () => {
          this.events.onDisconnected();
        });

        // Set up data handler only (other handlers already registered above)
        this.conn.on('data', (data: unknown) => {
          this.handleData(data);
        });
      });

      this.peer!.on('error', (err) => {
        this.events.onError('Portal Failed');
        reject(err);
      });
    });
  }

  private setupConnection() {
    // Handlers are now registered in initialize() and join() to avoid duplication
    if (!this.conn) return;

    this.conn.on('data', (data: unknown) => {
      this.handleData(data);
    });
  }

  private handleData(data: unknown) {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data) as { kind?: string; files?: FileDescriptor[]; index?: number; name?: string; size?: number; type?: string; fileIndex?: number };
        if (msg.kind === 'file-metadata') {
          const senderIndex = typeof msg.index === 'number' ? msg.index : this.pendingFileDescriptors.length;
          this.metadata = { name: msg.name!, size: msg.size!, type: msg.type!, index: senderIndex };
          this.receiveBuffer = [];
          this.receivedSize = 0;
        } else if (msg.kind === 'transfer-complete') {
          // Ignore if already processing or no active transfer
          if (this.isProcessingTransfer || !this.metadata) return;
          if (this.receivedSize < this.metadata.size) return;
          
          this.isProcessingTransfer = true;
          
          const file = new File([new Blob(this.receiveBuffer)], this.metadata.name, { type: this.metadata.type });
          this.pendingFiles.push(file);
          
          const fileIndex = typeof msg.fileIndex === 'number' && msg.fileIndex >= 0 && msg.fileIndex < this.pendingFileDescriptors.length
            ? msg.fileIndex
            : this.pendingFileDescriptors.findIndex(f => f.name === this.metadata!.name);
          if (fileIndex >= 0) {
            this.events.onFileComplete?.(fileIndex, file);
            if (this.conn?.open) {
              this.conn.send(JSON.stringify({ kind: 'file-acknowledged', index: fileIndex }));
            }
          }
          this.events.onProgress(100);
          this.events.onTransferComplete?.();
          
          this.metadata = null;
          this.receiveBuffer = [];
          this.receivedSize = 0;
          this.isProcessingTransfer = false;
        } else if (msg.kind === 'file-descriptors' && msg.files) {
          this.pendingFileDescriptors = msg.files;
          this.events.onFileDescriptorsReceived?.(msg.files);
        } else if (msg.kind === 'file-request' && typeof msg.index === 'number') {
          this.handleFileRequest(msg.index);
        } else if (msg.kind === 'file-acknowledged' && typeof msg.index === 'number') {
          this.events.onFileAcknowledged?.(msg.index);
        }
      } catch { /* ignore parse errors */ }
    } else {
      if (!this.metadata) return;
      const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
      const byteLength = uint8.byteLength;
      const buffer = new ArrayBuffer(byteLength);
      new Uint8Array(buffer).set(uint8);
      this.receiveBuffer.push(buffer);
      this.receivedSize += byteLength;

      this.events.onProgress(Math.min((this.receivedSize / this.metadata.size) * 100, 99));
    }
  }

  requestFile(index: number) {
    if (!this.conn || !this.conn.open) return;
    this.conn.send(JSON.stringify({ kind: 'file-request', index }));
  }

  sendMeta(files: FileList | File[]) {
    const fileArray = files instanceof FileList ? Array.from(files) : files;
    this.pendingFileList = files instanceof FileList ? files : null;
    if (!this.conn || !this.conn.open || fileArray.length === 0) return;

    const descriptors: FileDescriptor[] = fileArray.map((file, idx) => ({
      name: file.name,
      size: file.size,
      type: file.type,
      index: idx,
    }));

    this.pendingFileDescriptors = descriptors;
    this.conn.send(JSON.stringify({ kind: 'file-descriptors', files: descriptors }));
  }

  handleFileRequest(index: number) {
    if (!this.conn || !this.conn.open) return;
    
    if (this.isProcessingTransfer) {
      // Queue this file request
      if (!this.pendingFileIndicesQueue.includes(index)) {
        this.pendingFileIndicesQueue.push(index);
      }
      return;
    }
    
    this.isProcessingTransfer = true;
    
    if (this.pendingFileList && this.pendingFileList[index]) {
      this.startTransferForFile(this.pendingFileList[index]);
    } else if (this.pendingFileDescriptors[index]) {
      this.startTransferForFileByDescriptor(this.pendingFileDescriptors[index]);
    }
  }

  startTransferForFileByDescriptor(desc: FileDescriptor) {
    if (!this.conn || !desc) return;
    
    const chunkSize = 64 * 1024;
    const MAX_BUFFER_SIZE = 256 * 1024;
    const fileIndex = this.pendingFileDescriptors.indexOf(desc);
    let offset = 0;

    this.conn.send(JSON.stringify({
      kind: 'file-metadata',
      name: desc.name,
      size: desc.size,
      type: desc.type,
      index: fileIndex
    }));

    const sendChunk = async () => {
      while (offset < desc.size && this.conn) {
        const dataChannel = this.conn.dataChannel;
        if (dataChannel && dataChannel.bufferedAmount > MAX_BUFFER_SIZE) {
          await new Promise<void>((resolve) => {
            const checkBuffer = setInterval(() => {
              if (!this.conn || this.conn.dataChannel!.bufferedAmount < MAX_BUFFER_SIZE / 2) {
                clearInterval(checkBuffer);
                resolve();
              }
            }, 20);
          });
        }

        if (!this.conn) break;
        const slice = this.pendingFileList ? this.pendingFileList[fileIndex]?.slice(offset, Math.min(offset + chunkSize, desc.size)) : null;
        if (!slice) break;
        const buffer = await slice.arrayBuffer();
        this.conn.send(new Uint8Array(buffer));
        offset += buffer.byteLength;
        this.events.onProgress(Math.min((offset / desc.size) * 100, 99));

        await new Promise(res => setTimeout(res, 5));
      }

      if (this.conn) {
        this.conn.send(JSON.stringify({ kind: 'transfer-complete', fileIndex }));
      }
      this.events.onProgress(100);
      this.events.onTransferComplete();
      
      this.isProcessingTransfer = false;
      
      if (this.pendingFileIndicesQueue.length > 0) {
        const nextIndex = this.pendingFileIndicesQueue.shift();
        if (nextIndex !== undefined) {
          setTimeout(() => this.handleFileRequest(nextIndex), 100);
        }
      }
    };

    sendChunk();
  }

  startTransferForFile(file: File) {
    if (!this.conn) return;
    
    const chunkSize = 1024 * 1024;
    const MAX_BUFFER_SIZE = 4 * 1024 * 1024;
    const PROGRESS_INTERVAL = 50;
    let offset = 0;
    let chunksSinceProgress = 0;

    this.conn.send(JSON.stringify({
        kind: 'file-metadata',
        name: file.name,
        size: file.size,
        type: file.type,
        index: this.pendingFileDescriptors.findIndex(f => f.name === file.name)
      }));

    (async () => {
      while (offset < file.size) {
        if (!this.conn) break;
        const dataChannel = this.conn.dataChannel;
        if (dataChannel && dataChannel.bufferedAmount > MAX_BUFFER_SIZE) {
          await new Promise<void>((resolve) => {
            const checkBuffer = setInterval(() => {
              if (!this.conn || this.conn.dataChannel!.bufferedAmount < MAX_BUFFER_SIZE / 2) {
                clearInterval(checkBuffer);
                resolve();
              }
            }, 20);
          });
        }

        if (!this.conn) break;
        const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
        const buffer = await slice.arrayBuffer();
        this.conn.send(new Uint8Array(buffer));
        offset += buffer.byteLength;
        chunksSinceProgress++;
        if (chunksSinceProgress >= PROGRESS_INTERVAL) {
          this.events.onProgress((offset / file.size) * 100);
          chunksSinceProgress = 0;
        }
      }

      if (this.conn) {
        this.conn.send(JSON.stringify({ kind: 'transfer-complete', fileIndex: this.pendingFileDescriptors.findIndex(f => f.name === file.name) }));
      }
      this.events.onProgress(100);
      this.events.onTransferComplete();
      
      this.isProcessingTransfer = false;
      
      if (this.pendingFileIndicesQueue.length > 0) {
        const nextIndex = this.pendingFileIndicesQueue.shift();
        if (nextIndex !== undefined) {
          setTimeout(() => this.handleFileRequest(nextIndex), 100);
        }
      }
    })();
  }

  startTransfer(files: FileList | File[]) {
    const fileArray = files instanceof FileList ? Array.from(files) : files;
    this.pendingFileList = files instanceof FileList ? files : null;
    if (!this.conn || !this.conn.open || fileArray.length === 0) return;

    (async () => {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        const metadataSent = new Promise<void>((resolve) => {
          const checkMeta = setInterval(() => {
            if (this.conn) {
              clearInterval(checkMeta);
              resolve();
            }
          }, 50);
        });
        await metadataSent;
        await this.startTransferForFileAsync(file);
        
        if (i < fileArray.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    })();
  }

  private startTransferForFileAsync(file: File): Promise<void> {
    return new Promise((resolve) => {
      if (!this.conn) {
        resolve();
        return;
      }
      
      const chunkSize = 1024 * 1024;
      const MAX_BUFFER_SIZE = 4 * 1024 * 1024;
      let offset = 0;

      this.conn.send(JSON.stringify({
        kind: 'file-metadata',
        name: file.name,
        size: file.size,
        type: file.type,
        index: this.pendingFileDescriptors.findIndex(f => f.name === file.name)
      }));

      const sendNextChunk = async () => {
        while (offset < file.size && this.conn) {
          const dataChannel = this.conn.dataChannel;
          if (dataChannel && dataChannel.bufferedAmount > MAX_BUFFER_SIZE) {
            await new Promise<void>((res) => {
              const checkBuffer = setInterval(() => {
                if (!this.conn || this.conn.dataChannel!.bufferedAmount < MAX_BUFFER_SIZE / 2) {
                  clearInterval(checkBuffer);
                  res();
                }
              }, 20);
            });
          }

          if (!this.conn) break;
          const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
          const buffer = await slice.arrayBuffer();
          this.conn.send(new Uint8Array(buffer));
          offset += buffer.byteLength;

          await new Promise(res => setTimeout(res, 10));
        }

        if (this.conn) {
          this.conn.send(JSON.stringify({ kind: 'transfer-complete', fileIndex: this.pendingFileDescriptors.findIndex(f => f.name === file.name) }));
          this.events.onProgress(100);
          this.events.onTransferComplete();
        }
        resolve();
      };

      sendNextChunk();
    });
  }

  close() {
    this.clearConnectionSentinel();
    this.conn?.close();
    this.peer?.destroy();
  }

  getAcknowledgedFiles(): Set<number> {
    return this.acknowledgedFiles;
  }
}
