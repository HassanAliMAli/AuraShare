import { expect, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';

/**
 * Shared helpers for the end-to-end suite.
 *
 * A real AuraShare session involves two peers on two devices, so every helper
 * here works with a pair of pages that live in separate browser contexts.
 */

export const APP_URL = '/app';

/**
 * A transmission code is 6 Crockford base32 characters (no I, L, O, U).
 * The class is anchored so it only matches the code element itself, never the
 * surrounding chrome ("TRANSMISSION CODE", "END SESSION", ...).
 */
const CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{6}$/;

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
