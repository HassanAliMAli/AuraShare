/**
 * Signaling transport: WebSocket relay to the RoomDO + ICE/room helpers.
 * Exchanges SDP offer/answer and trickle ICE candidates between the two peers.
 *
 * Frames arrive from the peer through the Worker relay, so every payload is
 * validated before it reaches the WebRTC layer.
 */

import type { WireSignal } from '../types';
import { isIceServerList, isRoomResponse, parseWireSignal } from './protocol';

export type { WireSignal } from '../types';

const DEFAULT_ICE: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/** Fetch the STUN/TURN config from the Worker; fall back to STUN-only on error. */
export async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch('/api/ice-servers');
    if (res.ok) {
      const data: unknown = await res.json();
      if (isIceServerList(data) && data.iceServers.length > 0) return data.iceServers;
    }
  } catch (err) {
    console.warn('[RTC] ice-servers fetch failed, using STUN defaults:', err);
  }
  return DEFAULT_ICE;
}

/** Ask the Worker to mint a fresh room code. */
export async function mintRoom(): Promise<string> {
  const res = await fetch('/api/room', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to mint room');
  const data: unknown = await res.json();
  if (!isRoomResponse(data)) throw new Error('Invalid room response');
  return data.roomId;
}

export type SignalingCallbacks = {
  onMessage: (msg: WireSignal) => void;
  onError: () => void;
  onClose: () => void;
};

/**
 * How many times the signalling socket is opened before the failure is
 * reported.
 *
 * A handshake can fail for reasons that have nothing to do with the room:
 * the browser reuses its HTTP/2 connection for the socket, and Cloudflare's
 * edge resets those — measured at roughly half of the handshakes from a
 * desktop Chrome, on the deployed Worker as well as on the old one. Trying
 * again costs one request and gets past it.
 */
const OPEN_ATTEMPTS = 3;

/** The pause between attempts. */
const OPEN_RETRY_DELAY_MS = 250;

/** Thin wrapper over the signaling WebSocket. */
export class SignalingChannel {
  private ws: WebSocket | null = null;
  private cb: SignalingCallbacks;
  /** True while the socket is being opened — a failure is then a retry. */
  private opening = false;

  constructor(cb: SignalingCallbacks) {
    this.cb = cb;
  }

  open(code: string, role: 'sender' | 'receiver'): Promise<void> {
    this.opening = true;
    return this.openWithRetry(code, role, OPEN_ATTEMPTS).finally(() => {
      this.opening = false;
    });
  }

  /**
   * Open the socket, trying again when the handshake fails.
   *
   * Only the last failure is reported: the attempts in between are not
   * something the user needs to hear about, and the app shows the error
   * once, with the reason.
   */
  private async openWithRetry(
    code: string,
    role: 'sender' | 'receiver',
    attempts: number,
  ): Promise<void> {
    try {
      await this.openOnce(code, role);
    } catch (err) {
      if (attempts <= 1) {
        // The socket gave up. This is the failure worth reporting.
        this.ws = null;
        this.cb.onError();
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, OPEN_RETRY_DELAY_MS));
      return this.openWithRetry(code, role, attempts - 1);
    }
  }

  private openOnce(code: string, role: 'sender' | 'receiver'): Promise<void> {
    const proto = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${globalThis.location.host}/api/room/${code}/ws`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;
    return new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'hello', role } satisfies WireSignal));
        resolve();
      };
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string') {
          console.warn('[RTC] ignored non-text signaling frame');
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(e.data);
        } catch (err) {
          console.warn('[RTC] bad signaling message:', err);
          return;
        }
        const msg = parseWireSignal(parsed);
        if (!msg) {
          console.warn('[RTC] rejected signaling message with an unexpected shape');
          return;
        }
        this.cb.onMessage(msg);
      };
      ws.onerror = () => {
        // While the socket is being opened, a failure is one attempt of a
        // retry — the promise carries it, and the last attempt reports it.
        if (!this.opening) this.cb.onError();
        reject(new Error('signaling websocket error'));
      };
      ws.onclose = () => {
        // A socket that a retry has replaced is not the room's socket, and a
        // close during the opening belongs to the attempt that failed.
        if (this.opening || this.ws !== ws) return;
        this.cb.onClose();
      };
    });
  }

  send(msg: WireSignal): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
