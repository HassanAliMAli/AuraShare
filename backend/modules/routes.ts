/** HTTP routing, room reservations, and rate-limited peer credential issuance. */

import { apiError, json, preflight } from './errors';
import { generateRoomCode, parseRoomCode } from './room-code';
import { MINT_PATH } from './room-protocol';
import { allowRequest } from './rate-limit';
import { STUN_SERVERS } from '../../shared/ice';
import { ROOM_CODE_SOURCE } from '../../shared/room-code';

/** The bindings and secrets the Worker reads. */
export interface Env extends Pick<WorkerBindings, 'ROOMS'>, Partial<Pick<WorkerBindings, 'ROOM_RATE_LIMITER' | 'ICE_RATE_LIMITER'>> {
  /** Optional external origin override for reverse-proxy deployments. */
  APP_ORIGIN?: string;
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
    return json({ iceServers: STUN_SERVERS, expiresAt: null, degraded: true });
  }

  const iceCode = path.match(new RegExp(`^/api/room/(${ROOM_CODE_SOURCE})/ice-servers$`))?.[1];
  if (iceCode && request.method === 'POST') {
    if (!/^Bearer [a-f0-9]{64}$/.test(request.headers.get('Authorization') ?? '')) {
      return apiError('unauthorized', 'A room session token is required', 401);
    }
    // Credential issuance fails closed if its limiter cannot answer.
    const ip = request.headers.get('cf-connecting-ip') ?? 'local';
    if (!env.ICE_RATE_LIMITER) return apiError('turn_unavailable', 'Credential limiter unavailable', 503);
    try {
      if (!(await env.ICE_RATE_LIMITER.limit({ key: ip })).success) {
        return apiError('rate_limited', 'Too many credential requests', 429, { 'Retry-After': '60' });
      }
    } catch { return apiError('turn_unavailable', 'Credential limiter unavailable', 503); }
    return env.ROOMS.get(env.ROOMS.idFromName(iceCode)).fetch(request);
  }

  if (path === '/api/room' && request.method === 'POST') {
    const limited = await rateLimited(request, env);
    if (limited) return limited;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateRoomCode();
      const result = await reserveRoom(request, env, code);
      if (result === 'reserved') return json({ roomId: code });
      if (result === 'unavailable') break;
    }
    return apiError('room_unavailable', 'Could not open a room', 503);
  }

  const code = parseRoomCode(path);
  if (code) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return apiError('upgrade_required', 'Expected Upgrade: websocket', 426);
    }
    if (request.headers.get('Origin') !== (env.APP_ORIGIN ?? url.origin)) {
      return apiError('forbidden', 'Origin is not allowed', 403);
    }
    const limited = await rateLimited(request, env);
    if (limited) return limited;
    const id = env.ROOMS.idFromName(code);
    const stub = env.ROOMS.get(id);
    // Forward the original request so the DO sees the Upgrade header.
    return stub.fetch(request);
  }

  return apiError('not_found', 'Not found', 404);
}

/**
 * The rate-limit answer for a request, or null when it may proceed.
 *
 * Only the two routes that can actually reach a room are checked: the mint,
 * and a socket request that is a real upgrade. A request that cannot touch a
 * room — the wrong method on the mint path, a socket request without the
 * upgrade header — must not spend a real user's budget, because it costs the
 * Durable Object nothing.
 */
async function rateLimited(request: Request, env: Env): Promise<Response | null> {
  const allowed = await allowRequest(request, env.ROOM_RATE_LIMITER);
  if (allowed) return null;
  return apiError('rate_limited', 'Too many requests', 429, { 'Retry-After': '60' });
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
async function reserveRoom(
  request: Request, env: Env, code: string,
): Promise<'reserved' | 'conflict' | 'unavailable'> {
  try {
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const response = await stub.fetch(
      new Request(new URL(MINT_PATH, request.url), { method: 'POST' }),
    );
    if (response.status === 409) return 'conflict';
    return response.ok ? 'reserved' : 'unavailable';
  } catch (err) {
    console.error('[Worker] could not reserve a room:', err);
    return 'unavailable';
  }
}
