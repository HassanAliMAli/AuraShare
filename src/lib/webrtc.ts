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
  
  private receiveBuffer: ArrayBuffer[] = [];
  private receivedSize = 0;
  private metadata: any = null;

  constructor(events: P2PEvents) {
    this.events = events;
  }

  private generateId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  async initialize(): Promise<string> {
    const id = this.generateId();
    
    // Using the official PeerJS global cloud server (100% free & instant)
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

    return new Promise((resolve, reject) => {
      this.peer!.on('open', (peerId) => {
        console.log('Cosmic ID Established:', peerId);
        resolve(peerId);
      });

      this.peer!.on('connection', (connection) => {
        this.conn = connection;
        this.setupConnection();
      });

      this.peer!.on('error', (err) => {
        console.error('Peer Error:', err.type);
        if (err.type === 'unavailable-id') {
            // Retry with a new ID if collision occurs
            this.initialize().then(resolve).catch(reject);
        } else {
            this.events.onError('Cosmos Busy');
            reject(err);
        }
      });
    });
  }

  async join(targetId: string): Promise<void> {
    // Client-side initialization for joining
    this.peer = new Peer({
        config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:openrelay.metered.ca:80' }
            ]
          }
    });

    return new Promise((resolve, reject) => {
      this.peer!.on('open', () => {
        this.conn = this.peer!.connect(targetId, {
          reliable: true
        });
        this.setupConnection();
        resolve();
      });
      
      this.peer!.on('error', (err) => {
        this.events.onError('Portal Closed');
        reject(err);
      });
    });
  }

  private setupConnection() {
    if (!this.conn) return;

    this.conn.on('open', () => {
      console.log('Direct Link Balanced');
      this.events.onConnected();
    });

    this.conn.on('data', (data: any) => {
      // PeerJS handles the binary encoding correctly
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
        // Binary Chunk
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
    this.conn.on('error', () => this.events.onError('Link Disruption'));
  }

  async sendFile(file: File) {
    if (!this.conn || !this.conn.open) return;

    // Send metadata
    this.conn.send(JSON.stringify({
      kind: 'metadata',
      name: file.name,
      size: file.size,
      type: file.type
    }));

    // Send in robust 16KB chunks
    const chunkSize = 16 * 1024;
    let offset = 0;

    while (offset < file.size) {
      const slice = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();
      this.conn.send(buffer);
      offset += buffer.byteLength;
      this.events.onProgress((offset / file.size) * 100);
      
      // Momentary pause to prevent browser hang
      if (offset % (chunkSize * 10) === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }
    
    this.events.onFileSent();
  }

  close() {
    this.conn?.close();
    this.peer?.destroy();
  }
}
