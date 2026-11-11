import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchIceServers,
  mintRoom,
  SignalingChannel,
  type SignalingCallbacks,
} from '@/lib/signaling';
import { FakeWebSocket, installWebSocket } from './fakes';

function makeCallbacks(): SignalingCallbacks {
  return {
    onMessage: vi.fn(),
    onError: vi.fn(),
    onClose: vi.fn(),
  };
}

describe('p2p/signaling — ICE server config', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the servers supplied by the worker', async () => {
    const servers = [{ urls: 'turn:turn.example.com', username: 'u', credential: 'c' }];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ iceServers: servers }), { status: 200 })),
    );

    await expect(fetchIceServers()).resolves.toEqual(servers);
  });

  it('falls back to public STUN when the worker returns an empty list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ iceServers: [] }), { status: 200 })),
    );

    const servers = await fetchIceServers();
    expect(servers).toHaveLength(2);
    expect(servers[0]?.urls).toBe('stun:stun.l.google.com:19302');
  });

  it('falls back to STUN when the worker responds with an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));

    await expect(fetchIceServers()).resolves.toEqual([
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]);
  });

  it('falls back to STUN and warns when the request throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );

    await expect(fetchIceServers()).resolves.toHaveLength(2);
    expect(warn).toHaveBeenCalled();
  });
});

describe('p2p/signaling — room minting', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the room id from the worker', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ roomId: 'ABC123' }), { status: 200 })),
    );

    await expect(mintRoom()).resolves.toBe('ABC123');
  });

  it('throws when room minting fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    await expect(mintRoom()).rejects.toThrow('Failed to mint room');
  });
});

describe('p2p/signaling — SignalingChannel', () => {
  beforeEach(() => {
    installWebSocket();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function openChannel(callbacks: SignalingCallbacks) {
    const channel = new SignalingChannel(callbacks);
    const promise = channel.open('ABC123', 'sender');
    const socket = FakeWebSocket.instances.at(-1);
    if (!socket) throw new Error('WebSocket was not created');
    socket.triggerOpen();
    await promise;
    return { channel, socket };
  }

  it('opens the room websocket and announces the role', async () => {
    const callbacks = makeCallbacks();
    const { socket } = await openChannel(callbacks);

    expect(socket.url).toMatch(/^ws:\/\/.+\/api\/room\/ABC123\/ws$/);
    expect(socket.sent).toEqual([JSON.stringify({ type: 'hello', role: 'sender' })]);
  });

  it('parses incoming signals', async () => {
    const callbacks = makeCallbacks();
    const { socket } = await openChannel(callbacks);

    socket.triggerMessage(JSON.stringify({ type: 'peer-present' }));

    expect(callbacks.onMessage).toHaveBeenCalledWith({ type: 'peer-present' });
  });

  it('ignores malformed incoming signals', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const callbacks = makeCallbacks();
    const { socket } = await openChannel(callbacks);

    socket.triggerMessage('{broken');

    expect(warn).toHaveBeenCalled();
    expect(callbacks.onMessage).not.toHaveBeenCalled();
  });

  it('sends only while the socket is open', async () => {
    const callbacks = makeCallbacks();
    const { channel, socket } = await openChannel(callbacks);
    socket.sent = [];

    channel.send({ type: 'peer-present' });
    expect(socket.sent).toEqual([JSON.stringify({ type: 'peer-present' })]);

    socket.readyState = FakeWebSocket.CLOSED;
    channel.send({ type: 'peer-present' });
    expect(socket.sent).toHaveLength(1);
  });

  it('rejects and reports a websocket error', async () => {
    const callbacks = makeCallbacks();
    const channel = new SignalingChannel(callbacks);
    const promise = channel.open('ABC123', 'receiver');
    const socket = FakeWebSocket.instances.at(-1)!;

    socket.triggerError();

    await expect(promise).rejects.toThrow('signaling websocket error');
    expect(callbacks.onError).toHaveBeenCalledTimes(1);
  });

  it('reports closure and closes the socket', async () => {
    const callbacks = makeCallbacks();
    const { channel, socket } = await openChannel(callbacks);

    channel.close();

    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
  });
});
