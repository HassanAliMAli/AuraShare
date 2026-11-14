import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignalingChannel, fetchPeerIce, mintRoom } from '@/lib/signaling';
import { FakeWebSocket, installWebSocket } from './fakes';
import { STUN_SERVERS } from '../../shared/ice';

beforeEach(() => installWebSocket());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const callbacks = () => ({ onMessage: vi.fn(), onError: vi.fn(), onClose: vi.fn() });
const token = 'a'.repeat(64);

describe('signaling admission and cancellation', () => {
  it('waits for a private admission token rather than just the socket open event', async () => {
    const channel = new SignalingChannel(callbacks());
    const promise = channel.open('ABC123', 'sender');
    const ws = FakeWebSocket.instances.at(-1)!; ws.triggerOpen();
    ws.triggerMessage(JSON.stringify({ type: 'admitted', version: 2, token, expiresAt: Date.now() + 60000 }));
    await expect(promise).resolves.toMatchObject({ token });
    expect(ws.url).toContain('?v=2'); channel.close();
  });
  it('rejects and cancels an opening socket without retrying after close', async () => {
    const cb = callbacks(); const channel = new SignalingChannel(cb);
    const promise = channel.open('ABC123', 'receiver');
    const rejected = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    channel.close(); await rejected;
    expect(FakeWebSocket.instances).toHaveLength(1); expect(cb.onError).not.toHaveBeenCalled();
  });
  it('stops heartbeats on close', async () => {
    vi.useFakeTimers();
    const channel = new SignalingChannel(callbacks()); const open = channel.open('ABC123', 'sender');
    const ws = FakeWebSocket.instances.at(-1)!; ws.triggerOpen();
    ws.triggerMessage(JSON.stringify({ type: 'admitted', version: 2, token, expiresAt: Date.now() + 60000 }));
    await open; channel.startHeartbeat(); await vi.advanceTimersByTimeAsync(60000);
    expect(ws.sent).toContain('{"type":"heartbeat"}');
    channel.close(); const count = ws.sent.length;
    await vi.advanceTimersByTimeAsync(120000); expect(ws.sent).toHaveLength(count);
  });
});
describe('ICE and mint requests', () => {
  it('propagates request cancellation', async () => {
    const controller = new AbortController(); controller.abort();
    vi.stubGlobal('fetch', vi.fn(async () => { throw controller.signal.reason; }));
    await expect(mintRoom(controller.signal)).rejects.toBeDefined();
  });
  it('sends the private token as a header, never in the URL', async () => {
    const fetch = vi.fn(async () => Response.json({ iceServers: STUN_SERVERS, expiresAt: null, degraded: true }));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchPeerIce('ABC123', token, new AbortController().signal)).resolves.toMatchObject({ degraded: true });
    expect(fetch.mock.calls[0]).toEqual(['/api/room/ABC123/ice-servers', expect.objectContaining({ headers: { Authorization: `Bearer ${token}` } })]);
  });
  it('validates minted codes and passes cancellation to fetch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ roomId: 'ABC123' })));
    await expect(mintRoom(new AbortController().signal)).resolves.toBe('ABC123');
  });
});
