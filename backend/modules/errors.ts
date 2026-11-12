/**
 * Response helpers — the one place that decides what an AuraShare response
 * looks like.
 *
 * Every response the Worker returns, successful or not, is built here. That
 * is what keeps the error shape consistent: a caller never has to guess
 * whether a failure body is JSON or text, and every response carries the
 * same security headers.
 */

/** Headers every response carries, successful or not. */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  // Signalling responses are per-session state and must never be cached.
  'Cache-Control': 'no-store',
};

/** The machine-readable codes a client can branch on. */
export type ApiErrorCode = 'not_found' | 'upgrade_required' | 'room_full';

/** A JSON response. */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...SECURITY_HEADERS,
    },
  });
}

/**
 * An error response.
 *
 * The body is always the same shape — `{ error: { code, message } }` — so a
 * client can read it without checking which route it came from.
 */
export function apiError(code: ApiErrorCode, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}

/** The preflight answer: an empty 200 with the standard headers. */
export function preflight(): Response {
  return new Response(null, { status: 200, headers: SECURITY_HEADERS });
}
