/** Owns one cancellable peer session, including serialized TURN renewal. */
import { SignalingChannel, fetchPeerIce, mintRoom, type IceConfig } from './signaling';
import type { WireSignal } from '../types';
import { TransferSession, type TransferEvents } from './transfer';
import { abortError, delay } from './async';
import { newTransferId } from './transfer-protocol';

export type P2PEvents = {
  onConnected: () => void;
  onDisconnected: () => void;
  onReceiverConnected?: () => void;
  onRoomEnded?: (reason: 'no-peer' | 'ended') => void;
  onConnectionWarning?: (message: string | null) => void;
  onError: (error: string) => void;
} & TransferEvents;
const RENEW_MARGIN_MS = 15 * 60_000;

export class P2PManager {
  private readonly events: P2PEvents;
  private readonly lifetime = new AbortController();
  private readonly signaling: SignalingChannel;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private transfer: TransferSession | null = null;
  private role: 'sender' | 'receiver' = 'receiver';
  private room = '';
  private token = '';
  private config: IceConfig | null = null;
  private booted = false;
  private peerPresent = false;
  private closed = false;
  private connected = false;
  private makingOffer = false;
  private offered = false;
  private localGeneration = '';
  private remoteGeneration = '';
  private readonly retiredGenerations = new Set<string>();
  private readonly candidates = new Map<string, RTCIceCandidateInit[]>();
  private earlySignals: WireSignal[] = [];
  private signals: Promise<void> = Promise.resolve();
  private renewTimer: ReturnType<typeof setTimeout> | null = null;
  private negotiationTimer: ReturnType<typeof setTimeout> | null = null;
  private renewing = false;
  private renewRequested = false;
  private refreshId: string | null = null;
  private readonly onVisible = () => {
    if (document.visibilityState === 'visible' && this.config?.expiresAt &&
      this.config.expiresAt - Date.now() <= RENEW_MARGIN_MS) this.requestRenewal();
  };

