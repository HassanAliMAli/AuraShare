/**
 * The room Durable Object — one instance per transmission code.
 *
 * It is a dumb relay between the two peers of a session: it exchanges SDP
 * offer/answer and trickle ICE candidates, and nothing else. It never
 * inspects a frame; validation is the client's job.
 *
 * A room exists because the Worker minted its code. `POST /api/room`
 * reserves the room — that is what makes the code usable — and a peer that
 * joins a code nobody minted is refused. Without that check every
 * six-character string a stranger could guess would allocate a Durable
 * Object, and the free plan's daily request budget would be spent on
 * rubbish.
 *
 * Storage holds exactly one thing: the time the room was minted. It tells
 * a reserved room from a guessed one, and it is deleted the moment the
 * room is over, so a room never keeps its storage — an empty SQLite
 * database still costs about 12 KB — once it is done with.
 */

import { apiError, json } from './errors';
import {
  CODE_VALIDITY_MS,
  MINTED_KEY,
  MINT_PATH,
  ROOM_IDLE_TTL_MS,
} from './room-protocol';

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

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // The Worker reserves the room before it hands out the code. This is
    // the only way in — the public routes never reach this path.
    if (url.pathname === MINT_PATH) {
      return this.reserve();
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return apiError('upgrade_required', 'Expected Upgrade: websocket', 426);
    }

    const mintedAt = await this.state.storage.get<number>(MINTED_KEY);
    if (mintedAt === undefined) {
      // Nobody minted this code, or the room it pointed at is gone. Either
      // way there is no room to join — and the storage is released here
      // rather than left behind for a room that will never be used.
      await this.release();
      return apiError('room_not_found', 'No such room', 404);
    }

    // Check capacity BEFORE accepting: a third peer must be rejected at the
    // handshake. Closing a server socket synchronously here would leave the
    // client with a dead-but-open connection (no close frame delivered).
    const existing = this.state.getWebSockets();
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

    if (peersBefore === 1) {
      // Second peer joined — notify the first that a peer is present, and
      // give the room the longer lease: a session is worth keeping alive,
      // a code that nobody joined is not.
      for (const socket of existing) {
        socket.send(JSON.stringify({ type: 'peer-present' }));
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
    // A room with two peers is a live session: keep its lease running.
    if (this.state.getWebSockets().length >= 2) {
      await this.keepAlive(ROOM_IDLE_TTL_MS);
    }
    // Dumb relay: forward to every other socket in the room.
    for (const socket of this.state.getWebSockets()) {
      if (socket !== ws) socket.send(message);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    for (const socket of this.state.getWebSockets()) {
      if (socket !== ws) socket.send(JSON.stringify({ type: 'peer-left' }));
    }
    try {
      ws.close(code, reason);
    } catch {
      // workerd may close the socket before invoking this handler; a second
      // close() throws and would otherwise surface as an uncaught DO error.
    }
    // The room is over once the last peer leaves. Release the storage now
    // rather than letting it sit there until the alarm fires.
    await this.releaseIfEmpty(ws);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('[RoomDO] websocket error:', error);
    ws.close(1011, 'WebSocket error');
  }

  async alarm(): Promise<void> {
    // The lease ran out. Tell the peers why before closing, so the one
    // still waiting learns that nobody joined instead of seeing a socket
    // die for no reason.
    for (const socket of this.state.getWebSockets()) {
      socket.send(JSON.stringify({ type: 'room-expired' }));
      socket.close(1000, 'room expired');
    }
    await this.release();
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  /**
   * Reserve the room: this is what makes the code work.
   *
   * The reservation is one storage write and one alarm, and it is what
   * lets a later join tell a real room from a guess.
   */
  private async reserve(): Promise<Response> {
    const now = Date.now();
    await this.state.storage.put(MINTED_KEY, now);
    // The code is valid for a fixed window from now. The alarm is what
    // takes the room away when nobody joins it.
    await this.arm(now + CODE_VALIDITY_MS, true);
    return json({ reserved: true });
  }

  /**
   * Move the room's deadline.
   *
   * The deadline only ever moves later, and `setAlarm` is a storage write
   * — the free plan allows 100,000 rows written a day — so the alarm is
   * not re-armed on every relayed message.
   */
  private async arm(deadline: number, force = false): Promise<void> {
    const current = await this.currentDeadline();
    if (!force && deadline <= current) return;
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

  /** Release the room's storage once the last peer has left. */
  private async releaseIfEmpty(closing?: WebSocket): Promise<void> {
    const remaining = this.state.getWebSockets().filter((socket) => socket !== closing);
    if (remaining.length > 0) return;
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
