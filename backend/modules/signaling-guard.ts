import { patchSocketState, readSocketState } from './socket-state';

export const MAX_SIGNAL_BYTES = 256 * 1024;
const WINDOW_MS = 60_000;
const MAX_MESSAGES = 300;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_INVALID = 8;
type Traffic = { start: number; messages: number; bytes: number; invalid: number };

/** Fixed windows bound each socket, including malformed messages and heartbeats. */
export function allowSignal(socket: WebSocket, bytes: number, valid: boolean): boolean {
  const now = Date.now();
  const data = readSocketState(socket);
  if (data.revoked === true) return false;
  const saved = data.traffic as Traffic | undefined;
  const traffic: Traffic = saved && Number.isFinite(saved.start) && saved.start <= now && now - saved.start < WINDOW_MS
    ? { ...saved } : { start: now, messages: 0, bytes: 0, invalid: 0 };
  traffic.messages++;
  traffic.bytes += bytes;
  if (!valid) traffic.invalid++;
  if (traffic.messages > MAX_MESSAGES || traffic.bytes > MAX_BYTES || traffic.invalid >= MAX_INVALID) return false;
  try { patchSocketState(socket, { traffic }); return true; }
  catch { return false; }
}

/** Validate without altering the relayed frame; accept legacy SDP frames too. */
export function validSignal(frame: unknown): boolean {
  if (!frame || typeof frame !== 'object' || Array.isArray(frame)) return false;
  const raw = frame as Record<string, unknown>;
  switch (raw.type) {
    case 'hello': return (raw.role === 'sender' || raw.role === 'receiver') &&
      (raw.version === undefined || raw.version === 2);
    case 'ready': case 'refresh-request': return true;
    case 'refresh-prepare': case 'refresh-ready': return validId(raw.id);
    case 'offer': case 'answer': {
      if (raw.generation !== undefined && !validId(raw.generation)) return false;
      if (!raw.sdp || typeof raw.sdp !== 'object' || Array.isArray(raw.sdp)) return false;
      const sdp = raw.sdp as Record<string, unknown>;
      return sdp.type === raw.type && typeof sdp.sdp === 'string';
    }
    case 'ice': {
      if (raw.generation !== undefined && !validId(raw.generation)) return false;
      if (!raw.candidate || typeof raw.candidate !== 'object' || Array.isArray(raw.candidate)) return false;
      const candidate = raw.candidate as Record<string, unknown>;
      return (candidate.candidate === undefined || typeof candidate.candidate === 'string') &&
        (candidate.sdpMid == null || typeof candidate.sdpMid === 'string') &&
        (candidate.sdpMLineIndex == null || (Number.isInteger(candidate.sdpMLineIndex) && Number(candidate.sdpMLineIndex) >= 0)) &&
        (candidate.usernameFragment == null || typeof candidate.usernameFragment === 'string');
    }
    default: return false;
  }
}

function validId(value: unknown): boolean { return typeof value === 'string' && /^[a-f0-9]{32}$/.test(value); }
