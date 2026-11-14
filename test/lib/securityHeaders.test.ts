import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards on the Content-Security-Policy that `frontend/public/_headers`
 * applies to every response.
 *
 * The policy is set by hand, so it drifts silently: a directive that is too
 * tight does not break the build, it breaks the page in the browser. That is
 * exactly what happened to the app's own font — the display face is inlined
 * into the stylesheet as a `data:` URI, and `font-src 'self'` refused it, so
 * the live site quietly fell back to a different typeface.
 *
 * These guards keep the policy tight *and* working:
 *
 *  - the font is allowed, so the design actually shows up;
 *  - the Cloudflare analytics beacon the edge injects is allowed, so its
 *    data is not thrown away;
 *  - `script-src` never gets `'unsafe-inline'`, which is the tempting way to
 *    make an inline script work and the wrong way to do it.
 */

const HEADERS_PATH = path.resolve(
  import.meta.dirname,
  '../../frontend/public/_headers',
);

const headers = readFileSync(HEADERS_PATH, 'utf8');

/** The value of one directive of the policy. */
function directive(name: string): string[] {
  const line = headers
    .split('\n')
    .find((entry) => entry.includes('Content-Security-Policy:'));
  expect(line, 'the policy must be set in frontend/public/_headers').toBeTruthy();

  const found = line!
    .split('Content-Security-Policy:')[1]!
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));

  expect(found, `the policy must set ${name}`).toBeTruthy();
  return found!.split(/\s+/).slice(1);
}

describe('public/_headers — the content security policy', () => {
  it('allows the app own inlined font', () => {
    // The display face is a `data:` URI inside the stylesheet. Without this
    // the browser refuses it and the live site falls back to a font that is
    // not the design.
    expect(directive('font-src')).toContain('data:');
  });

  it('allows the analytics beacon the edge injects', () => {
    // Cloudflare injects this script into every HTML response. Cloudflare's
    // own guidance for the automatic setup is this exact source.
    expect(directive('script-src')).toContain(
      'https://static.cloudflareinsights.com/beacon.min.js',
    );
  });

  it('never allows inline scripts', () => {
    // `'unsafe-inline'` would let any injected script run. It is the wrong
    // way to fix a blocked script.
    expect(directive('script-src')).not.toContain("'unsafe-inline'");
  });

  it('reports the beacon to the same origin', () => {
    // The automatic setup posts to our own `/cdn-cgi/rum`, so `'self'`
    // covers it and no third-party origin has to be allowed.
    expect(directive('connect-src')).toContain("'self'");
  });

  it('keeps the policy on every response', () => {
    const applied = headers
      .split('\n')
      .some((line) => line.trim() === '/*' && headers.includes('Content-Security-Policy:'));
    expect(applied).toBe(true);
  });
});