  constructor(events: P2PEvents) {
    this.events = events;
    this.signaling = new SignalingChannel({
      onMessage: (message) => this.receiveSignal(message),
      onError: () => this.fail('Signaling tunnel failed'),
      onClose: () => { if (!this.closed) { this.events.onDisconnected(); this.close(); } },
    });
    document.addEventListener('visibilitychange', this.onVisible);
  }
  async initialize(): Promise<string> {
    this.role = 'sender';
    try {
      const code = await mintRoom(this.lifetime.signal);
      this.active(); await this.bootstrap(code); return code;
    } catch (error) { this.close(); throw error; }
  }
  async join(code: string): Promise<void> {
    this.role = 'receiver';
    try { await this.bootstrap(code); } catch (error) { this.close(); throw error; }
  }
  private active(pc?: RTCPeerConnection): void {
    if (this.closed || this.lifetime.signal.aborted || (pc && this.pc !== pc)) throw abortError();
  }
  private async bootstrap(code: string): Promise<void> {
    this.active(); this.room = code;
    const admission = await this.signaling.open(code, this.role);
    this.active(); this.token = admission.token;
    await this.loadCredentials(); this.active();
    const pc = this.setupConnection();
    if (this.role === 'sender') { this.dc = pc.createDataChannel('files', { ordered: true }); this.attachChannel(this.dc); }
    this.booted = true;
    this.signaling.send({ type: 'ready' });
    for (const message of this.earlySignals) this.queueSignal(message);
    this.earlySignals = [];
    this.scheduleRenewal();
  }
  private receiveSignal(message: WireSignal): void {
    if (this.closed) return;
    if (message.type === 'room-expired') {
      this.events.onRoomEnded?.(this.peerPresent ? 'ended' : 'no-peer'); this.close(); return;
    }
    if (message.type === 'peer-left') { this.events.onDisconnected(); this.close(); return; }
    if (!this.booted) {
      if (this.earlySignals.length >= 128) { this.fail('Too many early signaling frames'); return; }
      this.earlySignals.push(message); return;
    }
    this.queueSignal(message);
  }
  private queueSignal(message: WireSignal): void {
    this.signals = this.signals.then(async () => {
      this.active(); await this.handleSignal(message);
    }).catch(() => { if (!this.closed) this.fail('Could not establish or renew the connection'); });
  }
  private async handleSignal(message: WireSignal): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    switch (message.type) {
      case 'hello':
        if (message.version !== 2) this.fail('Reload AuraShare on both devices to use the current protocol.');
        return;
      case 'peer-present': this.peerPresent = true; return;
      case 'ready':
        this.peerPresent = true;
        if (this.role === 'sender' && !this.offered) await this.offer(false);
        return;
      case 'refresh-request':
        if (this.role === 'sender') this.requestRenewal();
        return;
      case 'refresh-prepare':
        if (this.role !== 'receiver' || this.refreshId) throw new Error('Unexpected renewal');
        this.refreshId = message.id; this.renewing = true; this.transfer?.setPaused(true);
        this.watchNegotiation();
        await this.loadCredentials(); this.active(pc);
        pc.setConfiguration({ iceServers: this.config!.iceServers });
        this.signaling.send({ type: 'refresh-ready', id: message.id });
        return;
      case 'refresh-ready':
        if (this.role !== 'sender' || this.refreshId !== message.id) throw new Error('Unexpected renewal acknowledgement');
        await this.offer(true); return;
      case 'offer': {
        if (!message.generation) { this.fail('Reload AuraShare on both devices to use the current protocol.'); return; }
        if (this.role !== 'receiver' || !message.generation || pc.signalingState !== 'stable' ||
          (this.offered && this.refreshId !== message.generation)) throw new Error('Unexpected offer');
        this.offered = true; this.peerPresent = true;
        this.adoptRemoteGeneration(message.generation);
        this.localGeneration = message.generation;
        await pc.setRemoteDescription(message.sdp); this.active(pc);
        await this.flushCandidates(pc, message.generation); this.active(pc);
        const answer = await pc.createAnswer(); this.active(pc);
        await pc.setLocalDescription(answer); this.active(pc);
        this.signaling.send({ type: 'answer', sdp: answer, generation: message.generation });
        this.resumeWhenConnected(); return;
      }
      case 'answer':
        if (this.role !== 'sender' || !message.generation || message.generation !== this.localGeneration || pc.signalingState !== 'have-local-offer') throw new Error('Unexpected answer');
        this.adoptRemoteGeneration(message.generation);
        await pc.setRemoteDescription(message.sdp); this.active(pc);
        await this.flushCandidates(pc, message.generation); this.active(pc);
        this.makingOffer = false; this.resumeWhenConnected();
        if (this.renewRequested && !this.renewing) { this.renewRequested = false; this.requestRenewal(); }
        return;
      case 'ice':
        if (!message.generation || this.retiredGenerations.has(message.generation)) return;
        if (!pc.remoteDescription || message.generation !== this.remoteGeneration) {
          const count = [...this.candidates.values()].reduce((sum, items) => sum + items.length, 0);
          if (count >= 128 || (!this.candidates.has(message.generation) && this.candidates.size >= 2)) throw new Error('ICE candidate limit exceeded');
          const list = this.candidates.get(message.generation) ?? [];
          list.push(message.candidate); this.candidates.set(message.generation, list); return;
        }
        await pc.addIceCandidate(message.candidate); this.active(pc); return;
      case 'peer-left': case 'room-expired': return;
    }
  }
  private adoptRemoteGeneration(generation: string): void {
    if (this.remoteGeneration && this.remoteGeneration !== generation) {
      this.retiredGenerations.add(this.remoteGeneration);
      if (this.retiredGenerations.size > 8) this.retiredGenerations.delete(this.retiredGenerations.values().next().value!);
      this.candidates.delete(this.remoteGeneration);
    }
    this.remoteGeneration = generation;
  }
  private async flushCandidates(pc: RTCPeerConnection, generation: string): Promise<void> {
    const candidates = this.candidates.get(generation) ?? []; this.candidates.delete(generation);
    for (const candidate of candidates) { this.active(pc); await pc.addIceCandidate(candidate); }
  }
  private async offer(restart: boolean): Promise<void> {
    const pc = this.pc;
    if (!pc || this.makingOffer || pc.signalingState !== 'stable') return;
    this.makingOffer = true; this.offered = true;
    this.localGeneration = this.refreshId ?? newTransferId();
    this.watchNegotiation();
    const offer = await pc.createOffer({ iceRestart: restart }); this.active(pc);
    await pc.setLocalDescription(offer); this.active(pc);
    this.signaling.send({ type: 'offer', sdp: offer, generation: this.localGeneration });
  }
  private async loadCredentials(): Promise<void> {
    let error: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const config = await fetchPeerIce(this.room, this.token, this.lifetime.signal);
        this.active(); this.config = config;
        this.events.onConnectionWarning?.(config.degraded ? 'Relay unavailable: some networks may not connect.' : null);
        return;
      } catch (caught) {
        error = caught; this.active();
        if (!this.connected || attempt === 2) break;
        await delay(30_000, this.lifetime.signal);
      }
    }
    throw error;
  }
  private scheduleRenewal(): void {
    if (this.renewTimer !== null) clearTimeout(this.renewTimer);
    this.renewTimer = null;
    if (!this.closed && this.config?.expiresAt) {
      this.renewTimer = setTimeout(() => this.requestRenewal(), Math.max(1000, this.config.expiresAt - Date.now() - RENEW_MARGIN_MS));
    }
  }
  private requestRenewal(): void {
    if (this.closed || this.renewing) return;
    if (!this.connected || this.makingOffer) { this.renewRequested = true; return; }
    if (this.role === 'receiver') {
      try { this.signaling.send({ type: 'refresh-request' }); this.watchNegotiation(); }
      catch { this.fail('Could not request relay renewal'); }
      return;
    }
    this.renewing = true; this.refreshId = newTransferId(); this.transfer?.setPaused(true);
    // Keep a bounded deadline across fetch and renegotiation, even on a silent peer.
    this.watchNegotiation(120_000);
    void this.loadCredentials().then(() => {
      this.active(); this.pc?.setConfiguration({ iceServers: this.config!.iceServers });
      this.signaling.send({ type: 'refresh-prepare', id: this.refreshId! });
    }).catch(() => { if (!this.closed) this.fail('Relay renewal failed. Start a new session.'); });
  }
  private watchNegotiation(ms = 120_000): void {
    if (this.negotiationTimer !== null) clearTimeout(this.negotiationTimer);
    this.negotiationTimer = setTimeout(() => this.fail('Connection negotiation timed out'), ms);
  }
  private resumeWhenConnected(): void {
    const pc = this.pc;
    if (!pc || pc.signalingState !== 'stable' || !['connected', 'completed'].includes(pc.iceConnectionState)) return;
    if (this.negotiationTimer !== null) clearTimeout(this.negotiationTimer);
    this.negotiationTimer = null;
    this.renewing = false; this.refreshId = null; this.transfer?.setPaused(false);
    this.scheduleRenewal();
  }
  private setupConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: this.config!.iceServers }); this.pc = pc;
    pc.onicecandidate = (event) => {
      if (this.closed || this.pc !== pc || !event.candidate || !this.localGeneration) return;
      const candidate = event.candidate;
      if (candidate.usernameFragment && !pc.localDescription?.sdp.includes(`a=ice-ufrag:${candidate.usernameFragment}`)) return;
      try { this.signaling.send({ type: 'ice', candidate: candidate.toJSON(), generation: this.localGeneration }); }
      catch { this.fail('Could not send ICE candidate'); }
    };
    pc.oniceconnectionstatechange = () => {
      if (this.closed || this.pc !== pc) return;
      if (pc.iceConnectionState === 'failed') { this.fail('ICE negotiation failed'); return; }
      if (pc.iceConnectionState === 'closed') { this.events.onDisconnected(); this.close(); return; }
      this.resumeWhenConnected();
    };
    pc.ondatachannel = (event) => {
      if (this.closed || this.dc) { event.channel.close(); return; }
      this.dc = event.channel; this.attachChannel(event.channel);
    };
    return pc;
  }
  private attachChannel(dc: RTCDataChannel): void {
    const alive = () => !this.closed && this.dc === dc;
    this.transfer = new TransferSession(dc, {
      ...this.events,
      onReady: () => {
        if (!alive()) return;
        this.connected = true;
        if (this.role === 'sender') this.events.onReceiverConnected?.(); else this.events.onConnected();
        if (this.renewRequested) { this.renewRequested = false; this.requestRenewal(); }
      },
      onProtocolError: (message) => this.fail(message),
    }, { role: this.role, maxMessageSize: () => this.pc?.sctp?.maxMessageSize ?? 65536 });
    dc.onopen = () => { if (alive()) { this.signaling.startHeartbeat(); this.transfer?.start(); } };
    dc.onclose = () => { if (alive()) { this.events.onDisconnected(); this.close(); } };
    dc.onerror = () => { if (alive()) this.fail('Data channel error'); };
    if (dc.readyState === 'open') dc.onopen(new Event('open'));
  }
  private fail(message: string): void {
    if (this.closed) return;
    this.close(); this.events.onError(message);
  }
  sendMeta(files: FileList | File[]): void { this.transfer?.sendMeta(files); }
  sendText(text: string): void { this.transfer?.sendText(text); }
  requestFile(index: number): void { this.transfer?.requestFile(index); }
  cancelTransfer(): void { this.transfer?.cancelCurrent(); }
  close(): void {
    if (this.closed) return;
    this.closed = true; this.lifetime.abort();
    document.removeEventListener('visibilitychange', this.onVisible);
    if (this.renewTimer !== null) clearTimeout(this.renewTimer);
    if (this.negotiationTimer !== null) clearTimeout(this.negotiationTimer);
    this.transfer?.dispose(); this.transfer = null;
    if (this.dc) { this.dc.onopen = null; this.dc.onclose = null; this.dc.onerror = null; this.dc.close(); }
    if (this.pc) { this.pc.onicecandidate = null; this.pc.oniceconnectionstatechange = null; this.pc.ondatachannel = null; this.pc.close(); }
    this.signaling.close(); this.dc = null; this.pc = null;
    this.candidates.clear(); this.earlySignals = []; this.token = '';
  }
}
