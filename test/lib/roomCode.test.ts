import { describe, expect, it } from 'vitest';
import {
  isRoomCode,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_HINT,
  ROOM_CODE_PATTERN,
} from '@/lib/roomCode';

describe('lib/roomCode — transmission code rules', () => {
  it('accepts the codes the Worker mints', () => {
    expect(isRoomCode('ZB5DKX')).toBe(true);
    expect(isRoomCode('ABCDEF')).toBe(true);
    expect(isRoomCode('000000')).toBe(true);
    expect(isRoomCode('999999')).toBe(true);
  });

  it('rejects the ambiguous characters Crockford base32 leaves out', () => {
    expect(isRoomCode('IL0OU1')).toBe(false);
    expect(isRoomCode('IIIIII')).toBe(false);
    expect(isRoomCode('LLLLLL')).toBe(false);
    expect(isRoomCode('OOOOOO')).toBe(false);
    expect(isRoomCode('UUUUUU')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isRoomCode('AB!12Z')).toBe(false);
    expect(isRoomCode('AB 12Z')).toBe(false);
    expect(isRoomCode('ZB5DK')).toBe(false);
    expect(isRoomCode('ZB5DKXY')).toBe(false);
    expect(isRoomCode('zb5dkx')).toBe(false);
    expect(isRoomCode('')).toBe(false);
    expect(isRoomCode(123456)).toBe(false);
    expect(isRoomCode(null)).toBe(false);
    expect(isRoomCode(undefined)).toBe(false);
  });

  it('uses an alphabet that never contains an ambiguous character', () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(32);
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[ILOU]/);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(32);
  });

  it('accepts every character of its own alphabet', () => {
    for (const char of ROOM_CODE_ALPHABET) {
      expect(isRoomCode(char.repeat(6))).toBe(true);
    }
  });

  it('normalizes a typed code by trimming and upper-casing', () => {
    expect(normalizeRoomCode('  ab12cd ')).toBe('AB12CD');
    expect(normalizeRoomCode('ab12cd')).toBe('AB12CD');
    expect(normalizeRoomCode('AB12CD')).toBe('AB12CD');
    expect(normalizeRoomCode('  ')).toBe('');
  });

  it('exposes a single pattern and a user-facing hint', () => {
    expect(ROOM_CODE_PATTERN.test('AB12CD')).toBe(true);
    expect(ROOM_CODE_PATTERN.test('AB!12Z')).toBe(false);
    expect(ROOM_CODE_HINT).toMatch(/I, L, O/);
  });
});
