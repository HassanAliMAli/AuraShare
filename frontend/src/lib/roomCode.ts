/**
 * Transmission-code rules — the single source of truth for what a code looks
 * like on both ends of a session.
 *
 * The Worker mints codes with Crockford base32, which drops I, L, O and U so a
 * code can never be misread aloud. Client and server must agree on the shape:
 * if they drift, a code the user typed perfectly well resolves to a room that
 * does not exist and the session hangs until it times out.
 */

/** Crockford base32 — excludes I, L, O and U to avoid ambiguity. */
export { ROOM_CODE_ALPHABET, ROOM_CODE_PATTERN, isRoomCode } from '../../../shared/room-code';

/** Shown when a typed code cannot be a transmission code. */
export const ROOM_CODE_HINT = 'Codes use 0-9 and A-Z. The letter U is not used.';

/**
 * Upper-case and trim a user-typed code, so " ab12cd " becomes "AB12CD".
 *
 * Crockford base32 deliberately drops I, L, O and U. A person reading a code
 * aloud still writes the letter they heard, so fold the two that are visually
 * unambiguous — I/L to 1 and O to 0 — instead of rejecting the code. U stays
 * invalid: mapping it to V would guess at a letter the alphabet never mints.
 */
export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0');
}
