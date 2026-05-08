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
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ]
    });

    this.pc.onconnectionstatechange = () => {
      console.log('RTC State:', this.pc.connectionState);
      if (this.pc.connectionState === 'connected') {
        this.events.onConnected();
      } else if (this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'failed') {
        this.events.onDisconnected();
      }
    };
  }

  private async waitForICE() {
    return new Promise<void>((resolve) => {
      if (this.pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const checkState = () => {
        if (this.pc.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };

      this.pc.addEventListener('icegatheringstatechange', checkState);
      
      // Safety timeout: if gathering takes too long, just proceed with what we have
      setTimeout(() => {
        this.pc.removeEventListener('icegatheringstatechange', checkState);
        resolve();
      }, 5000);
    });
  }

  // Sender methods
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.dc = this.pc.createDataChannel('fileTransfer', {
      ordered: true
    });
    this.setupDataChannel(this.dc);
    
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    
    console.log('Gathering ICE candidates...');
    await this.waitForICE();
    console.log('ICE gathering complete');

    return this.pc.localDescription!;
  }

  async setAnswer(answer: RTCSessionDescriptionInit) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  // Receiver methods
  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    this.pc.ondatachannel = (event) => {
      console.log('Data channel received');
      this.dc = event.channel;
      this.setupDataChannel(this.dc);
    };

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    console.log('Gathering ICE candidates for answer...');
    await this.waitForICE();
    console.log('ICE gathering for answer complete');

    return this.pc.localDescription!;
  }

  private setupDataChannel(dc: RTCDataChannel) {
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = 1024 * 1024; // 1MB

    dc.onopen = () => {
      console.log('Data channel open state:', dc.readyState);
      this.events.onConnected(); // Trigger connected UI on channel open
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
    
    dc.onclose = () => {
      console.log('Data channel closed');
      this.events.onDisconnected();
    };

    dc.onerror = (_e) => {
      console.error('Data channel error');
      this.events.onError('Data channel error');
    };
  }

  async sendFile(file: File) {
    if (!this.dc || this.dc.readyState !== 'open') {
      console.error('Data channel not ready:', this.dc?.readyState);
      this.events.onError('Connection not ready');
      return;
    }

    // Send metadata
    this.dc.send(JSON.stringify({
      name: file.name,
      size: file.size,
      type: file.type
    }));

    // Send chunks
    const chunkSize = 16 * 1024; // 16KB for better stability
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
