import { expect, test } from '@playwright/test';
import { findUndersizedTargets, MIN_TAP_TARGET_PX } from './helpers';

/**
 * Accessibility guards that hold on every screen size.
 *
 * `mobile-layout.spec.ts` covers what only breaks on a phone. This file
 * covers the two things that are wrong everywhere:
 *
 *  1. **Tap target size.** WCAG 2.2 SC 2.5.8 sets 24×24 CSS pixels as the
 *     minimum for a pointer target. The landing page's own links were 17px
 *     tall — legal-looking text that a thumb cannot hit — and nothing
 *     measured them, because the only tap-target check looked at the app
 *     screen. The landing page is checked here on every project, so the
 *     desktop header links are covered too, not just the mobile footer.
 *  2. **The skip link.** It is `sr-only` until it takes focus, which means
 *     it is invisible to a pointer *and* to the tap-target check above. The
 *     only thing that proves a keyboard user can reach the content is to
 *     press Tab and see it appear.
 */

const LANDING_URL = '/';
const APP_URL = '/app';

test.describe('accessibility', () => {
  test('every control on the landing page is large enough to hit', async ({ page }) => {
    await page.goto(LANDING_URL);
    await expect(page.locator('h1').first()).toBeVisible();

    const tooSmall = await findUndersizedTargets(page, MIN_TAP_TARGET_PX);

    expect(tooSmall, `targets under ${MIN_TAP_TARGET_PX}px:\n${tooSmall.join('\n')}`).toEqual([]);
  });

  test('the skip link appears on the landing page when it takes focus', async ({ page }) => {
    await page.goto(LANDING_URL);
    await expect(page.locator('h1').first()).toBeVisible();

    await page.keyboard.press('Tab');

    const skipLink = page.getByRole('link', { name: 'Skip to content' });
    await expect(skipLink).toBeFocused();

    // `sr-only` collapses it to a 1×1 clipped box; focus must expand it back
    // into something a person can actually see.
    const box = await skipLink.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(24);
    expect(box?.height ?? 0).toBeGreaterThan(24);

    // It must be on screen, not parked outside the viewport.
    expect(box?.x ?? 0).toBeGreaterThanOrEqual(0);
    expect(box?.y ?? 0).toBeGreaterThanOrEqual(0);
  });

  test('the skip link appears on the app screen when it takes focus', async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page.getByRole('textbox', { name: 'Text to share' })).toBeVisible();

    await page.keyboard.press('Tab');

    const skipLink = page.getByRole('link', { name: 'Skip to content' });
    await expect(skipLink).toBeFocused();

    const box = await skipLink.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(24);
    expect(box?.height ?? 0).toBeGreaterThan(24);
    expect(box?.x ?? 0).toBeGreaterThanOrEqual(0);
    expect(box?.y ?? 0).toBeGreaterThanOrEqual(0);
  });

  test('the skip link moves focus to the main content', async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page.getByRole('textbox', { name: 'Text to share' })).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();

    await page.keyboard.press('Enter');

    // The link points at #main-content, so the URL hash must follow it.
    await expect(page).toHaveURL(/#main-content$/);

    // `<main>` is not focusable, so the browser does not focus it directly —
    // it moves the *sequential focus navigation starting point* to it. The
    // proof that the skip worked is that the next Tab lands inside the main
    // content instead of continuing through the navigation above it.
    await page.keyboard.press('Tab');

    const landedInside = await page.evaluate(() => {
      const active = document.activeElement;
      return active ? Boolean(active.closest('#main-content')) : false;
    });
    expect(landedInside, 'Tab after the skip link must land inside #main-content').toBe(true);
  });
});
