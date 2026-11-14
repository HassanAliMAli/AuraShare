import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { RoomDO, generateRoomCode } from '../../backend/index';
import {
  CODE_VALIDITY_MS,
  MINTED_KEY,
  MINT_PATH,
  ROOM_IDLE_TTL_MS,
} from '../../backend/modules/room-protocol';
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

type FakeSocket = ReturnType<typeof makeSocket>;

/**
 * A Durable Object state that behaves like the real one where it matters:
 * the storage is a map, the alarm is a single timestamp, and accepting a
 * socket puts it in the room.
 */
function makeState(sockets: FakeSocket[] = []) {
  const data = new Map<string, unknown>();
  let alarm: number | null = null;
  const writes = { alarm: 0, deleteAll: 0 };

  const state = {
    getWebSockets: vi.fn(() => sockets),
    acceptWebSocket: vi.fn((socket: unknown) => {
      sockets.push(socket as FakeSocket);
    }),
    storage: {
      get: vi.fn(async (key: string) => data.get(key)),
      put: vi.fn(async (key: string, value: unknown) => {
        data.set(key, value);
      }),
      deleteAll: vi.fn(async () => {
        data.clear();
        alarm = null;
        writes.deleteAll += 1;
      }),
      getAlarm: vi.fn(async () => alarm),
      setAlarm: vi.fn(async (time: number) => {
        alarm = time;
        writes.alarm += 1;
      }),
    },
    /** The time the alarm is currently set to, for the assertions. */
    alarmTime: () => alarm,
    /** How many times the alarm has been written. */
    alarmWrites: () => writes.alarm,
    /** How many times the storage has been released. */
    deleteAllCalls: () => writes.deleteAll,
    /** Whether the room still holds the record of its mint. */
    stored: (key: string) => data.get(key),
  };

  return state as unknown as DurableObjectState & {
    alarmTime: () => number | null;
    alarmWrites: () => number;
    deleteAllCalls: () => number;
    stored: (key: string) => unknown;
  };
}

/**
 * The Workers runtime hands the socket to the client with a `101` response.
 * Node's `Response` refuses that status, and `WebSocketPair` only exists
 * in workerd, so the accept path is exercised with both stubbed.
 */
function stubSwitchingProtocols(): void {
  vi.stubGlobal(
    'WebSocketPair',
    class {
      0 = makeSocket() as unknown as WebSocket;
      1 = makeSocket() as unknown as WebSocket;
    },
  );

  const RealResponse = globalThis.Response;
  class SwitchingProtocolsResponse extends RealResponse {
    constructor(body?: BodyInit | null, init?: ResponseInit) {
      const status = init?.status ?? 200;
      super(body, status === 101 ? { ...init, status: 200 } : init);
      if (status === 101) {
        Object.defineProperty(this, 'status', { value: 101 });
      }
    }
  }
  vi.stubGlobal('Response', SwitchingProtocolsResponse);
}

/** A request that asks for the signalling socket of a room. */
function socketRequest(path = '/api/room/ABC123/ws'): Request {
  return new Request(`http://local${path}`, { headers: { Upgrade: 'websocket' } });
}

