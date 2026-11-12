/**
 * The room Durable Object — one instance per transmission code.
 *
 * It is a dumb relay between the two peers of a session: it exchanges SDP
 * offer/answer and trickle ICE candidates, and nothing else. It never
 * inspects a frame; validation is the client's job.
 *
 * No room state is persisted. The DO hibernates between messages (free-tier
 * friendly) and auto-evicts after ROOM_TTL_MS of inactivity.
 */

import { apiError } from './errors';

/** How long an idle room survives before it is evicted. */
const ROOM_TTL_MS = 30 * 60 * 1000;

/**
 * Durable Object: one per room. Relays WebSocket messages between the two
 * peers and broadcasts `peer-present` when the second peer connects.
 */
export class RoomDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return apiError('upgrade_required', 'Expected Upgrade: websocket', 426);
    }

    // Check capacity BEFORE accepting: a third peer must be rejected at the
    // handshake. Closing a server socket synchronously here would leave the
    // client with a dead-but-open connection (no close frame delivered).
    const existing = this.state.getWebSockets();
    if (existing.length >= 2) {
      return apiError('room_full', 'Room full', 409);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.state.acceptWebSocket(server);

    if (existing.length === 1) {
      // Second peer joined — notify the first that a peer is present.
      for (const socket of existing) {
        socket.send(JSON.stringify({ type: 'peer-present' }));
      }
    }

    await this.state.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    // Refresh the eviction alarm on any activity.
    await this.state.storage.setAlarm(Date.now() + ROOM_TTL_MS);
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
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('[RoomDO] websocket error:', error);
    ws.close(1011, 'WebSocket error');
  }

  async alarm(): Promise<void> {
    // Idle TTL expired — close all sockets so the DO can evict.
    for (const socket of this.state.getWebSockets()) {
      socket.close(1000, 'room expired');
    }
  }
}
