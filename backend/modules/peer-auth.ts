import { apiError, json } from './errors';
import { patchSocketState } from './socket-state';
import { generateIceConfig, TURN_RENEW_MARGIN_MS, type IceConfig } from './turn';

const TOKEN_TTL_MS = 24 * 60 * 60_000;
type Peer = {
  token: string;
  expiresAt: number;
  attempts: number;
  windowStart: number;
  lastAttempt: number;
  config?: IceConfig;
};
export type TurnEnv = { TURN_KEY_ID?: string; TURN_KEY_API_TOKEN?: string };

function attachment(socket: WebSocket): Peer | null {
  const data: unknown = socket.deserializeAttachment();
  if (!data || typeof data !== 'object' || !('token' in data) || typeof data.token !== 'string') return null;
  return data as Peer;
}
function supportsTimingSafeEqual(value: SubtleCrypto): value is SubtleCrypto & {
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
} {
  return 'timingSafeEqual' in value && typeof value.timingSafeEqual === 'function';
}
function equalToken(a: string, b: string): boolean {
  if (a.length !== 64 || b.length !== 64) return false;
  const subtle = crypto.subtle;
  if (!supportsTimingSafeEqual(subtle)) throw new Error('Timing-safe comparison is unavailable');
  return subtle.timingSafeEqual(new TextEncoder().encode(a), new TextEncoder().encode(b));
}

/** Authorization survives hibernation in the admitted socket attachment. */
export class PeerAuth {
  private readonly state: DurableObjectState;
  private readonly env: TurnEnv;
  private readonly pending = new Map<WebSocket, Promise<Response>>();
  constructor(state: DurableObjectState, env: TurnEnv) { this.state = state; this.env = env; }

  admit(socket: WebSocket): void {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
    const peer: Peer = { token, expiresAt: Date.now() + TOKEN_TTL_MS, attempts: 0, windowStart: 0, lastAttempt: 0 };
    patchSocketState(socket, peer);
    socket.send(JSON.stringify({ type: 'admitted', version: 2, token, expiresAt: peer.expiresAt }));
  }

  isRevoked(socket: WebSocket): boolean {
    const data: unknown = socket.deserializeAttachment();
    return !!data && typeof data === 'object' && 'revoked' in data && data.revoked === true;
  }

  /** A persistent tombstone deduplicates error/close callbacks, including legacy peers. */
  revoke(socket: WebSocket): boolean {
    if (this.isRevoked(socket)) return false;
    socket.serializeAttachment({ revoked: true });
    return true;
  }

  async issue(request: Request): Promise<Response> {
    const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
    const socket = this.state.getWebSockets().find((ws) => {
      const peer = attachment(ws);
      return ws.readyState === 1 && peer !== null && peer.expiresAt > Date.now() && equalToken(peer.token, token);
    });
    if (!socket) return apiError('unauthorized', 'A live room session is required', 401);
    let work = this.pending.get(socket);
    if (!work) {
      work = this.generate(socket);
      this.pending.set(socket, work);
    }
    try { return (await work).clone(); }
    finally { if (this.pending.get(socket) === work) this.pending.delete(socket); }
  }

  private async generate(socket: WebSocket): Promise<Response> {
    const peer = attachment(socket);
    if (!peer) return apiError('unauthorized', 'Session ended', 401);
    const now = Date.now();
    if (peer.config && (peer.config.expiresAt === null || peer.config.expiresAt - now > TURN_RENEW_MARGIN_MS)) {
      return json({ ...peer.config, serverTime: Date.now() });
    }
    if (now - peer.windowStart >= 60 * 60_000) { peer.windowStart = now; peer.attempts = 0; }
    if (now - peer.lastAttempt < 30_000 || peer.attempts >= 4) {
      return apiError('rate_limited', 'Credential issuance limit reached', 429, { 'Retry-After': '30' });
    }
    peer.lastAttempt = now;
    peer.attempts++;
    patchSocketState(socket, { windowStart: peer.windowStart, attempts: peer.attempts, lastAttempt: peer.lastAttempt });
    try {
      const config = await generateIceConfig(this.env.TURN_KEY_ID, this.env.TURN_KEY_API_TOKEN);
      if (socket.readyState !== 1 || !attachment(socket) || !this.state.getWebSockets().includes(socket)) {
        return apiError('unauthorized', 'Session ended', 401);
      }
      // Reserve attachment space for authorization, quotas and future traffic counters.
      if (new TextEncoder().encode(JSON.stringify(config)).byteLength > 1200) {
        throw new Error('Relay configuration exceeds the socket cache budget');
      }
      patchSocketState(socket, { config, expiresAt: Date.now() + TOKEN_TTL_MS });
      return json({ ...config, serverTime: Date.now() });
    } catch {
      console.error(JSON.stringify({ event: 'turn_issuance_failed' }));
      return apiError('turn_unavailable', 'Relay credentials could not be issued', 503);
    }
  }
}
