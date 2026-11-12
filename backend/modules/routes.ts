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
import { getIceServers } from './turn';

/** The bindings and secrets the Worker reads. */
export interface Env {
  ROOMS: DurableObjectNamespace;
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
 */
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') return preflight();

  if (path === '/api/ice-servers' && request.method === 'GET') {
    const iceServers = await getIceServers(env.TURN_KEY_ID, env.TURN_KEY_API_TOKEN);
    return json({ iceServers });
  }

  if (path === '/api/room' && request.method === 'POST') {
    return json({ roomId: generateRoomCode() });
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
