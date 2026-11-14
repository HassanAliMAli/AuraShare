/** Shared Crockford room-code contract for the browser and Worker. */
export const ROOM_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_SOURCE = `[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}`;
export const ROOM_CODE_PATTERN = new RegExp(`^${ROOM_CODE_SOURCE}$`);

export function isRoomCode(value: unknown): value is string {
  return typeof value === 'string' && ROOM_CODE_PATTERN.test(value);
}
