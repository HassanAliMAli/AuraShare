/** One room per code: hibernating signaling sockets and per-peer authorization. */

import { apiError, json } from './errors';
import { PeerAuth, type TurnEnv } from './peer-auth';
import { allowSignal, MAX_SIGNAL_BYTES, validSignal } from './signaling-guard';
import { HEARTBEAT_FRAME } from '../../shared/heartbeat';
import {
  CODE_VALIDITY_MS,
  MINTED_KEY,
  MINT_PATH,
  ROOM_IDLE_TTL_MS,
} from './room-protocol';

/**
 * Deliver one frame to a socket that may already be gone.
 *
 * A peer that dropped without a close event still appears in
 * `getWebSockets()`, and sending to it throws. Nothing that happens to one
 * dead socket may abort work for the room — least of all cleanup.
 */
function sendFrame(socket: WebSocket, frame: string | ArrayBuffer): void {
  try {
    socket.send(frame);
  } catch {
    console.error(JSON.stringify({ event: 'frame_delivery_failed' }));
  }
}

/** Close a socket the runtime may have closed first. */
function closeSocket(socket: WebSocket, code: number, reason: string): void {
  try {
    socket.close(code, reason);
  } catch {
    // The runtime already closed it; there is nothing left to release.
  }
}

/**
 * Durable Object: one per room. Relays WebSocket messages between the two
 * peers and broadcasts `peer-present` when the second peer connects.
 */
export class RoomDO {
  private state: DurableObjectState;
  /**
   * The deadline the room's alarm is set to.
   *
   * The alarm is the truth, but reading it costs a storage operation, so
   * it is cached here. The cache is lost when the room hibernates, which
   * is why it is only ever a cache and never the source.
   */
  private deadline: number | null = null;
  private readonly auth: PeerAuth;

