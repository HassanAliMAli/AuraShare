/** Version 2 control messages and binary framing. Every attempt has its own ID. */
import type { FileDescriptor } from '../types';
import { MAX_FILES_PER_TRANSFER, MAX_TEXT_BYTES, MAX_TRANSFER_BYTES, parseFileDescriptors } from './protocol';
export const HEADER_BYTES = 20; // 128-bit attempt ID and uint32 sequence number
export const VERSION = 2;
export type Control =
  | { v: 2; kind: 'hello' }
  | { v: 2; kind: 'descriptors'; files: FileDescriptor[] }
  | { v: 2; kind: 'request'; id: string; index: number }
  | { v: 2; kind: 'start'; id: string; index: number; media: 'file' | 'text'; size: number }
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
  if (raw.kind === 'hello') return { v: 2, kind: 'hello' };
  if (raw.kind === 'descriptors') {
    const files = parseFileDescriptors(raw.files);
    return files && files.every((file, i) => file.index === i && Number.isSafeInteger(file.size))
      ? { v: 2, kind: 'descriptors', files } : null;
  }
  if (typeof raw.id !== 'string' || !/^[a-f0-9]{32}$/.test(raw.id)) return null;
  const id = raw.id;
  const validIndex = Number.isInteger(raw.index) && Number(raw.index) >= 0 && Number(raw.index) < MAX_FILES_PER_TRANSFER;
  switch (raw.kind) {
    case 'request': return validIndex ? { v: 2, kind: 'request', id, index: Number(raw.index) } : null;
    case 'start': {
      if (raw.media !== 'file' && raw.media !== 'text') return null;
      const max = raw.media === 'text' ? MAX_TEXT_BYTES : MAX_TRANSFER_BYTES;
      const target = raw.media === 'text' ? raw.index === -1 : validIndex;
      return Number.isSafeInteger(raw.size) && Number(raw.size) >= 0 && Number(raw.size) <= max && target
        ? { v: 2, kind: 'start', id, index: Number(raw.index), media: raw.media, size: Number(raw.size) } : null;
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
export function frameChunk(id: string, sequence: number, payload: ArrayBuffer): ArrayBuffer {
  const frame = new Uint8Array(HEADER_BYTES + payload.byteLength);
  for (let i = 0; i < 16; i++) frame[i] = parseInt(id.slice(i * 2, i * 2 + 2), 16);
  new DataView(frame.buffer).setUint32(16, sequence);
  frame.set(new Uint8Array(payload), HEADER_BYTES);
  return frame.buffer;
}
export function readChunk(data: unknown): { id: string; sequence: number; payload: ArrayBuffer } | null {
  if (Object.prototype.toString.call(data) !== '[object ArrayBuffer]') return null;
  const buffer = data as ArrayBuffer;
  if (buffer.byteLength <= HEADER_BYTES) return null;
  const bytes = new Uint8Array(buffer);
  const id = Array.from(bytes.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  return { id, sequence: new DataView(buffer).getUint32(16), payload: buffer.slice(HEADER_BYTES) };
}
