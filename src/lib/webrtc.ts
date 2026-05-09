type WebRTCEvents = {
  onProgress: (progress: number) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onFileReceived: (file: File) => void;
  onFileSent: () => void;
  onError: (err: string) => void;
  onCandidate: (candidate: RTCIceCandidate) => void;
};

export class WebRTCManager {
  private pc: RTCPeerConnection;
  private dc?: RTCDataChannel;
  private events: WebRTCEvents;
  
  private receiveBuffer: ArrayBuffer[] = [];
  private receivedSize = 0;
  private expectedSize = 0;
  private expectedFileName = '';
  private expectedFileType = '';

  constructor(events: WebRTCEvents) {
    this.events = events;
    
    // ADDING PREMIUM TURN RELAY (OpenRelay)
    // This is the "Nuclear Option" for firewalls. If direct P2P fails, 
    // it will route through these servers to guarantee a connection.
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:openrelay.metered.ca:80' },
        { 
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelay',
          credential: 'openrelay'
        },
        { 
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelay',
          credential: 'openrelay'
        },
        { 
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelay',
          credential: 'openrelay'
        }
      ],
      iceCandidatePoolSize: 10
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) this.events.onCandidate(event.candidate);
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'connected') {
        // We wait for DataChannel to be open for onConnected
      } else if (['disconnected', 'failed', 'closed'].includes(this.pc.connectionState)) {
        this.events.onDisconnected();
      }
    };
  }

  async addCandidate(candidate: RTCIceCandidateInit) {
    try {
      if (!candidate || !candidate.candidate) return;
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {}
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.dc = this.pc.createDataChannel('fileTransfer', { ordered: true });
    this.setupDataChannel(this.dc);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return this.pc.localDescription!;
  }

  async setAnswer(answer: RTCSessionDescriptionInit) {
    try {
      if (this.pc.signalingState === 'have-local-offer') {
        await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    } catch (e) {
      this.events.onError('Link Sync Error');
    }
  }

  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    this.pc.ondatachannel = (event) => {
      this.dc = event.channel;
      this.setupDataChannel(this.dc);
    };
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return this.pc.localDescription!;
  }

  private setupDataChannel(dc: RTCDataChannel) {
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => {
      console.log('Channel Ready');
      this.events.onConnected();
    };
    
    dc.onmessage = (e) => {
      if (typeof e.data === 'string') {
        try {
          const meta = JSON.parse(e.data);
          if (meta.type === 'heartbeat') return;
          this.expectedFileName = meta.name;
          this.expectedSize = meta.size;
          this.expectedFileType = meta.type;
          this.receiveBuffer = [];
          this.receivedSize = 0;
          this.events.onProgress(0);
        } catch (err) {}
      } else {
        this.receiveBuffer.push(e.data);
        this.receivedSize += e.data.byteLength;
        this.events.onProgress((this.receivedSize / this.expectedSize) * 100);
        if (this.receivedSize === this.expectedSize) {
          const file = new File([new Blob(this.receiveBuffer, { type: this.expectedFileType })], this.expectedFileName, { type: this.expectedFileType });
          this.events.onFileReceived(file);
          this.receiveBuffer = [];
        }
      }
    };
    
    dc.onclose = () => this.events.onDisconnected();
    dc.onerror = () => this.events.onError('Link Lost');
  }

  async sendFile(file: File) {
    // PROTECT: Wait until the channel is truly open
    if (!this.dc || this.dc.readyState !== 'open') {
      console.log('Waiting for channel to stabilize...');
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (this.dc?.readyState === 'open') {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
    }

    this.dc!.send(JSON.stringify({ name: file.name, size: file.size, type: file.type }));
    
    // Give the receiver a moment to process metadata
    await new Promise(r => setTimeout(r, 200));

    const chunkSize = 16 * 1024;
    let offset = 0;

    while (offset < file.size) {
      if (this.dc!.bufferedAmount > 1024 * 1024) {
        await new Promise<void>((res) => {
          const wait = () => { this.dc?.removeEventListener('bufferedamountlow', wait); res(); };
          this.dc?.addEventListener('bufferedamountlow', wait);
        });
      }
      
      const slice = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();
      this.dc!.send(buffer);
      offset += buffer.byteLength;
      this.events.onProgress((offset / file.size) * 100);
    }
    this.events.onFileSent();
  }

  close() {
    this.dc?.close();
    this.pc.close();
  }
}
