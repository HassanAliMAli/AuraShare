import { describe, expect, it } from 'vitest';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';

/**
 * A check against the **deployed** Worker.
 *
 * Everything else in the suite runs against a local stack, and a local stack
 * cannot tell you whether the thing people actually use works. It serves the
 * SPA from Vite and proxies `/api` to a local Wrangler — so the two
 * failure modes that only exist in production are invisible to it:
 *
 *  - the SPA deep link. A browser navigating to `/app` sends
 *    `Sec-Fetch-Mode: navigate`, and Cloudflare's static-asset router serves
 *    `/index.html` for a navigation request that matches no asset. A plain
 *    `fetch()` does **not** send that header, so it gets the Worker's JSON
 *    404 instead — the same URL, two different answers depending on who is
 *    asking. Only a navigation request proves the app screen loads.
 *  - the Worker script's own routing, which is a different code path from
 *    the Vite dev server's history fallback.
 *
 * The check is opt-in: it runs only when `LIVE_URL` is set, so the normal
 * suite never depends on a deployment being up.
 *
 * ```bash
 * LIVE_URL=https://aurashare.hassanali.site npm run test:live
 * ```
 */

const LIVE_URL = process.env.LIVE_URL;

const describeLive = LIVE_URL ? describe : describe.skip;

/**
 * A raw HTTP request.
 *
 * `fetch` refuses to send a `Sec-`-prefixed header — the Fetch standard
 * lists them as forbidden — so the navigation check cannot be written with
 * it.
 */
function raw(
  url: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  const target = new URL(url);
  const send = target.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req = send(
      {
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: 'GET',
        headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describeLive('live deployment', () => {
  it('serves the landing page', async () => {
    const response = await fetch(`${LIVE_URL}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');

    const html = await response.text();
    expect(html).toContain('id="root"');
  });

  it('serves the app screen to a navigation request', async () => {
    // This is the check the local suite cannot make. Without the navigation
    // header the Worker answers with its JSON 404 — correctly, for a
    // non-navigation request, but the wrong answer for a browser following
    // a link to /app.
    const response = await raw(`${LIVE_URL}/app`, {
      'Sec-Fetch-Mode': 'navigate',
      Accept: 'text/html,application/xhtml+xml',
    });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('id="root"');
  });

  it('serves the API contract the client depends on', async () => {
    const ice = await fetch(`${LIVE_URL}/api/ice-servers`);

    expect(ice.status).toBe(200);
    expect(ice.headers.get('content-type')).toContain('application/json');
    expect(ice.headers.get('x-frame-options')).toBe('DENY');
    expect(ice.headers.get('cache-control')).toBe('no-store');

    const body = (await ice.json()) as { iceServers: { urls: string | string[] }[] };
    expect(body.iceServers.length).toBeGreaterThan(0);

    // `RTCIceServer.urls` is a string *or* an array of strings — a STUN entry
    // has one server, a TURN entry has six transports.
    for (const server of body.iceServers) {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      expect(urls.length).toBeGreaterThan(0);
      expect(urls.every((url) => typeof url === 'string')).toBe(true);
    }
  });

  it('mints a transmission code', async () => {
    const response = await fetch(`${LIVE_URL}/api/room`, { method: 'POST' });

    expect(response.status).toBe(200);

    const body = (await response.json()) as { roomId: string };
    expect(body.roomId).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
  });

  it('answers an unknown path with the documented error shape', async () => {
    const response = await fetch(`${LIVE_URL}/api/does-not-exist`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'not_found', message: 'Not found' },
    });
  });

  it('refuses the websocket route without an upgrade header', async () => {
    const response = await fetch(`${LIVE_URL}/api/room/ABC123/ws`);

    expect(response.status).toBe(426);
    expect(await response.json()).toEqual({
      error: { code: 'upgrade_required', message: 'Expected Upgrade: websocket' },
    });
  });
});
