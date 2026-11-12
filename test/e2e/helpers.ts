import { expect, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { localIceServers } from './stun-server';

/**
 * Shared helpers for the end-to-end suite.
 *
 * A real AuraShare session involves two peers on two devices, so every helper
 * here works with a pair of pages that live in separate browser contexts.
 */

export const APP_URL = '/app';

/**
 * Point the app at the suite's own STUN server.
 *
 * The Worker hands out the public STUN servers, which is right for real
 * devices but wrong for a test: two peers on one machine cannot reach each
 * other through a public address unless the NAT hairpins, and WebKit
 * obfuscates its host candidates with mDNS, which a container does not
 * resolve reliably. The local server answers with the machine's own private
 * address, so the two peers connect directly and the suite stops depending
 * on the runner's network.
 *
 * The endpoint's own behaviour is covered by `test/worker/worker.test.ts`;
 * what the suite is testing here is the peer-to-peer flow, not the ICE list.
 */
async function serveLocalIceServers(page: Page): Promise<void> {
  await page.route('**/api/ice-servers', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(localIceServers()),
    });
  });
}

/** WCAG 2.2 SC 2.5.8 — Target Size (Minimum). */
export const MIN_TAP_TARGET_PX = 24;

/**
 * A transmission code is 6 Crockford base32 characters (no I, L, O, U).
 * The class is anchored so it only matches the code element itself, never the
 * surrounding chrome ("TRANSMISSION CODE", "END SESSION", ...).
 */
const CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{6}$/;

/**
 * Measure every pointer target on the current page and return the ones that
 * are smaller than `minimum`.
 *
 * Two kinds of element are deliberately left out:
 *
 *  - the file input, which is `display: none` and is driven by the dropzone
 *    that the user actually taps;
 *  - a control that is collapsed *and* clipped away — the skip link's
 *    `sr-only` box, which is a keyboard affordance that expands on focus and
 *    is not a pointer target. It is detected structurally (collapsed and
 *    clipped) rather than by class name, so the pattern still holds if the
 *    markup changes.
 */
export async function findUndersizedTargets(
  page: Page,
  minimum: number = MIN_TAP_TARGET_PX,
): Promise<string[]> {
  return page.evaluate((min) => {
    const offenders: string[] = [];
    const selectors = 'button, a[href], [role="tab"], [role="button"]';

    document.querySelectorAll(selectors).forEach((el) => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      if (el instanceof HTMLInputElement && el.type === 'file') return;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const clippedAway = style.clipPath.includes('inset(50%');
      if (clippedAway && rect.width <= 1 && rect.height <= 1) return;

      if (rect.width < min || rect.height < min) {
        const name =
          (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24) ||
          el.tagName.toLowerCase();
        offenders.push(`"${name}" is ${Math.round(rect.width)}×${Math.round(rect.height)}px`);
      }
    });

    return offenders;
  }, minimum);
}

/**
 * Open the app on a fresh device (its own browser context).
 *
 * `contextOptions` must be the project's resolved context options — they carry
 * the viewport, touch support and user agent. `browser.newContext()` does not
 * inherit them on its own, so without this the "mobile" projects would quietly
 * run at desktop size and the mobile assertions would prove nothing.
 */
export async function openApp(
  browser: Browser,
  contextOptions: BrowserContextOptions,
): Promise<Page> {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await serveLocalIceServers(page);
  await page.goto(APP_URL);
  await expect(page.getByRole('textbox', { name: 'Text to share' })).toBeVisible();
  return page;
}

/** Share a text payload and return the transmission code shown to the sender. */
export async function shareText(page: Page, text: string): Promise<string> {
  await page.getByRole('textbox', { name: 'Text to share' }).fill(text);
  await page.getByRole('button', { name: 'Send text' }).click();
  await expect(page.getByText('Transmission Code')).toBeVisible();
  return readCode(page);
}

/**
 * Share a file and return the transmission code shown to the sender.
 *
 * Unlike text mode there is no separate submit button: picking a valid file
 * starts the share immediately.
 */
export async function shareFile(page: Page, filePath: string): Promise<string> {
  await page.getByRole('tab', { name: 'files', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await expect(page.getByText('Transmission Code')).toBeVisible();
  return readCode(page);
}

/** Read the 6-character transmission code from the sender screen. */
export async function readCode(page: Page): Promise<string> {
  const code = await page
    .locator('main')
    .getByText(CODE_PATTERN)
    .first()
    .innerText();
  expect(code, 'sender should display a 6-character transmission code').toMatch(CODE_PATTERN);
  return code.trim();
}

/** Switch a peer into receiver mode. */
export async function openReceiver(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Receive' }).click();
  await expect(page.getByRole('textbox', { name: /six-character code/i })).toBeVisible();
}

/** Join a room with a transmission code. */
export async function joinRoom(page: Page, code: string): Promise<void> {
  await openReceiver(page);
  await page.getByRole('textbox', { name: /six-character code/i }).fill(code);
  await page.getByRole('button', { name: 'Establish connection' }).click();
}

/** Wait until the sender reports that the receiver is connected. */
export async function expectPeerConnected(sender: Page): Promise<void> {
  await expect(sender.getByText('Receiver Connected')).toBeVisible();
}
