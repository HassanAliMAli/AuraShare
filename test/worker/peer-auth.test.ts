/** Contract checks for room authorization; these do not emulate the Workers runtime. */
import { timingSafeEqual } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PeerAuth } from '../../backend/modules/peer-auth';
beforeEach(() => {
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  vi.stubGlobal('crypto', { getRandomValues, subtle: { timingSafeEqual } });
});
function peer() {
  let attachment: unknown = null;
  return {
    readyState: 1, send: vi.fn(),
    serializeAttachment: (value: unknown) => { attachment = structuredClone(value); },
    deserializeAttachment: () => structuredClone(attachment),
  };
}
function setup() {
  const first = peer(); const second = peer();
  const sockets = [first, second];
  const state = { getWebSockets: () => sockets } as unknown as DurableObjectState;
  const auth = new PeerAuth(state, { TURN_KEY_ID: 'key', TURN_KEY_API_TOKEN: 'secret' });
  auth.admit(first as unknown as WebSocket); auth.admit(second as unknown as WebSocket);
  const token = (socket: typeof first) => JSON.parse(socket.send.mock.calls[0]![0]).token as string;
  const request = (token: string) => new Request('https://local/api/room/ABC123/ice-servers', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  return { first, second, auth, state, token, request };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('peer TURN authorization', () => {
  it('rejects unknown, revoked, and disconnected peer tokens before issuance', async () => {
    const p = setup(); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect((await p.auth.issue(p.request('f'.repeat(64)))).status).toBe(401);
    p.auth.revoke(p.first as unknown as WebSocket);
    expect((await p.auth.issue(p.request(p.token(p.first)))).status).toBe(401);
    p.second.readyState = 3;
    expect((await p.auth.issue(p.request(p.token(p.second)))).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('coalesces same-peer issuance but never shares another peer cache', async () => {
    const p = setup(); let count = 0;
    const fetch = vi.fn(async () => Response.json({ iceServers: [{ urls: 'turn:relay', username: `peer-${++count}`, credential: 'c' }] }));
    vi.stubGlobal('fetch', fetch);
    const [a, b] = await Promise.all([p.auth.issue(p.request(p.token(p.first))), p.auth.issue(p.request(p.token(p.first)))]);
    expect(await a.json()).toEqual(await b.json()); expect(fetch).toHaveBeenCalledTimes(1);
    await p.auth.issue(p.request(p.token(p.second))); expect(fetch).toHaveBeenCalledTimes(2);
    // A new helper (as after hibernation) reconstructs the cache from attachments.
    const woke = new PeerAuth(p.state, { TURN_KEY_ID: 'key', TURN_KEY_API_TOKEN: 'secret' });
    await woke.issue(p.request(p.token(p.first))); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not return expired cached credentials after upstream failure', async () => {
    vi.useFakeTimers(); const p = setup();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ iceServers: [{ urls: 'turn:relay', username: 'u', credential: 'c' }] })));
    expect((await p.auth.issue(p.request(p.token(p.first)))).status).toBe(200);
    await vi.advanceTimersByTimeAsync(61 * 60000);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })));
    const response = await p.auth.issue(p.request(p.token(p.first)));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'turn_unavailable' } });
  });
});
