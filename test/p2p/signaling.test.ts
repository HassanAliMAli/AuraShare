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

describe('signaling retries and failure reporting', () => {
  async function admit(ws: FakeWebSocket, expiry = Date.now() + 60_000) {
    ws.triggerOpen();
    ws.triggerMessage(JSON.stringify({ type: 'admitted', version: 2, token, expiresAt: expiry }));
  }

  it('retries a failed handshake and reports only the final failure', async () => {
    vi.useFakeTimers();
    const cb = callbacks();
    const channel = new SignalingChannel(cb);
    const promise = channel.open('ABC123', 'sender');

    FakeWebSocket.instances.at(-1)!.triggerError();
    await vi.advanceTimersByTimeAsync(250);
    FakeWebSocket.instances.at(-1)!.triggerError();
    await vi.advanceTimersByTimeAsync(250);
    const third = FakeWebSocket.instances.at(-1)!;
    expect(FakeWebSocket.instances).toHaveLength(3);

    await admit(third);
    await expect(promise).resolves.toMatchObject({ token });
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it('gives up after three failed attempts', async () => {
    vi.useFakeTimers();
    const channel = new SignalingChannel(callbacks());
    const promise = channel.open('ABC123', 'receiver');
    const rejected = expect(promise).rejects.toThrow('Signaling connection failed');

    for (let attempt = 0; attempt < 3; attempt += 1) {
      FakeWebSocket.instances.at(-1)!.triggerError();
      if (attempt < 2) await vi.advanceTimersByTimeAsync(250);
    }

    await rejected;
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it('times out an admission that never arrives', async () => {
    vi.useFakeTimers();
    const channel = new SignalingChannel(callbacks());
    const promise = channel.open('ABC123', 'sender');
    const ws = FakeWebSocket.instances.at(-1)!;
    ws.triggerOpen();

    const rejected = expect(promise).rejects.toThrow('Room admission timed out');
    await vi.advanceTimersByTimeAsync(30_500);
    await rejected;
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('retries and rejects an unsupported admission frame', async () => {
    vi.useFakeTimers();
    const channel = new SignalingChannel(callbacks());
    const promise = channel.open('ABC123', 'sender');
    const rejected = expect(promise).rejects.toThrow('Unsupported room');

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ws = FakeWebSocket.instances.at(-1)!;
      ws.triggerOpen();
      ws.triggerMessage(JSON.stringify({ type: 'admitted', version: 1, token, expiresAt: Date.now() + 60_000 }));
      if (attempt < 2) await vi.advanceTimersByTimeAsync(250);
    }

    await rejected;
  });

  it('forwards only well-formed peer frames', async () => {
    const cb = callbacks();
    const channel = new SignalingChannel(cb);
    const promise = channel.open('ABC123', 'sender');
    const ws = FakeWebSocket.instances.at(-1)!;
    await admit(ws);

    ws.triggerMessage('{bad json');
    ws.triggerMessage(JSON.stringify({ type: 'nope' }));
    ws.triggerMessage('x'.repeat(262145));
    ws.triggerMessage(JSON.stringify({ type: 'hello', role: 'receiver', version: 2 }));

    await promise;
    expect(cb.onMessage).toHaveBeenCalledTimes(1);
    expect(cb.onMessage).toHaveBeenCalledWith({ type: 'hello', role: 'receiver', version: 2 });
    channel.close();
  });

  it('reports a transport error only after admission', async () => {
    const cb = callbacks();
    const channel = new SignalingChannel(cb);
    const promise = channel.open('ABC123', 'sender');
    const ws = FakeWebSocket.instances.at(-1)!;
    await admit(ws);
    await promise;

    ws.triggerError();
    expect(cb.onError).toHaveBeenCalledTimes(1);
    channel.close();
  });

  it('reports a close only after admission', async () => {
    const cb = callbacks();
    const channel = new SignalingChannel(cb);
    const promise = channel.open('ABC123', 'sender');
    const ws = FakeWebSocket.instances.at(-1)!;
    await admit(ws);
    await promise;

    ws.triggerClose();
    expect(cb.onClose).toHaveBeenCalledTimes(1);
  });

  it('throws when sending without a live socket and stays quiet after close', async () => {
    const channel = new SignalingChannel(callbacks());
    expect(() => channel.send({ type: 'ready' })).toThrow('Signaling is not open');

    const promise = channel.open('ABC123', 'sender');
    const ws = FakeWebSocket.instances.at(-1)!;
    await admit(ws);
    await promise;
    channel.close();
    expect(() => channel.send({ type: 'ready' })).not.toThrow();
  });

  it('stops the heartbeat once the socket is no longer open', async () => {
    vi.useFakeTimers();
    const channel = new SignalingChannel(callbacks());
    const promise = channel.open('ABC123', 'sender');
    const ws = FakeWebSocket.instances.at(-1)!;
    ws.triggerOpen();
    ws.triggerMessage(JSON.stringify({ type: 'admitted', version: 2, token, expiresAt: Date.now() + 60_000 }));
    await promise;

    channel.startHeartbeat();
    ws.readyState = FakeWebSocket.CLOSED;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ws.sent).not.toContain('{"type":"heartbeat"}');
    channel.close();
  });

  it('reports a heartbeat write failure', async () => {
    vi.useFakeTimers();
    const cb = callbacks();
    const channel = new SignalingChannel(cb);
    const promise = channel.open('ABC123', 'sender');
    const ws = FakeWebSocket.instances.at(-1)!;
    ws.triggerOpen();
    ws.triggerMessage(JSON.stringify({ type: 'admitted', version: 2, token, expiresAt: Date.now() + 60_000 }));
    await promise;

    ws.send = () => { throw new Error('socket gone'); };
    channel.startHeartbeat();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cb.onError).toHaveBeenCalledTimes(1);
    channel.close();
  });
});

describe('ICE configuration validation', () => {
  const signal = () => new AbortController().signal;
  const respond = (body: unknown, ok = true) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(body, { status: ok ? 200 : 500 })));
  };

  it('rejects an unsuccessful response', async () => {
    respond({}, false);
    await expect(fetchPeerIce('ABC123', token, signal())).rejects.toThrow('Could not obtain relay configuration');
  });

  it('rejects malformed relay configuration', async () => {
    const invalid = [
      {},
      { iceServers: [], expiresAt: null, degraded: false },
      { iceServers: STUN_SERVERS, expiresAt: null },
      { iceServers: STUN_SERVERS, expiresAt: null, degraded: 'no' },
      { iceServers: STUN_SERVERS, expiresAt: 'soon', degraded: true },
      { iceServers: STUN_SERVERS, expiresAt: 0, degraded: true },
      { iceServers: [{ urls: 'http://bad' }], expiresAt: null, degraded: true },
      { iceServers: [{ urls: [] }], expiresAt: null, degraded: true },
      { iceServers: [{ urls: 'turn:relay', username: 1 }], expiresAt: null, degraded: true },
    ];

    for (const body of invalid) {
      respond(body);
      await expect(fetchPeerIce('ABC123', token, signal())).rejects.toThrow('Invalid relay configuration');
    }
  });

  it('rejects credentials that have already expired', async () => {
    respond({ iceServers: STUN_SERVERS, expiresAt: 1, degraded: true });
    await expect(fetchPeerIce('ABC123', token, signal())).rejects.toThrow('Relay credentials have expired');
  });

  it('converts server time to a local deadline', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    respond({ iceServers: STUN_SERVERS, expiresAt: 2_000_000, serverTime: 1_500_000, degraded: false });

    await expect(fetchPeerIce('ABC123', token, signal())).resolves.toMatchObject({ expiresAt: 1_500_000 });
  });

  it('uses the absolute deadline when the server time is unreliable', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    respond({ iceServers: STUN_SERVERS, expiresAt: 2_000_000, serverTime: 'later', degraded: false });

    await expect(fetchPeerIce('ABC123', token, signal())).resolves.toMatchObject({ expiresAt: 2_000_000 });
  });

  it('accepts STUN-only and TURN credentials', async () => {
    respond({ iceServers: STUN_SERVERS, expiresAt: null, degraded: true });
    await expect(fetchPeerIce('ABC123', token, signal())).resolves.toMatchObject({ expiresAt: null, degraded: true });

    respond({
      iceServers: [{ urls: 'turns:relay.example:443', username: 'user', credential: 'secret' }],
      expiresAt: Date.now() + 3_600_000,
      degraded: false,
    });
    await expect(fetchPeerIce('ABC123', token, signal())).resolves.toMatchObject({ degraded: false });
  });

  it('rejects a mint that fails or returns an invalid code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'nope' }, { status: 503 })));
    await expect(mintRoom()).rejects.toThrow('Could not open a room');

    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ roomId: 'bad' })));
    await expect(mintRoom()).rejects.toThrow('Could not open a room');
  });
});
