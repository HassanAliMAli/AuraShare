import { describe, expect, it } from 'vitest';
import {
  HEADER_BYTES,
  frameChunk,
  newTransferId,
  parseControl,
  readChunk,
} from '@/lib/transfer-protocol';
import { MAX_FILES_PER_TRANSFER, MAX_TEXT_BYTES, MAX_TRANSFER_BYTES } from '@/lib/protocol';

const id = 'a'.repeat(32);
const descriptor = { name: 'a.txt', size: 3, type: 'text/plain', index: 0 };

describe('lib/transfer-protocol — control validation', () => {
  it('mints 16-byte hexadecimal attempt ids', () => {
    const first = newTransferId();
    expect(first).toMatch(/^[a-f0-9]{32}$/);
    expect(newTransferId()).not.toBe(first);
  });

  it('rejects anything that is not a v2 control object', () => {
    for (const value of [null, 'hello', 42, [], {}, { v: 1, kind: 'hello' }, { v: 2, kind: 'unknown' }]) {
      expect(parseControl(value)).toBeNull();
    }
  });

  it('accepts a v2 hello', () => {
    expect(parseControl({ v: 2, kind: 'hello' })).toEqual({ v: 2, kind: 'hello' });
  });

  it('requires ordered, safe descriptors', () => {
    expect(parseControl({ v: 2, kind: 'descriptors', files: [descriptor] })).toEqual({
      v: 2, kind: 'descriptors', files: [{ ...descriptor, name: 'a.txt' }],
    });
    expect(parseControl({ v: 2, kind: 'descriptors', files: 'nope' })).toBeNull();
    expect(parseControl({ v: 2, kind: 'descriptors', files: [{ ...descriptor, index: 1 }] })).toBeNull();
    expect(parseControl({ v: 2, kind: 'descriptors', files: [{ ...descriptor, index: undefined }] })).toBeNull();
    expect(parseControl({ v: 2, kind: 'descriptors', files: [{ ...descriptor, size: 1.5 }] })).toBeNull();
    expect(parseControl({ v: 2, kind: 'descriptors', files: Array.from({ length: MAX_FILES_PER_TRANSFER + 1 }, (_, index) => ({ ...descriptor, index })) })).toBeNull();
  });

  it('validates the attempt id before the message kind', () => {
    expect(parseControl({ v: 2, kind: 'request', id: 'short', index: 0 })).toBeNull();
    expect(parseControl({ v: 2, kind: 'request', index: 0 })).toBeNull();
    expect(parseControl({ v: 2, kind: 'request', id: id.toUpperCase(), index: 0 })).toBeNull();
  });

  it('bounds request indexes', () => {
    expect(parseControl({ v: 2, kind: 'request', id, index: 0 })).toEqual({ v: 2, kind: 'request', id, index: 0 });
    expect(parseControl({ v: 2, kind: 'request', id, index: -1 })).toBeNull();
    expect(parseControl({ v: 2, kind: 'request', id, index: 1.2 })).toBeNull();
    expect(parseControl({ v: 2, kind: 'request', id, index: MAX_FILES_PER_TRANSFER })).toBeNull();
  });

  it('bounds start payloads by media type', () => {
    expect(parseControl({ v: 2, kind: 'start', id, index: 0, media: 'file', size: 10 })).toEqual({
      v: 2, kind: 'start', id, index: 0, media: 'file', size: 10,
    });
    expect(parseControl({ v: 2, kind: 'start', id, index: -1, media: 'text', size: MAX_TEXT_BYTES })).toMatchObject({ media: 'text', index: -1 });
    expect(parseControl({ v: 2, kind: 'start', id, index: -1, media: 'text', size: MAX_TEXT_BYTES + 1 })).toBeNull();
    expect(parseControl({ v: 2, kind: 'start', id, index: 0, media: 'file', size: MAX_TRANSFER_BYTES + 1 })).toBeNull();
    expect(parseControl({ v: 2, kind: 'start', id, index: 0, media: 'file', size: -1 })).toBeNull();
    expect(parseControl({ v: 2, kind: 'start', id, index: 0, media: 'other', size: 1 })).toBeNull();
    expect(parseControl({ v: 2, kind: 'start', id, index: 0, media: 'text', size: 1 })).toBeNull();
  });

  it('validates completion checksums and chunk counts', () => {
    expect(parseControl({ v: 2, kind: 'complete', id, crc: 0xffffffff, chunks: 2 })).toEqual({
      v: 2, kind: 'complete', id, crc: 0xffffffff, chunks: 2,
    });
    expect(parseControl({ v: 2, kind: 'complete', id, crc: -1, chunks: 2 })).toBeNull();
    expect(parseControl({ v: 2, kind: 'complete', id, crc: 0x1_0000_0000, chunks: 2 })).toBeNull();
    expect(parseControl({ v: 2, kind: 'complete', id, crc: 1.5, chunks: 2 })).toBeNull();
    expect(parseControl({ v: 2, kind: 'complete', id, crc: 0, chunks: -1 })).toBeNull();
    expect(parseControl({ v: 2, kind: 'complete', id, crc: 0, chunks: 0x1_0000_0000 })).toBeNull();
  });

  it('accepts acknowledgements and bounded failure reasons', () => {
    expect(parseControl({ v: 2, kind: 'ack', id })).toEqual({ v: 2, kind: 'ack', id });
    expect(parseControl({ v: 2, kind: 'failed', id, reason: 'no' })).toEqual({ v: 2, kind: 'failed', id, reason: 'no' });
    expect(parseControl({ v: 2, kind: 'cancel', id, reason: '' })).toEqual({ v: 2, kind: 'cancel', id, reason: '' });
    expect(parseControl({ v: 2, kind: 'cancel', id, reason: 'x'.repeat(201) })).toBeNull();
    expect(parseControl({ v: 2, kind: 'cancel', id, reason: 42 })).toBeNull();
  });
});

describe('lib/transfer-protocol — binary framing', () => {
  it('writes the attempt id and sequence into the header', () => {
    const payload = new Uint8Array([1, 2, 3]).buffer;
    const frame = frameChunk(id, 7, payload);
    const bytes = new Uint8Array(frame);
    expect(frame.byteLength).toBe(HEADER_BYTES + 3);
    expect(bytes.subarray(0, 16)).toEqual(new Uint8Array(16).fill(0xaa));
    expect(new DataView(frame).getUint32(16)).toBe(7);
    expect(new Uint8Array(frame).slice(HEADER_BYTES)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('round-trips a frame', () => {
    const frame = frameChunk(id, 9, new Uint8Array([4, 5]).buffer);
    expect(readChunk(frame)).toEqual({ id, sequence: 9, payload: new Uint8Array([4, 5]).buffer });
  });

  it('rejects payloads that are not a complete binary frame', () => {
    expect(readChunk('frame')).toBeNull();
    expect(readChunk(new Uint8Array(HEADER_BYTES - 1).buffer)).toBeNull();
    expect(readChunk(new Uint8Array(HEADER_BYTES).buffer)).toBeNull();
  });
});
