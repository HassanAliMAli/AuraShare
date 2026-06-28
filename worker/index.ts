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
  TURN_CF_URL?: string;
  TURN_CF_USERNAME?: string;
  TURN_CF_CREDENTIAL?: string;
  TURN_METERED_URL?: string;
  TURN_METERED_USERNAME?: string;
  TURN_METERED_CREDENTIAL?: string;
}

/** ICE server config shape (the client casts this to RTCIceServer[]). */
type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const ROOM_TTL_MS = 30 * 60 * 1000;

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

function buildIceServers(env: Env): IceServer[] {
  const ice: IceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  if (env.TURN_CF_URL && env.TURN_CF_USERNAME && env.TURN_CF_CREDENTIAL) {
    ice.push({ urls: env.TURN_CF_URL, username: env.TURN_CF_USERNAME, credential: env.TURN_CF_CREDENTIAL });
  }
  if (env.TURN_METERED_URL && env.TURN_METERED_USERNAME && env.TURN_METERED_CREDENTIAL) {
    ice.push({ urls: env.TURN_METERED_URL, username: env.TURN_METERED_USERNAME, credential: env.TURN_METERED_CREDENTIAL });
  }
  return ice;
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return withCors(new Response(null));

    if (path === '/api/ice-servers' && request.method === 'GET') {
      return withCors(json({ iceServers: buildIceServers(env) }));
    }

    if (path === '/api/room' && request.method === 'POST') {
      return withCors(json({ roomId: generateRoomCode() }));
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
