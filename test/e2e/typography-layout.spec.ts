import { expect, test } from '@playwright/test';

/**
 * The visual contracts the redesign is built on.
 *
 * The Playwright matrix grew a WebKit project and two mobile projects
 * because three things in this design are exactly where engines disagree:
 *
 *  1. **`font-stretch`.** Archivo is loaded as a variable font and the
 *     headlines run on its width axis (`[font-stretch:112%]`). Blink and
 *     WebKit do not agree on how a width axis is applied, and a browser that
 *     silently drops it does not fail — the headline just renders narrower
 *     than the design intended.
 *  2. **`dvh` units.** The app shell and the landing page are sized in
 *     `dvh`, which is the viewport height minus the browser chrome. It is
 *     the unit that keeps the footer pinned on a phone.
 *  3. **The flex shell.** The app screen is a `min-h-dvh flex flex-col`
 *     column, with the footer absolutely positioned at the bottom. If the
 *     shell stops filling the viewport, the footer floats in the middle of
 *     the screen.
 *
 * None of them had a test. This file asserts all three, on every project —
 * which is the point of having WebKit in the matrix at all.
 */

const APP_URL = '/app';
const LANDING_URL = '/';

test.describe('typography and layout contracts', () => {
  test('the display face runs on the width axis', async ({ page }) => {
    await page.goto(LANDING_URL);
    await expect(page.locator('h1').first()).toBeVisible();
    // The webfont has to be in before the axis can be measured.
    await page.evaluate(() => document.fonts.ready);

    const heading = page.locator('h1').first();

    const stretch = await heading.evaluate((el) => window.getComputedStyle(el).fontStretch);
    expect(stretch, 'the headline must keep its 112% width axis').toBe('112%');

    const family = await heading.evaluate((el) => window.getComputedStyle(el).fontFamily);
    expect(family).toContain('Archivo');

    // `font-stretch` only does anything if the variable font is actually
    // loaded — otherwise the browser synthesises the width from a static
    // fallback and the layout quietly changes.
    const loaded = await page.evaluate(() =>
      document.fonts.check("112% 'Archivo Variable'"),
    );
    expect(loaded, 'Archivo Variable must be loaded, not substituted').toBe(true);
  });

  test('one dvh is one percent of the viewport height', async ({ page }) => {
    await page.goto(LANDING_URL);

    const ratio = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.cssText =
        'position:fixed;top:0;left:0;width:1px;height:1dvh;visibility:hidden;pointer-events:none';
      document.body.appendChild(probe);
      const height = probe.getBoundingClientRect().height;
      probe.remove();
      return { dvh: height, viewport: window.innerHeight };
    });

    expect(ratio.dvh).toBeGreaterThan(0);
    expect(ratio.dvh).toBeCloseTo(ratio.viewport / 100, 1);
  });

  test('the app shell fills the viewport', async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page.getByRole('textbox', { name: 'Text to share' })).toBeVisible();

    const shell = await page.evaluate(() => {
      const root = document.getElementById('root');
      const element = root?.firstElementChild;
      if (!element) {
        return { found: false, height: 0, display: '', viewport: window.innerHeight };
      }
      const rect = element.getBoundingClientRect();
      return {
        found: true,
        height: Math.round(rect.height),
        display: window.getComputedStyle(element).display,
        viewport: window.innerHeight,
      };
    });

    expect(shell.found, 'the app must render a shell element').toBe(true);
    expect(shell.display).toBe('flex');
    // `min-h-dvh` on a column flex shell: the screen is exactly one viewport
    // tall, so the footer can sit on the bottom edge.
    expect(shell.height).toBe(shell.viewport);
  });

  test('the footer is pinned to the bottom of the viewport', async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page.getByRole('textbox', { name: 'Text to share' })).toBeVisible();

    const footer = await page.evaluate(() => {
      const element = document.querySelector('footer');
      if (!element) {
        return { found: false, bottom: 0, viewport: window.innerHeight };
      }
      const rect = element.getBoundingClientRect();
      return {
        found: true,
        bottom: Math.round(rect.bottom),
        viewport: window.innerHeight,
      };
    });

    expect(footer.found, 'the app screen must have a footer').toBe(true);
    // Pinned to the bottom, with room for the safe-area inset and the
    // footer's own breathing space. Anything much further up means the
    // shell stopped filling the viewport.
    expect(footer.viewport - footer.bottom).toBeGreaterThanOrEqual(0);
    expect(footer.viewport - footer.bottom).toBeLessThanOrEqual(64);
  });
});
