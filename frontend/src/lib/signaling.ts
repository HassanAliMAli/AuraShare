/** Cancellable room admission, signaling, and per-peer ICE credentials. */
import type { WireSignal } from '../types';
import { isIceServerList, isRoomResponse, parseWireSignal } from './protocol';
import { HEARTBEAT_FRAME, HEARTBEAT_INTERVAL_MS } from '../../../shared/heartbeat';
import { abortError, delay } from './async';
export type { WireSignal } from '../types';
export type IceConfig = { iceServers: RTCIceServer[]; expiresAt: number | null; degraded: boolean };
export type Admission = { token: string; expiresAt: number };

export async function mintRoom(signal?: AbortSignal): Promise<string> {
  const res = await fetch('/api/room', { method: 'POST', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) });
  const data: unknown = await res.json();
  if (!res.ok || !isRoomResponse(data)) throw new Error('Could not open a room');
  return data.roomId;
}
export async function fetchPeerIce(code: string, token: string, signal: AbortSignal): Promise<IceConfig> {
  const requestedAt = Date.now();
  const response = await fetch(`/api/room/${code}/ice-servers`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  });
  if (!response.ok) throw new Error('Could not obtain relay configuration');
  const body: unknown = await response.json();
  if (!isIceServerList(body) || !('expiresAt' in body) || !('degraded' in body) ||
    typeof body.degraded !== 'boolean' ||
    (body.expiresAt !== null && (typeof body.expiresAt !== 'number' || !Number.isFinite(body.expiresAt) || body.expiresAt <= 0))) {
    throw new Error('Invalid relay configuration');
  }
  const expiresAt = body.expiresAt === null ? null :
    ('serverTime' in body && typeof body.serverTime === 'number' && Number.isFinite(body.serverTime)
      ? requestedAt + Number(body.expiresAt) - body.serverTime : Number(body.expiresAt));
  if (expiresAt !== null && expiresAt <= Date.now()) throw new Error('Relay credentials have expired');
  return { iceServers: body.iceServers, expiresAt, degraded: body.degraded };
}
export type SignalingCallbacks = { onMessage: (msg: WireSignal) => void; onError: () => void; onClose: () => void };

export class SignalingChannel {
  private ws: WebSocket | null = null;
  private readonly cb: SignalingCallbacks;
  private readonly lifetime = new AbortController();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  constructor(cb: SignalingCallbacks) { this.cb = cb; }

  async open(code: string, role: 'sender' | 'receiver'): Promise<Admission> {
    for (let attempt = 0; attempt < 3; attempt++) {
      this.lifetime.signal.throwIfAborted();
      try { return await this.openOnce(code, role); }
      catch (error) {
        if (this.lifetime.signal.aborted || attempt === 2) throw error;
        await delay(250, this.lifetime.signal);
      }
    }
    throw new Error('Could not open signaling');
  }

  private openOnce(code: string, role: 'sender' | 'receiver'): Promise<Admission> {
    const signal = this.lifetime.signal;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/api/room/${code}/ws?v=2`);
    this.ws = ws;
    return new Promise((resolve, reject) => {
      let admitted = false;
      const cleanupWait = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); };
      const detach = () => { ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null; };
      const fail = (error: Error) => {
        cleanupWait(); detach();
        if (this.ws === ws) this.ws = null;
        ws.close(); reject(error);
      };
      const abort = () => fail(abortError());
      const timer = setTimeout(() => fail(new Error('Room admission timed out; reload both devices')), 10_000);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      ws.onopen = () => {
        if (signal.aborted) { abort(); return; }
        ws.send(JSON.stringify({ type: 'hello', role, version: 2 } satisfies WireSignal));
      };
      ws.onmessage = (event) => {
        if (signal.aborted || this.ws !== ws || typeof event.data !== 'string' || event.data.length > 262144) return;
        let raw: unknown;
        try { raw = JSON.parse(event.data); } catch { return; }
        if (!admitted && raw && typeof raw === 'object' && 'type' in raw && raw.type === 'admitted') {
          if (!('version' in raw) || raw.version !== 2 || !('token' in raw) || typeof raw.token !== 'string' ||
            !/^[a-f0-9]{64}$/.test(raw.token) || !('expiresAt' in raw) || typeof raw.expiresAt !== 'number' || raw.expiresAt <= Date.now()) {
            fail(new Error('Unsupported room; reload both devices')); return;
          }
          admitted = true; cleanupWait(); resolve({ token: raw.token, expiresAt: raw.expiresAt }); return;
        }
        const message = parseWireSignal(raw);
        if (message) this.cb.onMessage(message);
      };
      ws.onerror = () => {
        if (!admitted) { fail(new Error('Signaling connection failed')); return; }
        if (!signal.aborted && this.ws === ws) { this.stopHeartbeat(); this.cb.onError(); }
      };
      ws.onclose = () => {
        if (!admitted) { fail(new Error('Room closed before admission')); return; }
        cleanupWait(); detach();
        if (signal.aborted || this.ws !== ws) return;
        this.ws = null; this.stopHeartbeat(); this.cb.onClose();
      };
    });
  }
  send(msg: WireSignal): void {
    if (this.lifetime.signal.aborted) return;
    if (this.ws?.readyState !== WebSocket.OPEN) throw new Error('Signaling is not open');
    this.ws.send(JSON.stringify(msg));
  }
  startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) { this.stopHeartbeat(); return; }
      try { this.ws.send(HEARTBEAT_FRAME); } catch { this.stopHeartbeat(); this.cb.onError(); }
    }, HEARTBEAT_INTERVAL_MS);
  }
  stopHeartbeat(): void {
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }
  close(): void {
    this.stopHeartbeat(); this.lifetime.abort();
    const ws = this.ws; this.ws = null;
    if (ws) { ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null; ws.close(); }
  }
}
