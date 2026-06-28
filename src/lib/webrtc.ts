/**
 * P2PManager — raw WebRTC orchestration.
 *
 * Owns the RTCPeerConnection + signaling channel; delegates the data-channel
 * file/text protocol to a TransferSession. Signaling (SDP/ICE) flows over the
 * SignalingChannel (RoomDO WebSocket relay).
 */

import { SignalingChannel, fetchIceServers, mintRoom } from './signaling';
import type { WireSignal } from './signaling';
import { TransferSession } from './transfer';
import type { TransferEvents } from './transfer';

export type P2PEvents = {
  onConnected: () => void;
  onDisconnected: () => void;
  onReceiverConnected?: () => void;
  onError: (err: string) => void;
} & TransferEvents;

const DATA_CHANNEL_LABEL = 'files';

export class P2PManager {
  private events: P2PEvents;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private transfer: TransferSession | null = null;
  private signaling: SignalingChannel;
  private role: 'sender' | 'receiver' | null = null;
  private iceServers: RTCIceServer[] = [];
  private offerSent = false;

  constructor(events: P2PEvents) {
    this.events = events;
    this.signaling = new SignalingChannel({
      onMessage: (msg) => this.onSignal(msg),
      onError: () => this.events.onError('Signaling tunnel failed'),
      onClose: () => this.events.onDisconnected(),
    });
  }

  /** Sender: mint a room, open signaling, create the data channel + offer. */
  async initialize(): Promise<string> {
    this.iceServers = await fetchIceServers();
    const roomId = await mintRoom();
    this.role = 'sender';
    const pc = this.setupPeerConnection();
    // Offerer creates the data channel so it is included in the SDP offer.
    this.dc = pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
    this.attachDataChannel(this.dc);
    await this.signaling.open(roomId, 'sender');
    return roomId;
  }

  /** Receiver: open signaling and wait for the sender's offer. */
  async join(targetId: string): Promise<void> {
    this.iceServers = await fetchIceServers();
    this.role = 'receiver';
    this.setupPeerConnection();
    await this.signaling.open(targetId, 'receiver');
  }

  // ─── Signaling handling ──────────────────────────────────────────────────

  private onSignal(msg: WireSignal): void {
    switch (msg.type) {
      case 'hello':
        if (this.role === 'sender' && msg.role === 'receiver') this.maybeSendOffer();
        break;
      case 'peer-present':
        if (this.role === 'sender') this.maybeSendOffer();
        break;
      case 'peer-left':
        this.events.onDisconnected();
        break;
      case 'offer':
        if (this.role === 'receiver') void this.handleOffer(msg.sdp);
        break;
      case 'answer':
        if (this.role === 'sender') void this.handleAnswer(msg.sdp);
        break;
      case 'ice':
        void this.pc?.addIceCandidate(msg.candidate).catch((err) => {
          console.warn('[RTC] addIceCandidate failed:', err);
        });
        break;
    }
  }

  private maybeSendOffer(): void {
    const pc = this.pc;
    if (this.offerSent || !pc) return;
    this.offerSent = true;
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer).then(() => offer))
      .then((offer) => this.signaling.send({ type: 'offer', sdp: offer }))
      .catch((err) => {
        console.error('[RTC] offer creation failed:', err);
        this.events.onError('Could not create offer');
      });
  }

  private async handleOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(sdp);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.signaling.send({ type: 'answer', sdp: answer });
  }

  private async handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(sdp);
  }

  // ─── Peer connection + data channel ─────────────────────────────────────

  private setupPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    pc.onicecandidate = (e) => {
      if (e.candidate) this.signaling.send({ type: 'ice', candidate: e.candidate.toJSON() });
    };
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'failed') this.events.onError('ICE negotiation failed');
      if (state === 'disconnected' || state === 'closed') this.events.onDisconnected();
    };
    pc.ondatachannel = (e) => {
      // Receiver side: the sender created the channel.
      this.dc = e.channel;
      this.attachDataChannel(this.dc);
    };
    this.pc = pc;
    return pc;
  }

  private attachDataChannel(dc: RTCDataChannel): void {
    this.transfer = new TransferSession(dc, this.events);
    dc.onopen = () => {
      if (this.role === 'sender') this.events.onReceiverConnected?.();
      else this.events.onConnected();
    };
    dc.onclose = () => this.events.onDisconnected();
    dc.onerror = (e) => {
      console.error('[RTC] data channel error:', e);
      this.events.onError('Data channel error');
    };
  }

  // ─── Sender API (delegate to the transfer session) ──────────────────────

  sendMeta(files: FileList | File[]): void {
    this.transfer?.sendMeta(files);
  }

  sendText(text: string): void {
    this.transfer?.sendText(text);
  }

  requestFile(index: number): void {
    this.transfer?.requestFile(index);
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  close(): void {
    this.transfer = null;
    this.dc?.close();
    this.pc?.close();
    this.signaling.close();
    this.dc = null;
    this.pc = null;
  }
}
