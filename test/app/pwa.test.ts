import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The shipped web-app metadata.
 *
 * These are static files, and static files do not fail loudly: a wrong URL
 * in `robots.txt` or a stale `og:url` is a 404 a crawler never reports back,
 * and a manifest that starts the installed app on the landing page is a
 * wrong first impression rather than an error.
 *
 * The check is **consistency**, not a hard-coded domain: every absolute URL
 * the app ships has to point at the same origin, and every route it names
 * has to be a route the app actually has. That is what catches "someone
 * changed one file and not the others" — which is exactly how
 * `robots.txt` ended up pointing at a hostname the project never had.
 */

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'frontend', 'public');
const INDEX_HTML = path.join(ROOT, 'frontend', 'index.html');

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

/** The origin of every absolute https URL in a body of text. */
function originsIn(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s"'<>)]+/g) ?? [];
  return [...new Set(matches.map((url) => new URL(url).origin))];
}

/** The `<loc>` entries of a sitemap — the namespace declaration is not a page. */
function sitemapLocations(sitemap: string): string[] {
  return [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1])
    .filter((location): location is string => location !== undefined);
}

describe('app/pwa — the shipped URLs agree', () => {
  it('points robots.txt, the sitemap and the meta tags at one origin', () => {
    const robots = read(path.join(PUBLIC_DIR, 'robots.txt'));
    const sitemap = read(path.join(PUBLIC_DIR, 'sitemap.xml'));
    const index = read(INDEX_HTML);

    const origins = [
      ...originsIn(robots),
      ...sitemapLocations(sitemap).map((location) => new URL(location).origin),
      ...originsIn(index),
    ];

    expect(origins.length).toBeGreaterThan(0);
    expect([...new Set(origins)]).toHaveLength(1);
  });

  it('lists a sitemap in robots.txt, and the file is really there', () => {
    const robots = read(path.join(PUBLIC_DIR, 'robots.txt'));
    const sitemapUrl = robots.match(/^Sitemap:\s*(\S+)$/m)?.[1];

    expect(sitemapUrl, 'robots.txt must name a sitemap').toBeDefined();

    const relative = new URL(sitemapUrl as string).pathname;
    expect(existsSync(path.join(PUBLIC_DIR, relative.replace(/^\//, '')))).toBe(true);
  });

  it('lists only routes the app actually has', () => {
    const sitemap = read(path.join(PUBLIC_DIR, 'sitemap.xml'));
    const locations = sitemapLocations(sitemap);

    expect(locations.length).toBeGreaterThan(0);

    const routes = locations.map((location) => new URL(location).pathname);
    for (const route of routes) {
      // The landing page and the app screen. Anything else is a 404.
      expect(['/', '/app']).toContain(route);
    }
  });

  it('starts the installed app at the app route', () => {
    const manifest = JSON.parse(read(path.join(PUBLIC_DIR, 'manifest.webmanifest')));

    expect(manifest.start_url).toBe('/app');
  });

  it('claims no maskable icon it does not have', () => {
    const manifest = JSON.parse(read(path.join(PUBLIC_DIR, 'manifest.webmanifest')));

    // The only icon is an SVG, which is not drawn with a maskable safe
    // zone — claiming it is one gets it cropped by the launcher.
    for (const icon of manifest.icons) {
      expect(icon.purpose).toBe('any');
    }
  });

  it('gives the social card an absolute image URL', () => {
    const index = read(INDEX_HTML);

    const ogImage = index.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    expect(ogImage, 'og:image must be set').toBeDefined();
    // Scrapers ignore a relative URL, so the card would have no image.
    expect(ogImage).toMatch(/^https?:\/\//);
  });
});
