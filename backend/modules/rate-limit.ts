/**
 * Rate limiting for the room routes.
 *
 * The room API is the expensive one: a request to it can allocate a Durable
 * Object, and the free plan's daily request budget is finite. Crossing that
 * budget does not cost money — it makes the Worker fail with errors until
 * the budget resets at 00:00 UTC.
 *
 * The limit is a Cloudflare rate limiting binding, the same machinery that
 * serves the WAF rate limiting rules: the count is per Cloudflare location
 * and approximate, but it costs no storage of our own and it is checked
 * before the room is touched.
 */

/** The binding the Worker reads. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * Check one request against the limit.
 *
 * Returns true when the request may proceed. The key is the client IP:
 * there is no user to key on, and the point of the limit is to stop one
 * client from spending the whole budget. Requests without an IP — a local
 * dev server, a test — are not counted: there is nothing to count them
 * against, and a shared "unknown" bucket would count every caller
 * together.
 */
export async function allowRequest(
  request: Request,
  limiter?: RateLimiter,
): Promise<boolean> {
  if (!limiter) return true;

  const ip = request.headers.get('cf-connecting-ip');
  if (!ip) return true;

  try {
    const { success } = await limiter.limit({ key: ip });
    return success;
  } catch (err) {
    // A limiter that cannot answer must not take the app down with it: the
    // request goes through. The budget it protects is finite, but a broken
    // limiter would make the app unusable right now.
    console.error('[RateLimit] the limiter failed:', err);
    return true;
  }
}
