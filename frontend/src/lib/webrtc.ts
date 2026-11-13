/**
 * P2PManager — raw WebRTC orchestration.
 *
 * Owns the RTCPeerConnection + signaling channel; delegates the data-channel
 * file/text protocol to a TransferSession. Signaling (SDP/ICE) flows over the
 * SignalingChannel (RoomDO WebSocket relay).
 */

import { SignalingChannel, fetchIceServers, mintRoom } from './signaling';
import type { WireSignal } from '../types';
import { TransferSession } from './transfer';
import type { TransferEvents } from './transfer';

export type P2PEvents = {
  onConnected: () => void;
  onDisconnected: () => void;
  onReceiverConnected?: () => void;
  /**
   * The room ended on its own: the code expired before anyone joined, or
   * the session sat idle for too long. `no-peer` means nobody ever turned
   * up; `ended` means the session is over.
   */
  onRoomEnded?: (reason: 'no-peer' | 'ended') => void;
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
  /** Set when the session is closed on purpose, so a close is not a disconnect. */
  private closed = false;
  /** Set when the room ended on its own, so its close is not a disconnect. */
  private ended = false;
  /** Whether a peer has ever been seen in this room. */
  private peerPresent = false;
  /**
   * ICE candidates that arrived before the remote description was applied.
   *
   * `addIceCandidate` throws `InvalidStateError` until the remote
   * description is set, and the relay does not order the frames: a candidate
   * can easily beat the SDP across the wire. Dropping it — which is what
   * `addIceCandidate` does when it throws — loses a candidate silently, and
   * the connection then fails to establish on a slow network. They are held
   * here until the description lands and applied in order.
   */
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(events: P2PEvents) {
    this.events = events;
    this.signaling = new SignalingChannel({
      onMessage: (msg) => this.onSignal(msg),
      onError: () => this.events.onError('Signaling tunnel failed'),
      // Through `notifyDisconnected`, so a socket that closes because the
      // session was ended on purpose is not reported as a lost peer.
      onClose: () => this.notifyDisconnected(),
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
        this.peerPresent = true;
        if (this.role === 'sender') this.maybeSendOffer();
        break;
      case 'peer-left':
        this.notifyDisconnected();
        break;
      case 'room-expired':
        // The room ran out of time. The socket is about to close, and that
        // close is not a disconnect — the room ended, and the app has to say
        // why rather than blame the other device.
        this.ended = true;
        this.events.onRoomEnded?.(this.peerPresent ? 'ended' : 'no-peer');
        break;
      case 'offer':
        if (this.role === 'receiver') void this.handleOffer(msg.sdp);
        break;
      case 'answer':
        if (this.role === 'sender') void this.handleAnswer(msg.sdp);
        break;
      case 'ice':
        void this.addRemoteCandidate(msg.candidate);
        break;
    }
  }

  /**
   * Apply a candidate from the peer, or hold it until the remote
   * description is in place.
   */
  private async addRemoteCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.pc;
    if (!pc) return;

    if (!pc.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }

    try {
      await pc.addIceCandidate(candidate);
    } catch (err) {
      console.warn('[RTC] addIceCandidate failed:', err);
    }
  }

  /** Apply the candidates that arrived before the remote description. */
  private async flushPendingCandidates(): Promise<void> {
    const pc = this.pc;
    if (!pc) return;

    const pending = this.pendingCandidates;
    this.pendingCandidates = [];

    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn('[RTC] addIceCandidate failed:', err);
      }
    }
  }

  /**
   * Tell the app the peer is gone.
   *
   * A session that is closed on purpose is not a disconnect: `close()` is
   * called when the user ends the session or the app resets, and the
   * data channel and the WebSocket both report back when they close. Without
   * this guard the app would report a failure for a session the user
   * finished. A room that ran out of time is not a disconnect either — it
   * has already reported why.
   */
  private notifyDisconnected(): void {
    if (this.closed || this.ended) return;
    this.events.onDisconnected();
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
    try {
      // The offer is proof that the other device is there.
      this.peerPresent = true;
      await this.pc.setRemoteDescription(sdp);
      await this.flushPendingCandidates();
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.signaling.send({ type: 'answer', sdp: answer });
    } catch (err) {
      console.error('[RTC] could not answer the offer:', err);
      this.events.onError('Could not establish the connection');
    }
  }

  private async handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) return;
    try {
      await this.pc.setRemoteDescription(sdp);
      await this.flushPendingCandidates();
    } catch (err) {
      console.error('[RTC] could not apply the answer:', err);
      this.events.onError('Could not establish the connection');
    }
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
      // `disconnected` is transient — ICE can recover from it, and the data
      // channel reports the real end of a session. `failed` is the state
      // that means the connection is gone for good, and it is handled above.
      if (state === 'closed') this.notifyDisconnected();
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
    this.transfer = new TransferSession(dc, {
      ...this.events,
      onProtocolError: (message) => this.events.onError(message),
    });
    dc.onopen = () => {
      if (this.role === 'sender') this.events.onReceiverConnected?.();
      else this.events.onConnected();
    };
    dc.onclose = () => this.notifyDisconnected();
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
    // A deliberate close is not a disconnect — see `notifyDisconnected`.
    this.closed = true;
    this.pendingCandidates = [];
    this.transfer = null;
    this.dc?.close();
    this.pc?.close();
    this.signaling.close();
    this.dc = null;
    this.pc = null;
  }
}
