import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { RoomDO, generateRoomCode } from '../../backend/index';
import { isRoomCode, ROOM_CODE_ALPHABET } from '@/lib/roomCode';

type WorkerEnv = Parameters<typeof worker.fetch>[1];

function env(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    ROOMS: {
      idFromName: vi.fn(() => 'durable-id'),
      get: vi.fn(() => ({ fetch: vi.fn(async () => new Response('ok', { status: 200 })) })),
    } as unknown as WorkerEnv['ROOMS'],
    ...overrides,
  };
}

function makeSocket() {
  return {
    send: vi.fn(),
    close: vi.fn(),
  };
}

function makeState(sockets: ReturnType<typeof makeSocket>[] = []) {
  return {
    getWebSockets: vi.fn(() => sockets),
    acceptWebSocket: vi.fn(),
    storage: {
      setAlarm: vi.fn(async () => undefined),
    },
  } as unknown as DurableObjectState;
}

describe('worker/worker — HTTP routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('answers CORS preflight with an empty 200', async () => {
    const response = await worker.fetch(
      new Request('http://local/api/room', { method: 'OPTIONS' }),
      env(),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('returns STUN-only ICE servers when TURN is not configured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const response = await worker.fetch(
      new Request('http://local/api/ice-servers'),
      env(),
    );
    const body = (await response.json()) as { iceServers: { urls: string }[] };

    expect(response.status).toBe(200);
    expect(body.iceServers).toHaveLength(3);
    expect(body.iceServers.map((server) => server.urls)).toContain(
      'stun:stun.cloudflare.com:3478',
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('mints six-character Crockford room codes', async () => {
    for (let i = 0; i < 20; i += 1) {
      const response = await worker.fetch(
        new Request('http://local/api/room', { method: 'POST' }),
        env(),
      );
      const body = (await response.json()) as { roomId: string };
      expect(body.roomId).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
      expect(response.headers.get('x-frame-options')).toBe('DENY');
    }
  });

  it('rejects the websocket route without an Upgrade header', async () => {
    const response = await worker.fetch(
      new Request('http://local/api/room/ABC123/ws'),
      env(),
    );
    expect(response.status).toBe(426);
    expect(await response.text()).toContain('Upgrade');
  });

  it('requires an uppercase room code in the websocket path', async () => {
    const response = await worker.fetch(
      new Request('http://local/api/room/abc123/ws', {
        headers: { Upgrade: 'websocket' },
      }),
      env(),
    );
    expect(response.status).toBe(404);
  });

  it('refuses a room code the Worker could never have minted', async () => {
    // I, L, O and U are not in the Crockford alphabet, so such a code must not
    // be able to allocate a Durable Object.
    const response = await worker.fetch(
      new Request('http://local/api/room/IL0OU1/ws', {
        headers: { Upgrade: 'websocket' },
      }),
      env(),
    );
    expect(response.status).toBe(404);
  });

  it('mints codes the client accepts', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isRoomCode(generateRoomCode())).toBe(true);
    }
  });

  it('shares one alphabet with the client', () => {
    // The client and the Worker must agree, or a code typed on one end never
    // resolves on the other.
    for (const char of ROOM_CODE_ALPHABET) {
      expect(isRoomCode(char.repeat(6))).toBe(true);
    }
  });

  it('forwards an upgraded websocket request to the room Durable Object', async () => {
    const stubResponse = new Response('upstream', { status: 200 });
    const stubFetch = vi.fn(async () => stubResponse);
    const roomEnv = env({
      ROOMS: {
        idFromName: vi.fn(() => 'durable-id'),
        get: vi.fn(() => ({ fetch: stubFetch })),
      } as unknown as WorkerEnv['ROOMS'],
    });
    const request = new Request('http://local/api/room/ABC123/ws', {
      headers: { Upgrade: 'websocket' },
    });

    const response = await worker.fetch(request, roomEnv);

    expect(roomEnv.ROOMS.idFromName).toHaveBeenCalledWith('ABC123');
    expect(roomEnv.ROOMS.get).toHaveBeenCalledWith('durable-id');
    expect(stubFetch).toHaveBeenCalledWith(request);
    expect(response).toBe(stubResponse);
  });

  it.each([
    ['GET', '/api/room'],
    ['POST', '/api/ice-servers'],
    ['GET', '/missing'],
    ['GET', '/api/room/TOOLONG/ws'],
  ])('returns 404 for %s %s', async (method, path) => {
    const response = await worker.fetch(
      new Request(`http://local${path}`, { method }),
      env(),
    );
    expect(response.status).toBe(404);
  });
});

