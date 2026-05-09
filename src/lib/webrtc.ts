import Peer from 'simple-peer';

type P2PEvents = {
  onProgress: (progress: number) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onFileReceived: (file: File) => void;
  onFileSent: () => void;
  onError: (err: string) => void;
  onSignal: (data: any) => void;
};

export class SimpleP2PManager {
  private peer: Peer.Instance | null = null;
  private events: P2PEvents;
  private receiveBuffer: any[] = [];
  private receivedSize = 0;
  private metadata: any = null;

  constructor(events: P2PEvents, initiator: boolean) {
    this.events = events;
    
    this.peer = new Peer({
      initiator,
      trickle: true,
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

    this.peer.on('signal', (data) => {
      this.events.onSignal(data);
    });

    this.peer.on('connect', () => {
      this.events.onConnected();
    });

    this.peer.on('data', (data) => {
      if (typeof data === 'string') {
        try {
          const meta = JSON.parse(data);
          if (meta.kind === 'metadata') {
            this.metadata = meta;
            this.receiveBuffer = [];
            this.receivedSize = 0;
            this.events.onProgress(0);
            return;
          }
        } catch (e) {}
      }

      // Binary Data - Explicitly handle the Buffer vs ArrayBuffer mismatch
      this.receiveBuffer.push(data);
      this.receivedSize += data.length;

      if (this.metadata) {
        this.events.onProgress((this.receivedSize / this.metadata.size) * 100);
        if (this.receivedSize >= this.metadata.size) {
          // Robust reconstruction for Vite environment
          const blob = new Blob(this.receiveBuffer, { type: this.metadata.type });
          const file = new File([blob], this.metadata.name, { type: this.metadata.type });
          this.events.onFileReceived(file);
          this.metadata = null;
          this.receiveBuffer = [];
        }
      }
    });

    this.peer.on('close', () => this.events.onDisconnected());
    this.peer.on('error', (err) => {
      console.error('Peer Error:', err);
      this.events.onError('Link Lost');
    });
  }

  signal(data: any) {
    this.peer?.signal(data);
  }

  async sendFile(file: File) {
    if (!this.peer || !this.peer.connected) return;

    this.peer.send(JSON.stringify({
      kind: 'metadata',
      name: file.name,
      size: file.size,
      type: file.type
    }));

    const chunkSize = 16 * 1024;
    let offset = 0;
    while (offset < file.size) {
      const slice = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();
      // Use Uint8Array to bypass Buffer-specific issues in Vite
      this.peer.send(new Uint8Array(buffer));
      offset += buffer.byteLength;
      this.events.onProgress((offset / file.size) * 100);
      
      if (offset % (chunkSize * 20) === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }
    this.events.onFileSent();
  }

  close() {
    this.peer?.destroy();
  }
}
