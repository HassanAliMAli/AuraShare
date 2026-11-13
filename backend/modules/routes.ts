/**
 * The HTTP surface of the Worker.
 *
 * Three routes and nothing else:
 *
 *   GET  /api/ice-servers        the ICE server list for the browser
 *   POST /api/room                mint a transmission code
 *   GET  /api/room/{code}/ws      the signalling WebSocket for a room
 *
 * Everything that is not one of those is a 404. The method has to match
 * exactly — the other method on a path is a 404 too.
 */

import { apiError, json, preflight } from './errors';
import { generateRoomCode, parseRoomCode } from './room-code';
import { MINT_PATH } from './room-protocol';
import { allowRequest, type RateLimiter } from './rate-limit';
import { getIceServers } from './turn';

/** The bindings and secrets the Worker reads. */
export interface Env {
  ROOMS: DurableObjectNamespace;
  /** The rate limiter for the room routes — see `modules/rate-limit.ts`. */
  ROOM_RATE_LIMITER?: RateLimiter;
  /** Cloudflare Calls TURN key ID + API token (set via `wrangler secret put`). */
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}

/**
 * Handle one request.
 *
 * The Durable Object is addressed by the room code, so an impossible code
 * never allocates one: `parseRoomCode` returns null for anything outside the
 * Crockford alphabet, and the request falls through to the 404.
 *
 * A code that *is* possible but was never minted is refused by the Durable
 * Object itself, which is the only place that knows whether the room was
 * reserved.
 */
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') return preflight();

  if (path === '/api/ice-servers' && request.method === 'GET') {
    const iceServers = await getIceServers(env.TURN_KEY_ID, env.TURN_KEY_API_TOKEN);
    return json({ iceServers });
  }

  // The room routes are the ones that can spend the Durable Object budget,
  // so they are the ones that are limited. This runs before the room is
  // touched, so a request that is turned away costs nothing but itself.
  if (path.startsWith('/api/room')) {
    const allowed = await allowRequest(request, env.ROOM_RATE_LIMITER);
    if (!allowed) {
      return apiError('rate_limited', 'Too many requests', 429, { 'Retry-After': '60' });
    }
  }

  if (path === '/api/room' && request.method === 'POST') {
    const code = generateRoomCode();
    if (!(await reserveRoom(request, env, code))) {
      return apiError('room_unavailable', 'Could not open a room', 503);
    }
    return json({ roomId: code });
  }

  const code = parseRoomCode(path);
  if (code) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return apiError('upgrade_required', 'Expected Upgrade: websocket', 426);
    }
    const id = env.ROOMS.idFromName(code);
    const stub = env.ROOMS.get(id);
    // Forward the original request so the DO sees the Upgrade header.
    return stub.fetch(request);
  }

  return apiError('not_found', 'Not found', 404);
}

/**
 * Reserve the room behind a freshly minted code.
 *
 * The reservation is what makes the code work: a peer that joins a code
 * nobody minted is refused, so a stranger cannot make the Worker allocate a
 * Durable Object per guess. It goes through the Durable Object because that
 * is the only strongly consistent store here — the instance that answers
 * the join is the very instance that was reserved, so the two can never
 * disagree. A key-value store would not do: its reads are eventually
 * consistent, and a freshly minted code could still look missing.
 */
async function reserveRoom(request: Request, env: Env, code: string): Promise<boolean> {
  try {
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const response = await stub.fetch(
      new Request(new URL(MINT_PATH, request.url), { method: 'POST' }),
    );
    return response.ok;
  } catch (err) {
    console.error('[Worker] could not reserve a room:', err);
    return false;
  }
}
