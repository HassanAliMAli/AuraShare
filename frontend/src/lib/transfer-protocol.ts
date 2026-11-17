/** Version 2 control messages and binary framing. Every attempt has its own ID. */
import type { FileDescriptor } from '../types';
import { MAX_FILES_PER_TRANSFER, MAX_TEXT_BYTES, MAX_TRANSFER_BYTES, parseFileDescriptors } from './protocol';
import { MAX_DIRECT_FILE_SIZE } from './validation';
import { isDigest, validPrefix } from './direct-save';
export const DIRECT_HEADER_BYTES = 24;
export const HEADER_BYTES = 20; // 128-bit attempt ID and uint32 sequence number
/** Chunk size a peer that does not advertise `maxChunk` is assumed to accept. */
export const LEGACY_CHUNK_BYTES = 16 * 1024;
/** Largest payload this client will send or accept, excluding HEADER_BYTES. */
export const MAX_CHUNK_BYTES = 64 * 1024;
export const VERSION = 2;
export type Control =
  | { v: 2; kind: 'hello'; maxChunk?: number; resume?: boolean; direct?: boolean; receiveDirect?: boolean }
  | { v: 2; kind: 'descriptors'; files: FileDescriptor[] }
  | { v: 2; kind: 'request'; id: string; index: number; offset?: number; crc?: number }
  | { v: 2; kind: 'direct-request'; id: string; index: number; offset: number; digest?: string; fingerprint?: string }
  | { v: 2; kind: 'credit'; id: string; sequence: number }
  | { v: 2; kind: 'start'; id: string; index: number; media: 'file' | 'text'; size: number; fingerprint?: string }
  | { v: 2; kind: 'complete'; id: string; crc: number; chunks: number }
  | { v: 2; kind: 'ack'; id: string }
  | { v: 2; kind: 'failed' | 'cancel'; id: string; reason: string };
export function newTransferId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}
export function parseControl(value: unknown): Control | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.v !== VERSION) return null;
  if (raw.kind === 'hello') {
    // A peer that predates chunk negotiation sends no maxChunk; the sender
    // then keeps the legacy 16 KiB payload. Anything outside the supported
    // range is treated the same way rather than trusted.
    const maxChunk = raw.maxChunk;
    return typeof maxChunk === 'number' && Number.isInteger(maxChunk) &&
      maxChunk >= LEGACY_CHUNK_BYTES && maxChunk <= MAX_CHUNK_BYTES
      ? { v: 2, kind: 'hello', maxChunk, resume: raw.resume === true, direct: raw.direct === true, receiveDirect: raw.receiveDirect === true }
      : { v: 2, kind: 'hello', resume: raw.resume === true, direct: raw.direct === true, receiveDirect: raw.receiveDirect === true };
  }
  if (raw.kind === 'descriptors') {
    const files = parseFileDescriptors(raw.files, MAX_DIRECT_FILE_SIZE);
    return files && files.every((file, i) => file.index === i && Number.isSafeInteger(file.size))
      ? { v: 2, kind: 'descriptors', files } : null;
  }
  if (typeof raw.id !== 'string' || !/^[a-f0-9]{32}$/.test(raw.id)) return null;
  const id = raw.id;
  const validIndex = Number.isInteger(raw.index) && Number(raw.index) >= 0 && Number(raw.index) < MAX_FILES_PER_TRANSFER;
  switch (raw.kind) {
    case 'direct-request':
      if (!validIndex) return null;
      if (raw.offset === 0 && raw.digest === undefined && raw.fingerprint === undefined) return { v: 2, kind: raw.kind, id, index: Number(raw.index), offset: 0 };
      return validPrefix(raw.offset, raw.digest) && isDigest(raw.fingerprint)
        ? { v: 2, kind: raw.kind, id, index: Number(raw.index), offset: raw.offset,
            digest: String(raw.digest), fingerprint: raw.fingerprint } : null;
    case 'credit':
      return Number.isInteger(raw.sequence) && Number(raw.sequence) > 0 && Number(raw.sequence) <= 0xffffffff
        ? { v: 2, kind: raw.kind, id, sequence: Number(raw.sequence) } : null;
    case 'request': {
      if (!validIndex) return null;
      if (raw.offset === undefined && raw.crc === undefined) return { v: 2, kind: 'request', id, index: Number(raw.index) };
      return Number.isSafeInteger(raw.offset) && Number(raw.offset) > 0 && Number(raw.offset) <= MAX_TRANSFER_BYTES &&
        Number.isInteger(raw.crc) && Number(raw.crc) >= 0 && Number(raw.crc) <= 0xffffffff
        ? { v: 2, kind: 'request', id, index: Number(raw.index), offset: Number(raw.offset), crc: Number(raw.crc) } : null;
    }
    case 'start': {
      if (raw.media !== 'file' && raw.media !== 'text') return null;
      const max = raw.media === 'text' ? MAX_TEXT_BYTES : MAX_DIRECT_FILE_SIZE;
      const target = raw.media === 'text' ? raw.index === -1 : validIndex;
      return Number.isSafeInteger(raw.size) && Number(raw.size) >= 0 && Number(raw.size) <= max && target
        ? { v: 2, kind: 'start', id, index: Number(raw.index), media: raw.media, size: Number(raw.size),
            ...(isDigest(raw.fingerprint) ? { fingerprint: raw.fingerprint } : {}) } : null;
    }
    case 'complete': return Number.isInteger(raw.crc) && Number(raw.crc) >= 0 && Number(raw.crc) <= 0xffffffff &&
      Number.isSafeInteger(raw.chunks) && Number(raw.chunks) >= 0 && Number(raw.chunks) <= 0xffffffff
      ? { v: 2, kind: 'complete', id, crc: Number(raw.crc), chunks: Number(raw.chunks) } : null;
    case 'ack': return { v: 2, kind: 'ack', id };
    case 'failed': case 'cancel': return typeof raw.reason === 'string' && raw.reason.length <= 200
      ? { v: 2, kind: raw.kind, id, reason: raw.reason } : null;
    default: return null;
  }
}
export function frameChunk(id: string, sequence: number, payload: ArrayBuffer, crc?: number): ArrayBuffer {
  const header = crc === undefined ? HEADER_BYTES : DIRECT_HEADER_BYTES;
  const frame = new Uint8Array(header + payload.byteLength);
  for (let i = 0; i < 16; i++) frame[i] = parseInt(id.slice(i * 2, i * 2 + 2), 16);
  new DataView(frame.buffer).setUint32(16, sequence);
  if (crc !== undefined) new DataView(frame.buffer).setUint32(20, crc);
  frame.set(new Uint8Array(payload), header);
  return frame.buffer;
}
export function readChunk(data: unknown, directId?: string): { id: string; sequence: number; payload: ArrayBuffer; crc?: number } | null {
  if (Object.prototype.toString.call(data) !== '[object ArrayBuffer]') return null;
  const buffer = data as ArrayBuffer;
  if (buffer.byteLength <= HEADER_BYTES || buffer.byteLength > DIRECT_HEADER_BYTES + MAX_CHUNK_BYTES) return null;
  const bytes = new Uint8Array(buffer);
  const id = Array.from(bytes.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  const header = id === directId ? DIRECT_HEADER_BYTES : HEADER_BYTES;
  if (buffer.byteLength <= header || buffer.byteLength > header + MAX_CHUNK_BYTES) return null;
  const view = new DataView(buffer);
  return { id, sequence: view.getUint32(16), payload: buffer.slice(header),
    ...(header === DIRECT_HEADER_BYTES ? { crc: view.getUint32(20) } : {}) };
}
