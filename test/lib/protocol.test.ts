import { describe, expect, it } from 'vitest';
import {
  Crc32,
  MAX_FILES_PER_TRANSFER,
  MAX_TEXT_BYTES,
  MAX_TRANSFER_BYTES,
  isIceServerList,
  isRoomCode,
  isRoomResponse,
  parseFileDescriptors,
  parseTransferMessage,
  parseWireSignal,
  truncateToBytes,
} from '@/lib/protocol';

describe('lib/protocol — descriptor guards', () => {
  it('accepts a well-formed descriptor list', () => {
    const files = parseFileDescriptors([{ name: 'a.txt', size: 10, type: 'text/plain', index: 0 }]);
    expect(files).toEqual([{ name: 'a.txt', size: 10, type: 'text/plain', index: 0 }]);
  });

  it('rejects a payload that is not an array', () => {
    expect(parseFileDescriptors('nope')).toBeNull();
    expect(parseFileDescriptors({ files: [] })).toBeNull();
  });

  it('rejects more descriptors than the protocol allows', () => {
    const many = Array.from({ length: MAX_FILES_PER_TRANSFER + 1 }, (_, i) => ({
      name: `f${i}.txt`,
      size: 1,
      type: 'text/plain',
      index: i,
    }));
    expect(parseFileDescriptors(many)).toBeNull();
  });

  it('rejects a descriptor with a bad size, name or index', () => {
    expect(parseFileDescriptors([{ name: 'a', size: '10', type: 'text/plain' }])).toBeNull();
    expect(parseFileDescriptors([{ name: 'a', size: -1, type: 'text/plain' }])).toBeNull();
    expect(parseFileDescriptors([{ name: 'a', size: Number.NaN, type: 'text/plain' }])).toBeNull();
    expect(parseFileDescriptors([{ name: '', size: 1, type: 'text/plain' }])).toBeNull();
    expect(parseFileDescriptors([{ name: 'a', size: 1, type: 'text/plain', index: -1 }])).toBeNull();
  });

  it('rejects a descriptor larger than the transfer limit', () => {
    expect(
      parseFileDescriptors([{ name: 'a', size: MAX_TRANSFER_BYTES + 1, type: 'text/plain' }]),
    ).toBeNull();
  });

  it('strips path characters out of the announced name', () => {
    const files = parseFileDescriptors([{ name: '../../etc/passwd', size: 1, type: 'text/plain' }]);
    expect(files?.[0]?.name).toBe('._._etc_passwd');
  });
});

describe('lib/protocol — transfer message guards', () => {
  it('accepts the messages of the protocol', () => {
    expect(parseTransferMessage({ kind: 'file-request', index: 3 })).toEqual({
      kind: 'file-request',
      index: 3,
    });
    expect(parseTransferMessage({ kind: 'file-acknowledged', index: 3 })).toEqual({
      kind: 'file-acknowledged',
      index: 3,
    });
    expect(parseTransferMessage({ kind: 'text', text: 'hello' })).toEqual({
      kind: 'text',
      text: 'hello',
    });
  });

  it('rejects an unknown message kind', () => {
    expect(parseTransferMessage({ kind: 'drop-everything' })).toBeNull();
    expect(parseTransferMessage({})).toBeNull();
    expect(parseTransferMessage('file-request')).toBeNull();
  });

  it('rejects a file request with an out-of-range index', () => {
    expect(parseTransferMessage({ kind: 'file-request', index: -1 })).toBeNull();
    expect(parseTransferMessage({ kind: 'file-request', index: 1.5 })).toBeNull();
    expect(parseTransferMessage({ kind: 'file-request', index: MAX_FILES_PER_TRANSFER })).toBeNull();
  });

  it('rejects metadata with a malformed size', () => {
    expect(
      parseTransferMessage({ kind: 'file-metadata', name: 'a', size: '10', type: 'text/plain', index: 0 }),
    ).toBeNull();
    expect(
      parseTransferMessage({ kind: 'file-metadata', name: 'a', size: 10, type: 5, index: 0 }),
    ).toBeNull();
  });

  it('keeps a valid checksum and drops an invalid one', () => {
    expect(parseTransferMessage({ kind: 'transfer-complete', fileIndex: 0, crc: 42 })).toEqual({
      kind: 'transfer-complete',
      fileIndex: 0,
      crc: 42,
    });
    expect(parseTransferMessage({ kind: 'transfer-complete', fileIndex: 0, crc: 'x' })).toBeNull();
  });

  it('rejects a text message that is not a string', () => {
    expect(parseTransferMessage({ kind: 'text', text: 42 })).toBeNull();
  });
});

