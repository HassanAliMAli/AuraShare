/** Per-peer TURN configuration. Caching and authorization belong to the room. */
import { STUN_SERVERS } from '../../shared/ice';

export type IceServer = { urls: string | string[]; username?: string; credential?: string };
export type IceConfig = { iceServers: IceServer[]; expiresAt: number | null; degraded: boolean };
export const TURN_TTL_SECONDS = 3600;
export const TURN_RENEW_MARGIN_MS = 15 * 60_000;

function validServers(value: unknown): value is IceServer[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 16 && value.every((server) => {
    if (!server || typeof server !== 'object') return false;
    const { urls, username, credential } = server as Record<string, unknown>;
    const list = typeof urls === 'string' ? [urls] : urls;
    return Array.isArray(list) && list.length > 0 && list.every((url) =>
      typeof url === 'string' && /^(stun|stuns|turn|turns):/.test(url)) &&
      (username === undefined || typeof username === 'string') &&
      (credential === undefined || typeof credential === 'string');
  });
}

export async function generateIceConfig(keyId?: string, apiToken?: string): Promise<IceConfig> {
  if (!keyId || !apiToken) return { iceServers: STUN_SERVERS, expiresAt: null, degraded: true };
  const issuedAt = Date.now();
  const response = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(`TURN issuance failed (${response.status})`);
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('iceServers' in body) || !validServers(body.iceServers)) {
    throw new Error('Invalid TURN configuration');
  }
  const turn = body.iceServers.filter((server) =>
    (typeof server.urls === 'string' ? [server.urls] : server.urls).some((url) => /^turns?:/.test(url)));
  if (!turn.length || turn.some((server) => !server.username || !server.credential)) {
    throw new Error('Missing TURN credentials');
  }
  return { iceServers: body.iceServers, expiresAt: issuedAt + TURN_TTL_SECONDS * 1000, degraded: false };
}
