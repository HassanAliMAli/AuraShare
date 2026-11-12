/**
 * ICE server configuration — STUN always, TURN when it is configured.
 *
 * The Worker mints ephemeral TURN credentials through the Cloudflare Calls
 * API rather than shipping a static key to the browser. The credentials are
 * cached in the isolate and re-minted shortly before they expire.
 */

/** ICE server config shape (the client casts this to RTCIceServer[]). */
export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

/** Response from the Cloudflare Calls credential-generation API. */
type CloudflareIceResponse = {
  iceServers: IceServer[];
  // Cloudflare returns expiry info; we track it to refresh before TTL ends.
  expiresOn?: string;
};

/** How long the minted TURN credentials stay valid. */
const TURN_CREDENTIAL_TTL_SECONDS = 86400; // 24h — covers the longest expected session.

/** Re-mint the credentials once less than this remains. */
const TURN_REFRESH_MARGIN_MS = 60 * 60 * 1000;

/** What the browser gets when TURN is unavailable or unconfigured. */
const STUN_ONLY_FALLBACK: IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/** Module-level cache so we don't call the CF API on every ice-servers request. */
let cachedIceServers: IceServer[] | null = null;
let cachedExpiry = 0;

/**
 * Returns ICE servers with ephemeral TURN credentials from Cloudflare Calls.
 *
 * Falls back to STUN-only on error or when the TURN secrets aren't
 * configured. A peer behind a symmetric NAT will not connect in that case,
 * but the failure is a connection timeout rather than a broken app — so the
 * fallback is never an error response.
 */
export async function getIceServers(
  keyId?: string,
  apiToken?: string,
): Promise<IceServer[]> {
  if (!keyId || !apiToken) {
    return STUN_ONLY_FALLBACK;
  }
  // Serve from cache if still fresh.
  if (cachedIceServers && Date.now() < cachedExpiry - TURN_REFRESH_MARGIN_MS) {
    return cachedIceServers;
  }
  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: TURN_CREDENTIAL_TTL_SECONDS }),
      },
    );
    if (!res.ok) {
      console.warn('[TURN] CF API returned', res.status, '— falling back to STUN-only');
      return cachedIceServers ?? STUN_ONLY_FALLBACK;
    }
    const data = (await res.json()) as CloudflareIceResponse;
    if (!data.iceServers || data.iceServers.length === 0) {
      return STUN_ONLY_FALLBACK;
    }
    // Parse expiry if provided; otherwise assume TTL minus a safety margin.
    const expiryMs = data.expiresOn
      ? Date.parse(data.expiresOn)
      : Date.now() + TURN_CREDENTIAL_TTL_SECONDS * 1000;
    cachedIceServers = data.iceServers;
    cachedExpiry = expiryMs;
    return data.iceServers;
  } catch (err) {
    console.error('[TURN] credential generation failed:', err);
    return cachedIceServers ?? STUN_ONLY_FALLBACK;
  }
}
