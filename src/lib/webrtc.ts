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
        { urls: 'stun:stun4.l.google.com:19302' }
      ]
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.events.onCandidate(event.candidate);
      }
    };

    this.pc.onconnectionstatechange = () => {
      console.log('RTC State:', this.pc.connectionState);
      if (this.pc.connectionState === 'connected') {
        this.events.onConnected();
      } else if (this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'failed') {
        this.events.onDisconnected();
      }
    };
  }

  async addCandidate(candidate: RTCIceCandidateInit) {
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Error adding candidate', e);
    }
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.dc = this.pc.createDataChannel('fileTransfer', { ordered: true });
    this.setupDataChannel(this.dc);
    
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return this.pc.localDescription!;
  }

  async setAnswer(answer: RTCSessionDescriptionInit) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
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
      console.log('Data channel open');
      this.events.onConnected();
    };
    
    dc.onmessage = (e) => {
      if (typeof e.data === 'string') {
        try {
          const meta = JSON.parse(e.data);
          this.expectedFileName = meta.name;
          this.expectedSize = meta.size;
          this.expectedFileType = meta.type;
          this.receiveBuffer = [];
          this.receivedSize = 0;
          this.events.onProgress(0);
        } catch (err) {
          console.error('Invalid metadata', err);
        }
      } else {
        this.receiveBuffer.push(e.data);
        this.receivedSize += e.data.byteLength;
        this.events.onProgress((this.receivedSize / this.expectedSize) * 100);

        if (this.receivedSize === this.expectedSize) {
          const blob = new Blob(this.receiveBuffer, { type: this.expectedFileType });
          const file = new File([blob], this.expectedFileName, { type: this.expectedFileType });
          this.events.onFileReceived(file);
        }
      }
    };
    
    dc.onclose = () => this.events.onDisconnected();
    dc.onerror = () => this.events.onError('Data channel error');
  }

  async sendFile(file: File) {
    if (!this.dc || this.dc.readyState !== 'open') {
      this.events.onError('Connection not ready');
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
