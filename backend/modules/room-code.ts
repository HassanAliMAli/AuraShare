/**
 * Transmission codes — what a room code is and how one is minted.
 *
 * The alphabet is Crockford base32, which drops I, L, O and U so a code can
 * never be misread aloud. The route pattern is derived from the same
 * alphabet, so the mint and the route can never drift apart: a code the
 * Worker could not have minted must not be able to allocate a Durable Object.
 */

/** Crockford base32 — excludes I, L, O, U to avoid ambiguity. */
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, ROOM_CODE_SOURCE } from '../../shared/room-code';

/**
 * The only room codes this Worker can ever serve.
 *
 * Kept derived from the alphabet so the route and the mint can never drift
 * apart — an impossible code must not be able to allocate a Durable Object.
 */
const ROOM_ROUTE_PATTERN = new RegExp(`^/api/room/(${ROOM_CODE_SOURCE})/ws$`);

/** Mint a new transmission code. */
export function generateRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  let code = '';
  for (const byte of bytes) {
    code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length] ?? '0';
  }
  return code;
}

/**
 * Extract the room code from a request path.
 *
 * Returns null for any path that is not a room route — including a code
 * outside the alphabet, which is how an impossible code is refused.
 */
export function parseRoomCode(path: string): string | null {
  return path.match(ROOM_ROUTE_PATTERN)?.[1] ?? null;
}
