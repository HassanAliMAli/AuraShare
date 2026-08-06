/**
 * AuraShare Worker — Durable Object signaling relay + static asset edge.
 *
 * One RoomDO instance per room code acts as a dumb WebSocket relay between two
 * peers, exchanging SDP offer/answer + trickle ICE candidates in real time.
 * No room state is persisted; the DO hibernates between messages (free-tier
 * friendly) and auto-evicts after ROOM_TTL_MS of inactivity.
 */

interface Env {
  ROOMS: DurableObjectNamespace;
  /** Cloudflare Calls TURN key ID + API token (set via `wrangler secret put`). */
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}

/** ICE server config shape (the client casts this to RTCIceServer[]). */
type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

/** Response from the Cloudflare Calls credential-generation API. */
type CloudflareIceResponse = {
  iceServers: IceServer[];
  // Cloudflare returns expiry info; we track it to refresh before TTL ends.
  expiresOn?: string;
};

const ROOM_TTL_MS = 30 * 60 * 1000;
const TURN_CREDENTIAL_TTL_SECONDS = 86400; // 24h — covers the longest expected session.
const TURN_REFRESH_MARGIN_MS = 60 * 60 * 1000; // Refresh when <1h remains.

/** Module-level cache so we don't call the CF API on every ice-servers request. */
let cachedIceServers: IceServer[] | null = null;
let cachedExpiry = 0;

const STUN_ONLY_FALLBACK: IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/** Crockford base32 — excludes I, L, O, U to avoid ambiguity. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function generateRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = '';
  for (const b of bytes) {
    code += CROCKFORD[b % 32] ?? '0';
  }
  return code;
}

/**
 * Returns ICE servers with ephemeral TURN credentials from Cloudflare Calls.
 * Caches the result until near-expiry; falls back to STUN-only on error or
 * when TURN secrets aren't configured.
 */
async function getIceServers(env: Env): Promise<IceServer[]> {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) {
    return STUN_ONLY_FALLBACK;
  }
  // Serve from cache if still fresh.
  if (cachedIceServers && Date.now() < cachedExpiry - TURN_REFRESH_MARGIN_MS) {
    return cachedIceServers;
  }
  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: TURN_CREDENTIAL_TTL_SECONDS }),
      },
    );
    if (!res.ok) {
      console.warn('[TURN] CF API returned', res.status, '— falling back to STUN-only');
      return cachedIceServers ?? STUN_ONLY_FALLBACK;
    }
    const data = (await res.json()) as CloudflareIceResponse;
    if (!data.iceServers || data.iceServers.length === 0) {
      return STUN_ONLY_FALLBACK;
    }
    // Parse expiry if provided; otherwise assume TTL minus a safety margin.
    const expiryMs = data.expiresOn
      ? Date.parse(data.expiresOn)
      : Date.now() + (TURN_CREDENTIAL_TTL_SECONDS * 1000);
    cachedIceServers = data.iceServers;
    cachedExpiry = expiryMs;
    return data.iceServers;
  } catch (err) {
    console.error('[TURN] credential generation failed:', err);
    return cachedIceServers ?? STUN_ONLY_FALLBACK;
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
};

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      ...SECURITY_HEADERS,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null);

    if (path === '/api/ice-servers' && request.method === 'GET') {
      return json({ iceServers: await getIceServers(env) });
    }

    if (path === '/api/room' && request.method === 'POST') {
      return json({ roomId: generateRoomCode() });
    }

    const wsMatch = path.match(/^\/api\/room\/([A-Z0-9]{6})\/ws$/);
    if (wsMatch) {
      const code = wsMatch[1];
      if (!code) return new Response('Bad room code', { status: 400 });
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }
      const id = env.ROOMS.idFromName(code);
      const stub = env.ROOMS.get(id);
      // Forward the original request so the DO sees the Upgrade header.
      return stub.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};

/**
 * Durable Object: one per room. Relays WebSocket messages between the two peers
 * and broadcasts `peer-present` when the second peer connects.
 */
export class RoomDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.state.acceptWebSocket(server);

    const sockets = this.state.getWebSockets();
    if (sockets.length > 2) {
      // Third peer — reject.
      server.close(4000, 'room full');
      return new Response(null, { status: 101, webSocket: client });
    }

    if (sockets.length === 2) {
      // Second peer joined — notify both that a peer is present.
      for (const s of sockets) {
        s.send(JSON.stringify({ type: 'peer-present' }));
      }
    }

    await this.state.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    // Refresh the eviction alarm on any activity.
    await this.state.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    // Dumb relay: forward to every other socket in the room.
    for (const s of this.state.getWebSockets()) {
      if (s !== ws) s.send(message);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    for (const s of this.state.getWebSockets()) {
      if (s !== ws) s.send(JSON.stringify({ type: 'peer-left' }));
    }
    ws.close(code, reason);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('[RoomDO] websocket error:', error);
    ws.close(1011, 'WebSocket error');
  }

  async alarm(): Promise<void> {
    // Idle TTL expired — close all sockets so the DO can evict.
    for (const s of this.state.getWebSockets()) {
      s.close(1000, 'room expired');
    }
  }
}