describe('lib/protocol — signaling guards', () => {
  it('accepts the frames of the protocol', () => {
    expect(parseWireSignal({ type: 'hello', role: 'receiver' })).toEqual({
      type: 'hello',
      role: 'receiver',
    });
    expect(parseWireSignal({ type: 'peer-present' })).toEqual({ type: 'peer-present' });
    expect(parseWireSignal({ type: 'peer-left' })).toEqual({ type: 'peer-left' });
    expect(parseWireSignal({ type: 'room-expired' })).toEqual({ type: 'room-expired' });
    expect(parseWireSignal({ type: 'offer', sdp: { type: 'offer', sdp: 'x' } })).toEqual({
      type: 'offer',
      sdp: { type: 'offer', sdp: 'x' },
    });
    expect(parseWireSignal({ type: 'ice', candidate: { candidate: 'one' } })).toEqual({
      type: 'ice',
      candidate: { candidate: 'one' },
    });
  });

  it('rejects a hello frame with an unknown role', () => {
    expect(parseWireSignal({ type: 'hello', role: 'observer' })).toBeNull();
  });

  it('rejects an offer or answer without a valid sdp', () => {
    expect(parseWireSignal({ type: 'offer' })).toBeNull();
    expect(parseWireSignal({ type: 'offer', sdp: { type: 'nonsense' } })).toBeNull();
    expect(parseWireSignal({ type: 'answer', sdp: 'raw-string' })).toBeNull();
  });

  it('rejects an ice frame with a malformed candidate', () => {
    expect(parseWireSignal({ type: 'ice', candidate: { candidate: 5 } })).toBeNull();
    expect(parseWireSignal({ type: 'ice', candidate: { sdpMLineIndex: 'one' } })).toBeNull();
  });

  it('rejects a frame that is not an object', () => {
    expect(parseWireSignal('peer-present')).toBeNull();
    expect(parseWireSignal(null)).toBeNull();
  });
});

describe('lib/protocol — worker responses', () => {
  it('accepts a valid ice server list', () => {
    expect(isIceServerList({ iceServers: [{ urls: 'stun:stun.example.com' }] })).toBe(true);
    expect(isIceServerList({ iceServers: [{ urls: ['turn:a', 'turn:b'] }] })).toBe(true);
  });

  it('rejects an ice payload without urls', () => {
    expect(isIceServerList({ iceServers: [{ username: 'u' }] })).toBe(false);
    expect(isIceServerList({ iceServers: 'stun' })).toBe(false);
    expect(isIceServerList({})).toBe(false);
  });

  it('accepts a room code and rejects a malformed one', () => {
    expect(isRoomCode('ZB5DKX')).toBe(true);
    expect(isRoomCode('zb5dkx')).toBe(false);
    expect(isRoomCode('ZB5DK')).toBe(false);
    expect(isRoomCode('ZB5DKXY')).toBe(false);
    expect(isRoomResponse({ roomId: 'ZB5DKX' })).toBe(true);
    expect(isRoomResponse({ roomId: 'nope' })).toBe(false);
  });
});

describe('lib/protocol — text and checksum helpers', () => {
  it('leaves text within the budget untouched', () => {
    expect(truncateToBytes('hello', MAX_TEXT_BYTES)).toBe('hello');
  });

  it('truncates text to the byte budget', () => {
    const truncated = truncateToBytes('a'.repeat(MAX_TEXT_BYTES + 100), MAX_TEXT_BYTES);
    expect(new TextEncoder().encode(truncated).byteLength).toBeLessThanOrEqual(MAX_TEXT_BYTES);
  });

  it('computes the standard CRC-32 check value', () => {
    const crc = new Crc32();
    crc.update(new TextEncoder().encode('123456789'));
    expect(crc.value).toBe(0xcbf43926);
  });

  it('detects a single flipped byte', () => {
    const crc = new Crc32();
    crc.update(new Uint8Array([1, 2, 3, 4]));
    const other = new Crc32();
    other.update(new Uint8Array([1, 2, 3, 5]));
    expect(crc.value).not.toBe(other.value);
  });

  it('hashes the same bytes the same way across chunks', () => {
    const whole = new Crc32();
    whole.update(new Uint8Array([1, 2, 3, 4, 5, 6]));
    const split = new Crc32();
    split.update(new Uint8Array([1, 2, 3]));
    split.update(new Uint8Array([4, 5, 6]));
    expect(split.value).toBe(whole.value);
  });
});
