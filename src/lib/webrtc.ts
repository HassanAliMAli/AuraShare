import { Peer } from 'peerjs';

type FileDescriptor = {
  name: string;
  size: number;
  type: string;
};

type P2PEvents = {
  onProgress: (progress: number) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onReceiverReady?: () => void;
  onReceiverConnected?: () => void;
  onFilesReceived: (files: File[]) => void;
  onTransferComplete: () => void;
  onError: (err: string) => void;
};

export class P2PManager {
  private peer: Peer | null = null;
  private conn: any = null;
  private events: P2PEvents;

  private receiveBuffer: any[] = [];
  private receivedSize = 0;
  private metadata: FileDescriptor | null = null;
  private connectionTimeout: any = null;

  private pendingFiles: File[] = [];

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
      debug: 1,
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
        this.setupConnection();
        console.log('[P2P] Receiver connected, firing onReceiverConnected');
        this.events.onReceiverConnected?.();
        if (this.conn.open) {
          this.events.onConnected();
        }
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
        this.setupConnection();
        resolve();
      });

      this.peer!.on('error', (err) => {
        this.events.onError('Portal Failed');
        reject(err);
      });
    });
  }

  private setupConnection() {
    if (!this.conn) return;

    this.conn.on('open', () => {
      this.clearConnectionSentinel();
      console.log('[P2P] Connection open');
      this.events.onConnected();
    });

    this.conn.on('data', (data: any) => {
      console.log('[P2P] data event received, type:', typeof data, data instanceof Uint8Array ? 'binary' : 'string');
      this.handleData(data);
    });

    this.conn.on('dataChannel', (channel: any) => {
      console.log('[P2P] dataChannel event received');
      channel.on('data', (data: any) => {
        console.log('[P2P] dataChannel data:', typeof data);
        this.handleData(data);
      });
    });

    this.conn.on('close', () => this.events.onDisconnected());
    this.conn.on('error', () => this.events.onError('Alignment Lost'));
  }

  private handleData(data: any) {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data);
        console.log('[P2P] String data:', msg.kind);
        if (msg.kind === 'files-start') {
          console.log('[P2P] Received files-start:', msg);
          this.pendingFiles = [];
          this.receiveBuffer = [];
          this.receivedSize = 0;
          this.metadata = null;
          this.events.onProgress(0);
        } else if (msg.kind === 'file-metadata') {
          console.log('[P2P] Received file-metadata:', msg);
          this.receiveBuffer = [];
          this.receivedSize = 0;
        } else if (msg.kind === 'transfer-complete') {
          console.log('[P2P] Transfer complete, calling onFilesReceived with', this.pendingFiles.length, 'files');
          this.events.onFilesReceived(this.pendingFiles);
        }
      } catch (e) {}
    } else {
      if (!this.metadata) return;
      const buffer = data instanceof Uint8Array ? data.buffer : data;
      this.receiveBuffer.push(buffer);
      this.receivedSize += buffer.byteLength;

      this.events.onProgress((this.receivedSize / this.metadata.size) * 100);
      if (this.receivedSize >= this.metadata.size) {
        const file = new File([new Blob(this.receiveBuffer)], this.metadata.name, { type: this.metadata.type });
        this.pendingFiles.push(file);
        this.metadata = null;
        this.receiveBuffer = [];
      }
    }
  }

  sendMeta(files: FileList | File[]) {
    const fileArray = files instanceof FileList ? Array.from(files) : files;
    if (!this.conn || !this.conn.open || fileArray.length === 0) return;

    const send = () => {
      console.log('[P2P] Sending metadata for', fileArray.length, 'files');
      this.conn.send(JSON.stringify({ kind: 'files-start', count: fileArray.length }));
      for (const file of fileArray) {
        this.conn.send(JSON.stringify({
          kind: 'file-metadata',
          name: file.name,
          size: file.size,
          type: file.type
        }));
      }
    };

    const dc = this.conn.dataChannel;
    if (dc && dc.readyState === 'open') {
      send();
    } else {
      const waitForOpen = () => {
        if (dc.readyState === 'open') {
          send();
        } else {
          dc.addEventListener('open', send, { once: true });
        }
      };
      if (dc) {
        waitForOpen();
      } else {
        this.conn.once('dataChannel', (channel: any) => {
          channel.once('open', send);
        });
      }
    }
  }

  startTransfer(files: FileList | File[]): void {
    const fileArray = files instanceof FileList ? Array.from(files) : files;
    if (!this.conn || !this.conn.open || fileArray.length === 0) return;

    const totalSize = fileArray.reduce((sum, f) => sum + f.size, 0);
    const chunkSize = 1024 * 1024;
    const MAX_BUFFER_SIZE = 4 * 1024 * 1024;
    const PROGRESS_INTERVAL = 50;
    let sentSize = 0;

    (async () => {
      for (const file of fileArray) {
        this.conn.send(JSON.stringify({
          kind: 'file-metadata',
          name: file.name,
          size: file.size,
          type: file.type
        }));

        let offset = 0;
        let chunksSinceProgress = 0;

        while (offset < file.size) {
          if (this.conn.dataChannel && this.conn.dataChannel.bufferedAmount > MAX_BUFFER_SIZE) {
            await new Promise<void>((resolve) => {
              const checkBuffer = setInterval(() => {
                if (this.conn.dataChannel.bufferedAmount < MAX_BUFFER_SIZE / 2) {
                  clearInterval(checkBuffer);
                  resolve();
                }
              }, 20);
            });
          }

          const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
          const buffer = await slice.arrayBuffer();
          this.conn.send(new Uint8Array(buffer));
          offset += buffer.byteLength;
          sentSize += buffer.byteLength;
          chunksSinceProgress++;
          if (chunksSinceProgress >= PROGRESS_INTERVAL) {
            this.events.onProgress((sentSize / totalSize) * 100);
            chunksSinceProgress = 0;
          }
        }
      }

      this.conn.send(JSON.stringify({ kind: 'transfer-complete' }));
      this.events.onProgress(100);
      this.events.onTransferComplete();
    })();
  }

  close() {
    this.clearConnectionSentinel();
    this.conn?.close();
    this.peer?.destroy();
  }
}
