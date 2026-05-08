type WebRTCEvents = {
  onProgress: (progress: number) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onFileReceived: (file: File) => void;
  onFileSent: () => void;
  onError: (err: string) => void;
};

export class WebRTCManager {
  private pc: RTCPeerConnection;
  private dc?: RTCDataChannel;
  private events: WebRTCEvents;
  
  // State for receiving
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
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'connected') {
        this.events.onConnected();
      } else if (this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'failed') {
        this.events.onDisconnected();
      }
    };
  }

  // Sender methods
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.dc = this.pc.createDataChannel('fileTransfer');
    this.setupDataChannel(this.dc);
    
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    
    // Wait for ICE gathering to complete to get full SDP with candidates
    await new Promise<void>((resolve) => {
      if (this.pc.iceGatheringState === 'complete') {
        resolve();
      } else {
        const checkState = () => {
          if (this.pc.iceGatheringState === 'complete') {
            this.pc.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }
        };
        this.pc.addEventListener('icegatheringstatechange', checkState);
        // Timeout just in case
        setTimeout(() => resolve(), 3000);
      }
    });

    return this.pc.localDescription!;
  }

  async setAnswer(answer: RTCSessionDescriptionInit) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  // Receiver methods
  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    this.pc.ondatachannel = (event) => {
      this.dc = event.channel;
      this.setupDataChannel(this.dc);
    };

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    // Wait for ICE
    await new Promise<void>((resolve) => {
      if (this.pc.iceGatheringState === 'complete') {
        resolve();
      } else {
        const checkState = () => {
          if (this.pc.iceGatheringState === 'complete') {
            this.pc.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }
        };
        this.pc.addEventListener('icegatheringstatechange', checkState);
        setTimeout(() => resolve(), 3000);
      }
    });

    return this.pc.localDescription!;
  }

  private setupDataChannel(dc: RTCDataChannel) {
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = 1024 * 1024; // 1MB

    dc.onopen = () => {
      console.log('Data channel open');
    };
    
    dc.onmessage = (e) => {
      if (typeof e.data === 'string') {
        // Metadata
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
        // Binary chunk
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
    
    dc.onerror = (e) => {
      this.events.onError('Data channel error');
    };
  }

  async sendFile(file: File) {
    if (!this.dc || this.dc.readyState !== 'open') {
      this.events.onError('Not connected');
      return;
    }

    // Send metadata
    this.dc.send(JSON.stringify({
      name: file.name,
      size: file.size,
      type: file.type
    }));

    // Send chunks
    const chunkSize = 64 * 1024; // 64KB
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
        // Wait for buffer to drain
        await new Promise<void>((resolve) => {
          if (!this.dc) return;
          const onBufferedAmountLow = () => {
            this.dc?.removeEventListener('bufferedamountlow', onBufferedAmountLow);
            resolve();
          };
          this.dc.addEventListener('bufferedamountlow', onBufferedAmountLow);
        });
      }

      const chunk = await readChunk(offset, chunkSize);
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
