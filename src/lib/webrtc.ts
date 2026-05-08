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
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        { urls: 'stun:stun.services.mozilla.com' }
      ],
      iceCandidatePoolSize: 10 // Pre-gather candidates for faster connection
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.events.onCandidate(event.candidate);
      }
    };

    this.pc.onconnectionstatechange = () => {
      console.log('RTC State Change:', this.pc.connectionState);
      if (this.pc.connectionState === 'connected') {
        this.events.onConnected();
      } else if (['disconnected', 'failed', 'closed'].includes(this.pc.connectionState)) {
        this.events.onDisconnected();
      }
    };

    // Robustness: Monitor ICE connection state specifically
    this.pc.oniceconnectionstatechange = () => {
      console.log('ICE Connection State:', this.pc.iceConnectionState);
      if (this.pc.iceConnectionState === 'connected' || this.pc.iceConnectionState === 'completed') {
        // Sometimes connectionState doesn't flip to connected but ICE is solid
        // We handle this via Data Channel open as well
      }
    };
  }

  async addCandidate(candidate: RTCIceCandidateInit) {
    try {
      // Validate candidate before adding
      if (!candidate.candidate) return;
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('Silent candidate rejection (normal in some networks)');
    }
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.dc = this.pc.createDataChannel('fileTransfer', { 
      ordered: true,
      maxRetransmits: 30 // High reliability for restricted networks
    });
    this.setupDataChannel(this.dc);
    
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return this.pc.localDescription!;
  }

  async setAnswer(answer: RTCSessionDescriptionInit) {
    try {
      if (this.pc.signalingState !== 'stable') {
        await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    } catch (e) {
      console.error('Handshake failed:', e);
      this.events.onError('Alignment Mismatch');
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
      console.log('Direct P2P Link Established');
      this.events.onConnected();
      
      // Send a heartbeat to keep the link alive
      const heartbeat = setInterval(() => {
        if (dc.readyState === 'open') {
          dc.send(JSON.stringify({ type: 'heartbeat' }));
        } else {
          clearInterval(heartbeat);
        }
      }, 5000);
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
        } catch (err) {
          console.error('Corrupt metadata');
        }
      } else {
        this.receiveBuffer.push(e.data);
        this.receivedSize += e.data.byteLength;
        this.events.onProgress((this.receivedSize / this.expectedSize) * 100);

        if (this.receivedSize === this.expectedSize) {
          const blob = new Blob(this.receiveBuffer, { type: this.expectedFileType });
          const file = new File([blob], this.expectedFileName, { type: this.expectedFileType });
          this.events.onFileReceived(file);
          this.receiveBuffer = []; // Clear buffer
        }
      }
    };
    
    dc.onclose = () => this.events.onDisconnected();
    dc.onerror = () => this.events.onError('Transmission Error');
  }

  async sendFile(file: File) {
    if (!this.dc || this.dc.readyState !== 'open') {
      this.events.onError('Link not ready');
      return;
    }

    this.dc.send(JSON.stringify({ name: file.name, size: file.size, type: file.type }));

    const chunkSize = 16 * 1024;
    let offset = 0;

    const readChunk = (o: number, size: number): Promise<ArrayBuffer> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const slice = file.slice(o, o + size);
        reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(slice);
      });
    };

    while (offset < file.size) {
      if (this.dc.bufferedAmount > this.dc.bufferedAmountLowThreshold) {
        await new Promise<void>((resolve) => {
          const onBufferedAmountLow = () => {
            this.dc?.removeEventListener('bufferedamountlow', onBufferedAmountLow);
            resolve();
          };
          this.dc?.addEventListener('bufferedamountlow', onBufferedAmountLow);
        });
      }

      const chunkSizeToRead = Math.min(chunkSize, file.size - offset);
      const chunk = await readChunk(offset, chunkSizeToRead);
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
