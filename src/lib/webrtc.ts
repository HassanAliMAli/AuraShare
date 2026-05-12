import { Peer } from 'peerjs';

type P2PEvents = {
  onProgress: (progress: number) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onFileReceived: (file: File) => void;
  onFileSent: () => void;
  onError: (err: string) => void;
};

export class P2PManager {
  private peer: Peer | null = null;
  private conn: any = null;
  private events: P2PEvents;
  
  private receiveBuffer: any[] = [];
  private receivedSize = 0;
  private metadata: any = null;
  private connectionTimeout: any = null;

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
    }, 300000); // 5-minute grace period for global alignment
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
      this.events.onConnected();
    });

    this.conn.on('data', (data: any) => {
      if (typeof data === 'string') {
        try {
          const msg = JSON.parse(data);
          if (msg.kind === 'metadata') {
            this.metadata = msg;
            this.receiveBuffer = [];
            this.receivedSize = 0;
            this.events.onProgress(0);
          }
        } catch (e) {}
      } else {
        const buffer = data instanceof Uint8Array ? data.buffer : data;
        this.receiveBuffer.push(buffer);
        this.receivedSize += buffer.byteLength;

        if (this.metadata) {
          this.events.onProgress((this.receivedSize / this.metadata.size) * 100);
          if (this.receivedSize >= this.metadata.size) {
            const file = new File([new Blob(this.receiveBuffer)], this.metadata.name, { type: this.metadata.type });
            this.events.onFileReceived(file);
            this.metadata = null;
            this.receiveBuffer = [];
          }
        }
      }
    });

    this.conn.on('close', () => this.events.onDisconnected());
    this.conn.on('error', () => this.events.onError('Alignment Lost'));
  }

  async sendFile(file: File) {
    if (!this.conn || !this.conn.open) return;

    this.conn.send(JSON.stringify({
      kind: 'metadata',
      name: file.name,
      size: file.size,
      type: file.type
    }));

    const chunkSize = 1024 * 1024;
    const MAX_BUFFER_SIZE = 4 * 1024 * 1024;
    const PROGRESS_INTERVAL = 50;
    const dc = this.conn.dataChannel;
    let offset = 0;
    let chunksSinceProgress = 0;

    while (offset < file.size) {
      if (dc.bufferedAmount > MAX_BUFFER_SIZE) {
        await new Promise<void>((resolve) => {
          const checkBuffer = setInterval(() => {
            if (dc.bufferedAmount < MAX_BUFFER_SIZE / 2) {
              clearInterval(checkBuffer);
              resolve();
            }
          }, 20);
        });
      }

      const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
      const buffer = await slice.arrayBuffer();
      dc.send(new Uint8Array(buffer));
      offset += buffer.byteLength;
      chunksSinceProgress++;
      if (chunksSinceProgress >= PROGRESS_INTERVAL) {
        this.events.onProgress((offset / file.size) * 100);
        chunksSinceProgress = 0;
      }
    }

    this.events.onProgress(100);
    
    this.events.onFileSent();
  }

  close() {
    this.clearConnectionSentinel();
    this.conn?.close();
    this.peer?.destroy();
  }
}
