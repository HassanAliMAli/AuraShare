import { Peer } from 'peerjs';

type PeerEvents = {
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
  private events: PeerEvents;
  
  private receiveBuffer: any[] = [];
  private receivedSize = 0;
  private expectedMetadata: { name: string, size: number, type: string } | null = null;

  constructor(events: PeerEvents) {
    this.events = events;
  }

  // Create a 6-digit room code
  private generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  async initialize(): Promise<string> {
    const id = this.generateRoomId();
    this.peer = new Peer(id, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:openrelay.metered.ca:80' },
          { 
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelay',
            credential: 'openrelay'
          }
        ]
      }
    });

    return new Promise((resolve, reject) => {
      this.peer!.on('open', (peerId) => {
        console.log('Cosmic ID Established:', peerId);
        
        // Listen for incoming connections
        this.peer!.on('connection', (connection) => {
          this.conn = connection;
          this.setupConnection();
        });
        
        resolve(peerId);
      });

      this.peer!.on('error', (err) => {
        console.error('Peer Error:', err);
        this.events.onError('Alignment Failed');
        reject(err);
      });
    });
  }

  async join(targetId: string): Promise<void> {
    this.peer = new Peer({
        config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:openrelay.metered.ca:80' },
              { 
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelay',
                credential: 'openrelay'
              }
            ]
          }
    });

    return new Promise((resolve) => {
      this.peer!.on('open', () => {
        this.conn = this.peer!.connect(targetId, {
          reliable: true,
        });
        this.setupConnection();
        resolve();
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
      if (typeof data === 'string') {
        try {
          const meta = JSON.parse(data);
          if (meta.kind === 'metadata') {
            this.expectedMetadata = meta;
            this.receiveBuffer = [];
            this.receivedSize = 0;
            this.events.onProgress(0);
          }
        } catch (e) {}
      } else if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
        const buffer = data instanceof Uint8Array ? data.buffer : data;
        this.receiveBuffer.push(buffer);
        this.receivedSize += buffer.byteLength;
        
        if (this.expectedMetadata) {
          this.events.onProgress((this.receivedSize / this.expectedMetadata.size) * 100);
          
          if (this.receivedSize >= this.expectedMetadata.size) {
            const file = new File(
              [new Blob(this.receiveBuffer, { type: this.expectedMetadata.type })], 
              this.expectedMetadata.name, 
              { type: this.expectedMetadata.type }
            );
            this.events.onFileReceived(file);
            this.receiveBuffer = [];
            this.expectedMetadata = null;
          }
        }
      }
    });

    this.conn.on('close', () => this.events.onDisconnected());
    this.conn.on('error', () => this.events.onError('Link Disruption'));
  }

  async sendFile(file: File) {
    if (!this.conn || !this.conn.open) {
        this.events.onError('Wait for Link...');
        return;
    }

    // Send metadata
    this.conn.send(JSON.stringify({
      kind: 'metadata',
      name: file.name,
      size: file.size,
      type: file.type
    }));

    // Send in stable chunks
    const chunkSize = 16 * 1024;
    let offset = 0;

    while (offset < file.size) {
      const slice = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();
      this.conn.send(buffer);
      offset += buffer.byteLength;
      this.events.onProgress((offset / file.size) * 100);
      
      // Artificial delay to prevent buffer bloat
      if (offset % (chunkSize * 10) === 0) {
        await new Promise(r => setTimeout(r, 10));
      }
    }
    
    this.events.onFileSent();
  }

  close() {
    this.conn?.close();
    this.peer?.destroy();
  }
}
