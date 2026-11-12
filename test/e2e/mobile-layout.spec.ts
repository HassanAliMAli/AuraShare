import { expect, test } from '@playwright/test';
import { findUndersizedTargets, MIN_TAP_TARGET_PX } from './helpers';

/**
 * Mobile-specific layout guards.
 *
 * These assertions only mean anything on a phone-sized viewport, so the suite
 * skips them on the desktop projects and runs them on `mobile-chromium` and
 * `mobile-webkit`. They cover the three things a desktop-only matrix never
 * checks and that a file-sharing app gets wrong most often:
 *
 *  1. **Horizontal overflow.** `body` sets `overflow-x: hidden`, so a too-wide
 *     element does not produce a scrollbar — it silently clips content off
 *     screen. The only reliable check is to compare every element's box against
 *     the viewport.
 *  2. **Input font size.** iOS Safari zooms the page when a focused input is
 *     under 16px, and the user has to zoom back out to carry on. 16px is the
 *     threshold, not a preference.
 *  3. **Tap target size.** WCAG 2.2 SC 2.5.8 sets 24×24 CSS pixels as the
 *     minimum for a pointer target; Apple's HIG asks for 44pt.
 *
 * The file input is deliberately excluded from the tap-target check: it is
 * `display: none` and is driven by the dropzone, which is the real target.
 * The skip link is excluded for a different reason: it is `sr-only` until
 * focused, so it renders as a 1×1 clipped box that expands on keyboard
 * focus. It is a keyboard affordance, not a pointer target.
 */

const APP_URL = '/app';
const LANDING_URL = '/';

/** iOS Safari zooms on focus below this. */
const MIN_INPUT_FONT_PX = 16;

test.describe('mobile layout', () => {
  // Desktop projects have nothing to say about phone-sized layouts.
  test.skip(({ isMobile }) => !isMobile, 'mobile-viewport assertions only');

  test('the app never overflows the viewport horizontally', async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page.getByRole('textbox', { name: 'Text to share' })).toBeVisible();

    const overflowing = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const offenders: string[] = [];

      document.querySelectorAll('body *').forEach((el) => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        // A one-pixel rounding difference is not an overflow.
        if (rect.right > viewportWidth + 1 || rect.left < -1) {
          const id = el.id ? `#${el.id}` : '';
          const cls =
            typeof el.className === 'string' && el.className
              ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
              : '';
          offenders.push(
            `${el.tagName.toLowerCase()}${id}${cls} [${Math.round(rect.left)} → ${Math.round(rect.right)}]`,
          );
        }
      });

      return offenders;
    });

    expect(overflowing, `elements wider than the viewport:\n${overflowing.join('\n')}`).toEqual([]);
  });

  test('the landing page never overflows the viewport horizontally', async ({ page }) => {
    await page.goto(LANDING_URL);
    await expect(page.locator('h1').first()).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });

  test('inputs are large enough that iOS Safari will not zoom on focus', async ({
    page,
  }) => {
    await page.goto(APP_URL);
    await expect(page.getByRole('textbox', { name: 'Text to share' })).toBeVisible();

    const tooSmall = await page.evaluate((minimum) => {
      const offenders: string[] = [];
      document.querySelectorAll('input, textarea, select').forEach((el) => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        const size = parseFloat(style.fontSize);
        if (size < minimum) {
          offenders.push(`${el.tagName.toLowerCase()} = ${style.fontSize}`);
        }
      });
      return offenders;
    }, MIN_INPUT_FONT_PX);

    expect(
      tooSmall,
      `inputs under ${MIN_INPUT_FONT_PX}px:\n${tooSmall.join('\n')}`,
    ).toEqual([]);
  });

  test('every control is large enough to hit with a thumb', async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page.getByRole('textbox', { name: 'Text to share' })).toBeVisible();

    const tooSmall = await findUndersizedTargets(page, MIN_TAP_TARGET_PX);

    expect(tooSmall, `targets under ${MIN_TAP_TARGET_PX}px:\n${tooSmall.join('\n')}`).toEqual([]);
  });

  test('the receive form fits a phone', async ({ page }) => {
    await page.goto(APP_URL);
    await page.getByRole('button', { name: 'Receive' }).click();

    const codeInput = page.getByRole('textbox', { name: /six-character code/i });
    await expect(codeInput).toBeVisible();

    // The code field is monospace and letter-spaced; at 390px it must not
    // push the form wider than the screen.
    const inputWidth = (await codeInput.boundingBox())?.width ?? 0;
    const viewportWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(inputWidth).toBeLessThanOrEqual(viewportWidth);
  });

  test('the transmission code ticket fits a phone', async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page.getByRole('textbox', { name: 'Text to share' })).toBeVisible();

    await page.getByRole('textbox', { name: 'Text to share' }).fill('a ticket that must fit');
    await page.getByRole('button', { name: 'Send text' }).click();
    await expect(page.getByText('Transmission Code')).toBeVisible();

    // The ticket is the six-character code in 35px monospace with 0.18em of
    // letter spacing — the widest thing the sender screen shows. If it
    // overflows, the digits run off the edge of the phone.
    const ticket = page.locator('main').getByText(/^[0-9A-HJKMNP-TV-Z]{6}$/).first();
    const box = await ticket.boundingBox();
    expect(box).not.toBeNull();

    const viewportWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(box?.width ?? 0).toBeLessThanOrEqual(viewportWidth);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewportWidth);
  });
});