  constructor(state: DurableObjectState, env: TurnEnv = {}) {
    this.state = state;
    this.auth = new PeerAuth(state, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // The Worker reserves the room before it hands out the code. This is
    // the only way in — the public routes never reach this path.
    if (url.pathname === MINT_PATH) {
      return this.reserve();
    }

    if (url.pathname.endsWith('/ice-servers') && request.method === 'POST') return this.auth.issue(request);

    if (request.headers.get('Upgrade') !== 'websocket') {
      return apiError('upgrade_required', 'Expected Upgrade: websocket', 426);
    }

    const mintedAt = await this.state.storage.get<number>(MINTED_KEY);
    if (mintedAt === undefined) {
      // Nobody minted this code, or the room it pointed at is gone. Either
      // way there is no room to join — and there is nothing to release
      // either: the mint time is the only thing this room ever stores, so a
      // room without one never held a row in the first place.
      return apiError('room_not_found', 'No such room', 404);
    }

    // Check capacity BEFORE accepting: a third peer must be rejected at the
    // handshake. Closing a server socket synchronously here would leave the
    // client with a dead-but-open connection (no close frame delivered).
    // A socket that has been revoked is logically gone even if its close
    // frame has not landed yet, so it must not hold a place in the room.
    const existing = this.liveSockets();
    if (existing.length < 2 && Date.now() >= mintedAt + CODE_VALIDITY_MS) {
      return apiError('room_not_found', 'Code expired', 404);
    }
    if (existing.length >= 2) {
      return apiError('room_full', 'Room full', 409);
    }
    // Counted before the socket is accepted: accepting one makes the room
    // hold one more peer, and that must not change which branch this is.
    const peersBefore = existing.length;

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.state.acceptWebSocket(server);
    if (url.searchParams.get('v') === '2') this.auth.admit(server);

    if (peersBefore === 1) {
      // Second peer joined — notify the first that a peer is present, and
      // give the room the longer lease: a session is worth keeping alive,
      // a code that nobody joined is not.
      for (const socket of existing) {
        sendFrame(socket, JSON.stringify({ type: 'peer-present' }));
      }
      await this.arm(Date.now() + ROOM_IDLE_TTL_MS);
    } else {
      // First peer. The code's own deadline stands — an absolute time from
      // the mint, so talking to the room cannot keep a stale code alive.
      await this.arm(mintedAt + CODE_VALIDITY_MS);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    if (this.auth.isRevoked(ws)) return;
    const bytes = typeof message === 'string' ? new TextEncoder().encode(message).byteLength : message.byteLength;
    if (bytes > MAX_SIGNAL_BYTES) {
      console.warn(JSON.stringify({ event: 'signaling_policy_close', reason: 'frame_size' }));
      await this.disconnect(ws, 1009, 'Signaling frame too large');
      return;
    }
    const heartbeat = message === HEARTBEAT_FRAME;
    let frame: unknown;
    if (!heartbeat && typeof message === 'string') {
      try { frame = JSON.parse(message); } catch { /* counted as invalid below */ }
    }
    const valid = heartbeat || validSignal(frame);
    if (!allowSignal(ws, bytes, valid)) {
      console.warn(JSON.stringify({ event: 'signaling_policy_close', reason: 'traffic_budget' }));
      await this.disconnect(ws, 1008, 'Signaling traffic limit exceeded');
      return;
    }
    if (!valid) return;
    if (this.liveSockets().length >= 2) {
      await this.keepAlive(ROOM_IDLE_TTL_MS);
    }
    if (heartbeat) return;
    for (const socket of this.liveSockets()) {
      if (socket !== ws && socket.readyState === 1) sendFrame(socket, message);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    await this.disconnect(ws, code, reason);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    void error;
    console.error(JSON.stringify({ event: 'websocket_error' }));
    await this.disconnect(ws, 1011, 'WebSocket error');
  }

  private async disconnect(ws: WebSocket, code: number, reason: string): Promise<void> {
    if (!this.auth.revoke(ws)) return;
    try {
      for (const socket of this.liveSockets()) {
        sendFrame(socket, JSON.stringify({ type: 'peer-left' }));
      }
    } finally {
      closeSocket(ws, code, reason);
      await this.releaseIfEmpty();
    }
  }

  async alarm(): Promise<void> {
    // The lease ran out. Tell the peers why before closing, so the one
    // still waiting learns that nobody joined instead of seeing a socket
    // die for no reason.
    //
    // Revoking comes first and closing is best-effort: a socket that is
    // already dead must not stop the remaining peers from being told, and
    // the release below must run no matter how many of them are gone.
    try {
      for (const socket of this.liveSockets()) {
        this.auth.revoke(socket);
        sendFrame(socket, JSON.stringify({ type: 'room-expired' }));
        closeSocket(socket, 1000, 'room expired');
      }
    } finally {
      await this.release();
    }
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  /**
   * Reserve the room: this is what makes the code work.
   *
   * The reservation is one storage write and one alarm, and it is what
   * lets a later join tell a real room from a guess.
   *
   * A room that is already reserved is left exactly as it is. Its deadline
   * is not ours to move: the code space is 32⁶ ≈ 1.07 billion, so a second
   * mint of the same code is rare — but when it lands on a room that is
   * already a live session, re-arming the alarm would cut that session's
   * lease short. Return a conflict so the Worker retries with another code.
   */
  private async reserve(): Promise<Response> {
    const existing = await this.state.storage.get<number>(MINTED_KEY);
    if (existing !== undefined) {
      return apiError('room_conflict', 'Room code is already reserved', 409);
    }
    const now = Date.now();
    await this.state.storage.put(MINTED_KEY, now);
    // The code is valid for a fixed window from now. The alarm is what
    // takes the room away when nobody joins it.
    await this.arm(now + CODE_VALIDITY_MS);
    return json({ reserved: true });
  }

  /**
   * Move the room's deadline.
   *
   * The deadline only ever moves later, and `setAlarm` is a storage write
   * — the free plan allows 100,000 rows written a day — so the alarm is
   * not re-armed on every relayed message.
   */
  private async arm(deadline: number): Promise<void> {
    const current = await this.currentDeadline();
    if (deadline <= current) return;
    await this.state.storage.setAlarm(deadline);
    this.deadline = deadline;
  }

  /**
   * Keep a room with two peers alive.
   *
   * The alarm only moves when the current one is close to firing: moving
   * it on every message would spend the free plan's row-write budget on a
   * single session.
   */
  private async keepAlive(ttl: number): Promise<void> {
    const now = Date.now();
    const current = await this.currentDeadline();
    if (current - now > ttl / 2) return;
    await this.arm(now + ttl);
  }

  /** The deadline the alarm is set to, reading the alarm if the cache is cold. */
  private async currentDeadline(): Promise<number> {
    if (this.deadline === null) {
      // The in-memory copy is lost when the room hibernates; the alarm
      // lives in storage, so it is the truth.
      this.deadline = (await this.state.storage.getAlarm()) ?? 0;
    }
    return this.deadline;
  }

  /** Sockets that still count as peers: a revoked one is on its way out. */
  private liveSockets(): WebSocket[] {
    return this.state.getWebSockets().filter((socket) => !this.auth.isRevoked(socket));
  }

  /** Release the room's storage once the last peer has left. */
  private async releaseIfEmpty(): Promise<void> {
    if (this.liveSockets().length > 0) return;
    await this.release();
  }

  /**
   * Give the room's storage back.
   *
   * `deleteAll` also removes the alarm on this project's compatibility
   * date, so the room leaves nothing behind: no storage, no timer, and a
   * later join for the same code finds no room.
   */
  private async release(): Promise<void> {
    await this.state.storage.deleteAll();
    this.deadline = null;
  }
}
