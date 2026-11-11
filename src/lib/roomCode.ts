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
export const ROOM_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** The exact shape of a transmission code. */
export const ROOM_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{6}$/;

/** Shown when a typed code cannot be a transmission code. */
export const ROOM_CODE_HINT = 'Codes use 0-9 and A-Z — no I, L, O or U.';

/** True when the value is a code the Worker could have minted. */
export function isRoomCode(value: unknown): value is string {
  return typeof value === 'string' && ROOM_CODE_PATTERN.test(value);
}

/** Upper-case and trim a user-typed code, so " ab12cd " becomes "AB12CD". */
export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase();
}
