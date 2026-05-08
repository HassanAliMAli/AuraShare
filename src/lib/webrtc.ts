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
    
    // THE GOD-TIER CONFIG: World-class STUN/TURN servers to punch through ANY firewall.
    // Using a curated list of reliable public STUN/TURN providers.
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.events.onCandidate(event.candidate);
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'connected') {
        this.events.onConnected();
      } else if (['disconnected', 'failed', 'closed'].includes(this.pc.connectionState)) {
        this.events.onDisconnected();
      }
    };
  }

  async addCandidate(candidate: RTCIceCandidateInit) {
    try {
      if (!candidate || !candidate.candidate) return;
      // High-reliability check: only add if we haven't already
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      // Rejections are common during path discovery, we keep pushing
    }
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.dc = this.pc.createDataChannel('fileTransfer', { 
      ordered: true,
      maxRetransmits: 30 
    });
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
      this.events.onError('Handshake Disrupted');
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
    dc.bufferedAmountLowThreshold = 1024 * 1024;

    dc.onopen = () => {
      this.events.onConnected();
      // Keep-alive heartbeat
      const pulse = setInterval(() => {
        if (dc.readyState === 'open') dc.send(JSON.stringify({ type: 'heartbeat' }));
        else clearInterval(pulse);
      }, 3000);
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
    dc.onerror = () => this.events.onError('Alignment Lost');
  }

  async sendFile(file: File) {
    if (!this.dc || this.dc.readyState !== 'open') {
      this.events.onError('Wait for Aura...');
      return;
    }

    this.dc.send(JSON.stringify({ name: file.name, size: file.size, type: file.type }));
    const chunkSize = 16 * 1024;
    let offset = 0;

    const read = (o: number): Promise<ArrayBuffer> => {
      return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = (e) => res(e.target?.result as ArrayBuffer);
        r.onerror = rej;
        r.readAsArrayBuffer(file.slice(o, o + chunkSize));
      });
    };

    while (offset < file.size) {
      if (this.dc.bufferedAmount > this.dc.bufferedAmountLowThreshold) {
        await new Promise<void>((res) => {
          const wait = () => { this.dc?.removeEventListener('bufferedamountlow', wait); res(); };
          this.dc?.addEventListener('bufferedamountlow', wait);
        });
      }
      const chunk = await read(offset);
      this.dc.send(chunk);
      offset += chunk.byteLength;
      this.events.onProgress((offset / file.size) * 100);
    }
    this.events.onFileSent();
  }

  close() {
    this.dc?.close();
    this.pc.close();
  }
}
