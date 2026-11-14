/**
 * Wire-protocol guards, limits and integrity helpers.
 *
 * Everything that crosses the data channel or the signaling socket is
 * peer-controlled, so nothing is trusted until it has been validated here.
 * Pure functions — no React imports, no dependencies.
 */

import type { FileDescriptor, SignalingMessage, WireSignal } from '../types';
import { MAX_FILE_SIZE, sanitizeFilename } from './validation';
import { isRoomCode } from './roomCode';

/** Re-exported so wire-protocol consumers keep a single import site. */
export { isRoomCode };

/** Maximum number of files a single transfer may announce. */
export const MAX_FILES_PER_TRANSFER = 32;

/** Maximum payload of a text share, in bytes. */
export const MAX_TEXT_BYTES = 1024 * 1024; // 1 MiB

/** Maximum length of a file name announced by a peer. */
const MAX_NAME_LENGTH = 255;

/** Upper bound for a single received file — the buffer is held in memory. */
export const MAX_TRANSFER_BYTES = MAX_FILE_SIZE;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A file/queue index — always a small non-negative integer. */
function isIndex(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < MAX_FILES_PER_TRANSFER
  );
}

/** A file descriptor as announced by a peer. */
function isFileDescriptor(value: unknown): value is FileDescriptor {
  if (!isRecord(value)) return false;
  if (typeof value.name !== 'string' || value.name.length === 0) return false;
  if (value.name.length > MAX_NAME_LENGTH) return false;
  if (typeof value.size !== 'number' || !Number.isFinite(value.size) || value.size < 0) return false;
  if (value.size > MAX_TRANSFER_BYTES) return false;
  if (typeof value.type !== 'string' || value.type.length > MAX_NAME_LENGTH) return false;
  if (value.index !== undefined && !isIndex(value.index)) return false;
  return true;
}

/** Validate the `files` array of a file-descriptors message. */
export function parseFileDescriptors(value: unknown): FileDescriptor[] | null {
  if (!Array.isArray(value) || value.length > MAX_FILES_PER_TRANSFER) return null;
  const files: FileDescriptor[] = [];
  for (const entry of value) {
    if (!isFileDescriptor(entry)) return null;
    files.push({
      name: sanitizeFilename(entry.name),
      size: entry.size,
      type: entry.type,
      index: entry.index,
    });
  }
  return files;
}

/**
 * Validate a control message received over the data channel.
 * Returns null for anything that does not match the protocol exactly.
 */
export function parseTransferMessage(raw: unknown): SignalingMessage | null {
  if (!isRecord(raw)) return null;
  const kind = raw.kind;

  switch (kind) {
    case 'file-descriptors': {
      const files = parseFileDescriptors(raw.files);
      return files ? { kind: 'file-descriptors', files } : null;
    }
    case 'file-metadata': {
      if (!isFileDescriptor(raw)) return null;
      return {
        kind: 'file-metadata',
        name: sanitizeFilename(raw.name),
        size: raw.size,
        type: raw.type,
        index: raw.index ?? 0,
      };
    }
    case 'file-request': {
      if (!isIndex(raw.index)) return null;
      return { kind: 'file-request', index: raw.index };
    }
    case 'file-acknowledged': {
      if (!isIndex(raw.index)) return null;
      return { kind: 'file-acknowledged', index: raw.index };
    }
    case 'transfer-complete': {
      if (!isIndex(raw.fileIndex)) return null;
      if (raw.crc !== undefined && (typeof raw.crc !== 'number' || !Number.isFinite(raw.crc))) {
        return null;
      }
      return {
        kind: 'transfer-complete',
        fileIndex: raw.fileIndex,
        crc: typeof raw.crc === 'number' ? raw.crc >>> 0 : undefined,
      };
    }
    case 'text': {
      if (typeof raw.text !== 'string') return null;
      return { kind: 'text', text: raw.text };
    }
    default:
      return null;
  }
}

function isSessionDescription(value: unknown): value is RTCSessionDescriptionInit {
  if (!isRecord(value)) return false;
  const type = value.type;
  if (type !== 'offer' && type !== 'answer' && type !== 'pranswer' && type !== 'rollback') {
    return false;
  }
  if (value.sdp !== undefined && typeof value.sdp !== 'string') return false;
  return true;
}

function isIceCandidate(value: unknown): value is RTCIceCandidateInit {
  if (!isRecord(value)) return false;
  if (value.candidate !== undefined && typeof value.candidate !== 'string') return false;
  if (value.sdpMid !== undefined && value.sdpMid !== null && typeof value.sdpMid !== 'string') {
    return false;
  }
  if (
    value.sdpMLineIndex !== undefined &&
    value.sdpMLineIndex !== null &&
    typeof value.sdpMLineIndex !== 'number'
  ) {
    return false;
  }
  if (
    value.usernameFragment !== undefined &&
    value.usernameFragment !== null &&
    typeof value.usernameFragment !== 'string'
  ) {
    return false;
  }
  return true;
}

/** Validate a signaling frame relayed by the Worker. */
export function parseWireSignal(raw: unknown): WireSignal | null {
  if (!isRecord(raw)) return null;
  const type = raw.type;

  switch (type) {
    case 'hello': {
      if (raw.role !== 'sender' && raw.role !== 'receiver') return null;
      return { type: 'hello', role: raw.role };
    }
    case 'peer-present':
      return { type: 'peer-present' };
    case 'peer-left':
      return { type: 'peer-left' };
    case 'room-expired':
      return { type: 'room-expired' };
    case 'offer': {
      if (!isSessionDescription(raw.sdp)) return null;
      return { type: 'offer', sdp: raw.sdp };
    }
    case 'answer': {
      if (!isSessionDescription(raw.sdp)) return null;
      return { type: 'answer', sdp: raw.sdp };
    }
    case 'ice': {
      if (!isIceCandidate(raw.candidate)) return null;
      return { type: 'ice', candidate: raw.candidate };
    }
    default:
      return null;
  }
}

/** Validate the ICE server list returned by the Worker. */
export function isIceServerList(value: unknown): value is { iceServers: RTCIceServer[] } {
  if (!isRecord(value) || !Array.isArray(value.iceServers)) return false;
  return value.iceServers.every((server) => {
    if (!isRecord(server)) return false;
    if (typeof server.urls === 'string') return true;
    return (
      Array.isArray(server.urls) &&
      server.urls.every((url) => typeof url === 'string')
    );
  });
}

/** Validate the room-minting response body. */
export function isRoomResponse(value: unknown): value is { roomId: string } {
  return isRecord(value) && isRoomCode(value.roomId);
}

/** Truncate a string to a byte budget without splitting a UTF-8 sequence badly. */
export function truncateToBytes(text: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength <= maxBytes) return text;
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, maxBytes));
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/**
 * Streaming CRC-32 — cheap integrity check over the transferred bytes.
 * Both peers compute it while the chunks flow, so it costs no extra I/O.
 */
export class Crc32 {
  private state = 0xffffffff;

  update(bytes: Uint8Array): void {
    let crc = this.state;
    for (const byte of bytes) {
      crc = (CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
    }
    this.state = crc >>> 0;
  }

  get value(): number {
    return (this.state ^ 0xffffffff) >>> 0;
  }
}
