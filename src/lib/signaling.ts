type FileDescriptor = {
  name: string;
  size: number;
  type: string;
};

type SignalingEvents = {
  onProgress: (progress: number) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onReceiverConnected?: () => void;
  onFileDescriptorsReceived?: (files: FileDescriptor[]) => void;
  onFilesReceived: (files: File[]) => void;
  onTransferComplete: () => void;
  onError: (err: string) => void;
};

type Config = {
  signalingUrl: string;
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:openrelay.metered.ca:80' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelay', credential: 'openrelay' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelay', credential: 'openrelay' }
];

export class SignalingManager {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private events: SignalingEvents;
  private config: Config;
  private roomId: string = '';

  private receiveBuffer: any[] = [];
  private receivedSize = 0;
  private metadata: FileDescriptor | null = null;
  private pendingFiles: File[] = [];
  private pendingFileList: FileList | null = null;
  private pollInterval: any = null;

  constructor(events: SignalingEvents, config: Config) {
    this.events = events;
    this.config = config;
  }

  private generateRoomId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private createPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected') {
        this.events.onConnected();
      }
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        this.events.onDisconnected();
      }
    };

    pc.ondatachannel = (event) => {
      this.dc = event.channel;
      this.setupDataChannel();
    };

    return pc;
  }

  private setupDataChannel() {
    if (!this.dc) return;

    this.dc.onopen = () => {
      console.log('[Signaling] DataChannel open');
    };

    this.dc.onmessage = (event) => {
      this.handleData(event.data);
    };

    this.dc.onclose = () => {
      this.events.onDisconnected();
    };
  }

  private handleData(data: any) {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data);
        if (msg.kind === 'transfer-complete') {
          this.events.onFilesReceived(this.pendingFiles);
        } else if (msg.kind === 'file-descriptors') {
          this.events.onFileDescriptorsReceived?.(msg.files);
        } else if (msg.kind === 'file-request') {
          const fileIndex = msg.index;
          if (this.pendingFileList && this.pendingFileList[fileIndex]) {
            this.startTransferForFile(this.pendingFileList[fileIndex]);
          }
        }
      } catch (e) {}
    } else {
      if (!this.metadata) return;
      const buffer = data instanceof ArrayBuffer ? data : data.buffer;
      this.receiveBuffer.push(buffer);
      this.receivedSize += buffer.byteLength;

      this.events.onProgress((this.receivedSize / this.metadata.size) * 100);
      if (this.receivedSize >= this.metadata.size) {
        const file = new File([new Blob(this.receiveBuffer)], this.metadata.name, { type: this.metadata.type });
        this.pendingFiles.push(file);
        this.metadata = null;
        this.receiveBuffer = [];
      }
    }
  }

  private sendData(data: string | ArrayBuffer) {
    if (!this.dc || this.dc.readyState !== 'open') {
      console.warn('[Signaling] DataChannel not open');
      return false;
    }
    if (typeof data === 'string') {
      this.dc.send(data);
    } else {
      this.dc.send(new Uint8Array(data));
    }
    return true;
  }

  async createRoom(): Promise<string> {
    const roomId = this.generateRoomId();
    this.roomId = roomId;

    const res = await fetch(`${this.config.signalingUrl}/api/room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'sender' })
    });
    const data = await res.json();
    const actualRoomId = data.roomId || roomId;
    this.roomId = actualRoomId;

    this.pc = this.createPeerConnection();
    this.dc = this.pc.createDataChannel('files', { ordered: true });

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    const offerData = JSON.stringify(offer);
    await fetch(`${this.config.signalingUrl}/api/room/${actualRoomId}/offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offer: offerData })
    });

    this.startPollingForAnswer();

    return actualRoomId;
  }

  async joinRoom(targetRoomId: string): Promise<void> {
    this.roomId = targetRoomId;

    this.pc = this.createPeerConnection();

    const offerRes = await fetch(`${this.config.signalingUrl}/api/room/${targetRoomId}/offer`);
    if (!offerRes.ok) throw new Error('Room not found');
    const { offer } = await offerRes.json() as { offer: string };
    const offerObj = JSON.parse(offer);

    await this.pc.setRemoteDescription(new RTCSessionDescription(offerObj));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    const answerData = JSON.stringify(answer);
    await fetch(`${this.config.signalingUrl}/api/room/${targetRoomId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: answerData })
    });

    this.setupDataChannel();
    this.events.onConnected();
  }

  private async startPollingForAnswer() {
    this.pollInterval = setInterval(async () => {
      if (!this.pc || !this.roomId) return;

      const res = await fetch(`${this.config.signalingUrl}/api/room/${this.roomId}/answer`);
      if (!res.ok) return;

      const { answer } = await res.json() as { answer: string | null };
      if (answer) {
        clearInterval(this.pollInterval);
        const answerObj = JSON.parse(answer);
        await this.pc!.setRemoteDescription(new RTCSessionDescription(answerObj));
        this.events.onReceiverConnected?.();
        this.setupDataChannel();
      }
    }, 200);
  }

  requestFile(index: number) {
    this.sendData(JSON.stringify({ kind: 'file-request', index }));
  }

  sendMeta(files: FileList | File[]) {
    const fileArray = files instanceof FileList ? Array.from(files) : files;
    this.pendingFileList = files instanceof FileList ? files : null;
    if (fileArray.length === 0) return;

    const descriptors: FileDescriptor[] = fileArray.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
    }));

    this.sendData(JSON.stringify({ kind: 'file-descriptors', files: descriptors }));
  }

  private startTransferForFile(file: File) {
    const chunkSize = 1024 * 1024;
    const MAX_BUFFER_SIZE = 4 * 1024 * 1024;
    const PROGRESS_INTERVAL = 50;
    let offset = 0;
    let chunksSinceProgress = 0;

    this.sendData(JSON.stringify({
      kind: 'file-metadata',
      name: file.name,
      size: file.size,
      type: file.type
    }));

    (async () => {
      while (offset < file.size) {
        if (this.dc && this.dc.bufferedAmount > MAX_BUFFER_SIZE) {
          await new Promise<void>((resolve) => {
            const checkBuffer = setInterval(() => {
              if (!this.dc || this.dc.bufferedAmount < MAX_BUFFER_SIZE / 2) {
                clearInterval(checkBuffer);
                resolve();
              }
            }, 20);
          });
        }

        const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
        const buffer = await slice.arrayBuffer();
        this.sendData(buffer);
        offset += buffer.byteLength;
        chunksSinceProgress++;
        if (chunksSinceProgress >= PROGRESS_INTERVAL) {
          this.events.onProgress((offset / file.size) * 100);
          chunksSinceProgress = 0;
        }
      }

      this.sendData(JSON.stringify({ kind: 'transfer-complete' }));
      this.events.onProgress(100);
      this.events.onTransferComplete();
    })();
  }

  startTransfer(files: FileList | File[]) {
    const fileArray = files instanceof FileList ? Array.from(files) : files;
    this.pendingFileList = files instanceof FileList ? files : null;
    if (fileArray.length === 0) return;

    (async () => {
      for (const file of fileArray) {
        this.startTransferForFile(file);
      }
    })();
  }

  close() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.dc?.close();
    this.pc?.close();
    this.pc = null;
    this.dc = null;
  }
}
