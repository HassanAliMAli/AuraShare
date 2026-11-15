/**
 * AuraShare Worker — Durable Object signaling relay + static asset edge.
 *
 * One RoomDO instance per room code acts as a dumb WebSocket relay between
 * two peers, exchanging SDP offer/answer + trickle ICE candidates in real
 * time.
 * Storage holds the code mint time. Hibernatable socket attachments retain
 * per-peer authorization, TURN credentials and issuance quota, revoked when
 * the socket leaves. The DO hibernates between messages and releases its
 * storage when the room ends.
 *
 * This file is only the entry point. The behaviour lives in `modules/`:
 *
 *   modules/routes.ts       the HTTP surface
 *   modules/room-do.ts      the Durable Object that relays a room
 *   modules/room-code.ts    the transmission-code alphabet and mint
 *   modules/room-protocol.ts the contract between the Worker and a room
 *   modules/rate-limit.ts   the rate limiter for the room routes
 *   modules/turn.ts         ICE servers and ephemeral TURN credentials
 *   modules/errors.ts       the one place a response is built
 *
 * The API contract these implement is in `docs/api.md`.
 */

import { apiError } from './modules/errors';
import { RoomDO } from './modules/room-do';
import { handleRequest, type Env } from './modules/routes';

export { RoomDO };
export { generateRoomCode } from './modules/room-code';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try { return await handleRequest(request, env); }
    catch {
      console.error(JSON.stringify({ event: 'request_failed' }));
      return apiError('internal_error', 'The request could not be completed', 500);
    }
  },
};