describe('worker/worker — TURN credential generation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns ephemeral TURN servers from the Cloudflare API', async () => {
    const servers = [{ urls: 'turn:turn.cloudflare.com', username: 'u', credential: 'c' }];
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ iceServers: servers }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const fresh = (await import('../../backend/index')).default;
    const response = await fresh.fetch(
      new Request('http://local/api/ice-servers'),
      env({ TURN_KEY_ID: 'key', TURN_KEY_API_TOKEN: 'token' }),
    );
    const body = (await response.json()) as { iceServers: typeof servers };

    expect(body.iceServers).toEqual(servers);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/turn/keys/key/credentials/generate-ice-servers');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer token' });
  });

  it('caches fresh TURN credentials across requests', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ iceServers: [{ urls: 'turn:cached' }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const fresh = (await import('../../backend/index')).default;
    const roomEnv = env({ TURN_KEY_ID: 'key', TURN_KEY_API_TOKEN: 'token' });
    await fresh.fetch(new Request('http://local/api/ice-servers'), roomEnv);
    const second = await fresh.fetch(new Request('http://local/api/ice-servers'), roomEnv);
    const body = (await second.json()) as { iceServers: { urls: string }[] };

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(body.iceServers[0]?.urls).toBe('turn:cached');
  });

  it('falls back to STUN when the Cloudflare API errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));

    const fresh = (await import('../../backend/index')).default;
    const response = await fresh.fetch(
      new Request('http://local/api/ice-servers'),
      env({ TURN_KEY_ID: 'key', TURN_KEY_API_TOKEN: 'token' }),
    );
    const body = (await response.json()) as { iceServers: { urls: string }[] };

    expect(body.iceServers[0]?.urls).toBe('stun:stun.l.google.com:19302');
    expect(warn).toHaveBeenCalled();
  });

  it('falls back to STUN when the API returns no servers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ iceServers: [] }), { status: 200 })),
    );

    const fresh = (await import('../../backend/index')).default;
    const response = await fresh.fetch(
      new Request('http://local/api/ice-servers'),
      env({ TURN_KEY_ID: 'key', TURN_KEY_API_TOKEN: 'token' }),
    );
    const body = (await response.json()) as { iceServers: { urls: string }[] };

    expect(body.iceServers.length).toBe(3);
  });

  it('falls back to STUN when the API request throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );

    const fresh = (await import('../../backend/index')).default;
    const response = await fresh.fetch(
      new Request('http://local/api/ice-servers'),
      env({ TURN_KEY_ID: 'key', TURN_KEY_API_TOKEN: 'token' }),
    );
    const body = (await response.json()) as { iceServers: { urls: string }[] };

    expect(body.iceServers.length).toBe(3);
    expect(error).toHaveBeenCalled();
  });
});

describe('worker/worker — RoomDO relay', () => {
  it('rejects a non-websocket request', async () => {
    const room = new RoomDO(makeState());
    const response = await room.fetch(new Request('http://local/room'));
    expect(response.status).toBe(426);
  });

  it('rejects a third peer before accepting the socket', async () => {
    const sockets = [makeSocket(), makeSocket()];
    const state = makeState(sockets);
    const room = new RoomDO(state);

    const response = await room.fetch(
      new Request('http://local/room', { headers: { Upgrade: 'websocket' } }),
    );

    expect(response.status).toBe(409);
    expect(state.acceptWebSocket).not.toHaveBeenCalled();
  });

  it('relays messages to every other socket and refreshes the alarm', async () => {
    const first = makeSocket();
    const second = makeSocket();
    const state = makeState([first, second]);
    const room = new RoomDO(state);

    await room.webSocketMessage(
      first as unknown as WebSocket,
      JSON.stringify({ type: 'offer' }),
    );

    expect(second.send).toHaveBeenCalledWith(JSON.stringify({ type: 'offer' }));
    expect(first.send).not.toHaveBeenCalled();
    expect(state.storage.setAlarm).toHaveBeenCalled();
  });

  it('announces peer-left and closes the departing socket', async () => {
    const leaver = makeSocket();
    const peer = makeSocket();
    const room = new RoomDO(makeState([leaver, peer]));

    await room.webSocketClose(leaver as unknown as WebSocket, 1000, 'bye');

    expect(peer.send).toHaveBeenCalledWith(JSON.stringify({ type: 'peer-left' }));
    expect(leaver.close).toHaveBeenCalledWith(1000, 'bye');
  });

  it('survives the departing socket already being closed by the runtime', async () => {
    // workerd closes the socket before invoking webSocketClose; calling
    // close() again throws and surfaces as an uncaught DO exception.
    const leaver = makeSocket();
    leaver.close.mockImplementation(() => {
      throw new Error('WebSocket is already closed');
    });
    const peer = makeSocket();
    const room = new RoomDO(makeState([leaver, peer]));

    await expect(
      room.webSocketClose(leaver as unknown as WebSocket, 1000, 'bye'),
    ).resolves.toBeUndefined();
    expect(peer.send).toHaveBeenCalledWith(JSON.stringify({ type: 'peer-left' }));
  });

  it('closes a socket with 1011 on error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const socket = makeSocket();
    const room = new RoomDO(makeState([socket]));

    await room.webSocketError(socket as unknown as WebSocket, new Error('boom'));

    expect(socket.close).toHaveBeenCalledWith(1011, 'WebSocket error');
    expect(error).toHaveBeenCalled();
  });

  it('closes every socket when the room TTL alarm fires', async () => {
    const sockets = [makeSocket(), makeSocket()];
    const room = new RoomDO(makeState(sockets));

    await room.alarm();

    for (const socket of sockets) {
      expect(socket.close).toHaveBeenCalledWith(1000, 'room expired');
    }
  });
});