/** The internal request the Worker sends to reserve a room. */
function mintRequest(): Request {
  return new Request(`http://local${MINT_PATH}`, { method: 'POST' });
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

describe('worker/worker — documented API contract', () => {
  /**
   * `docs/api.md` is the contract. These assertions exist so the document
   * cannot drift away from the Worker: every claim in the "Conventions" and
   * "Errors" sections is checked here. If a change breaks one of them, the
   * document changes in the same commit.
   */

  it('puts the documented security headers on every JSON response', async () => {
    const response = await worker.fetch(
      new Request('http://local/api/ice-servers'),
      env(),
    );

    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('puts the documented security headers on error responses too', async () => {
    const response = await worker.fetch(new Request('http://local/missing'), env());

    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('answers a preflight with an empty 200 and no body', async () => {
    const response = await worker.fetch(
      new Request('http://local/api/room', { method: 'OPTIONS' }),
      env(),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it.each([
    ['GET', '/api/room', 'not_found', 'Not found', 404],
    ['POST', '/api/ice-servers', 'not_found', 'Not found', 404],
    ['GET', '/missing', 'not_found', 'Not found', 404],
  ])(
    'answers %s %s with the documented error shape',
    async (method, path, code, message, status) => {
      const response = await worker.fetch(
        new Request(`http://local${path}`, { method }),
        env(),
      );
      expect(response.status).toBe(status);
      expect(response.headers.get('content-type')).toBe('application/json');
      expect(await response.json()).toEqual({ error: { code, message } });
    },
  );

  it('answers the websocket route with the documented 426 body', async () => {
    const response = await worker.fetch(new Request('http://local/api/room/ABC123/ws'), env());
    expect(response.status).toBe(426);
    expect(await response.json()).toEqual({
      error: { code: 'upgrade_required', message: 'Expected Upgrade: websocket' },
    });
  });

  it('mints a code the documented alphabet allows', async () => {
    const response = await worker.fetch(
      new Request('http://local/api/room', { method: 'POST' }),
      env(),
    );
    const body = (await response.json()) as { roomId: string };
    expect(body.roomId).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
  });

  it('serves STUN-only servers when TURN is not configured', async () => {
    const response = await worker.fetch(
      new Request('http://local/api/ice-servers'),
      env(),
    );
    const body = (await response.json()) as { iceServers: { urls: string }[] };

    // The three documented fallbacks, in order.
    expect(body.iceServers.map((server) => server.urls)).toEqual([
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun.cloudflare.com:3478',
    ]);
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
    await room.fetch(mintRequest());

    const response = await room.fetch(socketRequest());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: 'room_full', message: 'Room full' },
    });
    expect(state.acceptWebSocket).not.toHaveBeenCalled();
  });

  it('relays messages to every other socket', async () => {
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

  it('tells the peers and closes every socket when the room TTL alarm fires', async () => {
    const sockets = [makeSocket(), makeSocket()];
    const room = new RoomDO(makeState(sockets));

    await room.alarm();

    for (const socket of sockets) {
      // The peer is told why the room went away, not just that it did.
      expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'room-expired' }));
      expect(socket.close).toHaveBeenCalledWith(1000, 'room expired');
    }
  });
});

describe('worker/worker — RoomDO lifecycle', () => {
  beforeEach(() => {
    stubSwitchingProtocols();
  });

  it('refuses a join for a code nobody minted', async () => {
    const state = makeState();
    const room = new RoomDO(state);

    const response = await room.fetch(socketRequest());

    // Without this check every six characters a stranger could guess would
    // allocate a Durable Object.
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'room_not_found', message: 'No such room' },
    });
    expect(state.acceptWebSocket).not.toHaveBeenCalled();
  });

  it('does not pay for storage a guess never had', async () => {
    const state = makeState();
    const room = new RoomDO(state);

    const response = await room.fetch(socketRequest());

    expect(response.status).toBe(404);
    // The mint time is the only thing this room ever stores, so a room that
    // never had one never held a row. There is nothing to release — and a
    // guess must not make the Durable Object create a database just to
    // delete it again.
    expect(state.storage.deleteAll).not.toHaveBeenCalled();
    expect(state.storage.put).not.toHaveBeenCalled();
    expect(state.alarmTime()).toBeNull();
  });

  it('accepts a join for a code that was minted', async () => {
    const state = makeState();
    const room = new RoomDO(state);
    await room.fetch(mintRequest());

    const response = await room.fetch(socketRequest());

    expect(response.status).toBe(101);
    expect(state.acceptWebSocket).toHaveBeenCalledTimes(1);
  });

  it('gives a minted code a fixed validity window', async () => {
    const state = makeState();
    const room = new RoomDO(state);

    const before = Date.now();
    await room.fetch(mintRequest());

    // The window runs from the mint, so a code cannot be kept alive by
    // talking to the room.
    expect(state.alarmTime()).toBeGreaterThanOrEqual(before + CODE_VALIDITY_MS);
    expect(state.alarmTime()).toBeLessThanOrEqual(Date.now() + CODE_VALIDITY_MS);
  });

  it('gives a paired room the longer lease', async () => {
    const state = makeState();
    const room = new RoomDO(state);
    await room.fetch(mintRequest());

    await room.fetch(socketRequest());
    await room.fetch(socketRequest());

    // Two peers make it a session, and a session is worth keeping alive.
    expect(state.alarmTime()).toBeGreaterThan(Date.now() + CODE_VALIDITY_MS);
    expect(state.alarmTime()).toBeLessThanOrEqual(Date.now() + ROOM_IDLE_TTL_MS);
  });

  it('does not shorten the code window when the first peer joins', async () => {
    const state = makeState();
    const room = new RoomDO(state);
    await room.fetch(mintRequest());
    const armed = state.alarmTime();

    await room.fetch(socketRequest());

    expect(state.alarmTime()).toBe(armed);
  });

  it('does not let a second mint of the same code shorten a live session', async () => {
    const state = makeState();
    const room = new RoomDO(state);
    await room.fetch(mintRequest());
    const mintedAt = state.stored(MINTED_KEY);

    // Two peers turn the room into a session, and a session gets the longer
    // lease.
    await room.fetch(socketRequest());
    await room.fetch(socketRequest());
    const lease = state.alarmTime();
    expect(lease).toBeGreaterThan(Date.now() + CODE_VALIDITY_MS);

    // The same code is minted again. The code space is 32⁶ ≈ 1.07 billion,
    // so it is rare — but it happens, and it must not cost the live session
    // its lease.
    await room.fetch(mintRequest());

    expect(state.alarmTime()).toBe(lease);
    // The room keeps the mint time it had: a second mint does not restart
    // the code window either.
    expect(state.stored(MINTED_KEY)).toBe(mintedAt);
  });

  it('releases the storage when the last peer leaves', async () => {
    const leaver = makeSocket();
    const state = makeState([leaver]);
    const room = new RoomDO(state);
    await room.fetch(mintRequest());

    await room.webSocketClose(leaver as unknown as WebSocket, 1000, 'bye');

    // The room is over, so it must not keep its storage: an empty SQLite
    // database still costs about 12 KB.
    expect(state.storage.deleteAll).toHaveBeenCalled();
    expect(state.alarmTime()).toBeNull();
  });

  it('keeps the storage while a peer is still in the room', async () => {
    const leaver = makeSocket();
    const peer = makeSocket();
    const state = makeState([leaver, peer]);
    const room = new RoomDO(state);
    await room.fetch(mintRequest());

    await room.webSocketClose(leaver as unknown as WebSocket, 1000, 'bye');

    expect(state.storage.deleteAll).not.toHaveBeenCalled();
  });

  it('releases the storage when the lease runs out', async () => {
    const state = makeState();
    const room = new RoomDO(state);
    await room.fetch(mintRequest());

    await room.alarm();

    expect(state.storage.deleteAll).toHaveBeenCalled();
    expect(state.alarmTime()).toBeNull();
  });

  it('does not re-arm the alarm on every relayed message', async () => {
    const first = makeSocket();
    const second = makeSocket();
    const state = makeState([first, second]);
    const room = new RoomDO(state);
    // The room already has a lease that is nowhere near firing.
    await state.storage.setAlarm(Date.now() + ROOM_IDLE_TTL_MS);
    const armed = state.alarmWrites();

    for (let i = 0; i < 10; i += 1) {
      await room.webSocketMessage(first as unknown as WebSocket, JSON.stringify({ type: 'ice' }));
    }

    // `setAlarm` is a storage write, and the free plan allows 100,000 rows
    // written a day: a busy session must not spend that budget on its own.
    expect(state.alarmWrites()).toBe(armed);
  });

  it('moves the alarm on when it is close to firing', async () => {
    const first = makeSocket();
    const second = makeSocket();
    const state = makeState([first, second]);
    const room = new RoomDO(state);
    await state.storage.setAlarm(Date.now() + 1000);

    await room.webSocketMessage(first as unknown as WebSocket, JSON.stringify({ type: 'ice' }));

    expect(state.alarmTime()).toBeGreaterThan(Date.now() + ROOM_IDLE_TTL_MS - 1000);
  });
});

describe('worker/worker — reserving a room', () => {
  it('reserves the room behind a minted code', async () => {
    const stubFetch = vi.fn(async () => new Response('ok', { status: 200 }));
    const roomEnv = env({
      ROOMS: {
        idFromName: vi.fn(() => 'durable-id'),
        get: vi.fn(() => ({ fetch: stubFetch })),
      } as unknown as WorkerEnv['ROOMS'],
    });

    const response = await worker.fetch(
      new Request('http://local/api/room', { method: 'POST' }),
      roomEnv,
    );
    const body = (await response.json()) as { roomId: string };

    expect(response.status).toBe(200);
    expect(body.roomId).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
    // The reservation is what makes the code work.
    expect(stubFetch).toHaveBeenCalledTimes(1);
    const [reserved] = stubFetch.mock.calls[0] as unknown as [Request];
    expect(new URL(reserved.url).pathname).toBe(MINT_PATH);
  });

  it('answers 503 when the room cannot be reserved', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const roomEnv = env({
      ROOMS: {
        idFromName: vi.fn(() => 'durable-id'),
        get: vi.fn(() => ({
          fetch: vi.fn(async () => {
            throw new Error('no such namespace');
          }),
        })),
      } as unknown as WorkerEnv['ROOMS'],
    });

    const response = await worker.fetch(
      new Request('http://local/api/room', { method: 'POST' }),
      roomEnv,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: 'room_unavailable', message: 'Could not open a room' },
    });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('worker/worker — rate limiting the room routes', () => {
  function limiter(success = true) {
    return { limit: vi.fn(async () => ({ success })) };
  }

  it('turns away a request the limiter refuses', async () => {
    const response = await worker.fetch(
      new Request('http://local/api/room', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.7' },
      }),
      env({
        ROOM_RATE_LIMITER: limiter(false),
      }),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: { code: 'rate_limited', message: 'Too many requests' },
    });
    expect(response.headers.get('retry-after')).toBe('60');
    // The security headers are still on the error.
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('counts the room routes against the limit, keyed on the client IP', async () => {
    const roomLimiter = limiter();
    await worker.fetch(
      new Request('http://local/api/room', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.7' },
      }),
      env({ ROOM_RATE_LIMITER: roomLimiter }),
    );

    expect(roomLimiter.limit).toHaveBeenCalledWith({ key: '203.0.113.7' });
  });

  it('counts the websocket route against the limit', async () => {
    const roomLimiter = limiter();
    await worker.fetch(
      new Request('http://local/api/room/ABC123/ws', {
        headers: { Upgrade: 'websocket', 'cf-connecting-ip': '203.0.113.7' },
      }),
      env({ ROOM_RATE_LIMITER: roomLimiter }),
    );

    expect(roomLimiter.limit).toHaveBeenCalledTimes(1);
  });

  it('does not count the ice-servers route', async () => {
    const roomLimiter = limiter();
    await worker.fetch(
      new Request('http://local/api/ice-servers'),
      env({ ROOM_RATE_LIMITER: roomLimiter }),
    );

    // The ICE list is cheap and every session needs it.
    expect(roomLimiter.limit).not.toHaveBeenCalled();
  });

  it('does not count a request that has no client IP', async () => {
    const roomLimiter = limiter();
    await worker.fetch(
      new Request('http://local/api/room', { method: 'POST' }),
      env({ ROOM_RATE_LIMITER: roomLimiter }),
    );

    // A local dev server or a test has no IP. Counting them all against one
    // bucket would count every caller together.
    expect(roomLimiter.limit).not.toHaveBeenCalled();
  });

  it('does not count a request that cannot reach a room', async () => {
    const roomLimiter = limiter();

    // The wrong method on the mint path: a 404 that never touches a room.
    const wrongMethod = await worker.fetch(
      new Request('http://local/api/room', {
        method: 'GET',
        headers: { 'cf-connecting-ip': '203.0.113.7' },
      }),
      env({ ROOM_RATE_LIMITER: roomLimiter }),
    );

    // A socket request that is not an upgrade: a 426, also without a room.
    const noUpgrade = await worker.fetch(
      new Request('http://local/api/room/ABC123/ws', {
        headers: { 'cf-connecting-ip': '203.0.113.7' },
      }),
      env({ ROOM_RATE_LIMITER: roomLimiter }),
    );

    expect(wrongMethod.status).toBe(404);
    expect(noUpgrade.status).toBe(426);
    // Neither request can spend the Durable Object budget, so neither may
    // spend a real user's rate-limit budget.
    expect(roomLimiter.limit).not.toHaveBeenCalled();
  });

  it('lets the request through when the limiter itself fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = {
      limit: vi.fn(async () => {
        throw new Error('limiter unavailable');
      }),
    };

    const response = await worker.fetch(
      new Request('http://local/api/room', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.7' },
      }),
      env({ ROOM_RATE_LIMITER: broken }),
    );

    // A broken limiter must not make the app unusable.
    expect(response.status).toBe(200);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
