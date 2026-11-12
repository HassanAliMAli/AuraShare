import { expect, test } from '@playwright/test';

/**
 * The share input surface — the file picker in particular.
 *
 * This is a regression guard for a defect the WebKit project surfaced: the
 * dropzone's `<input type="file">` was being destroyed and recreated a
 * fraction of a second after the files panel appeared.
 *
 * Framer Motion's `AnimatePresence mode="wait"` re-keys its child once the
 * outgoing panel's exit animation finishes, which unmounts the old subtree and
 * mounts a fresh one. With the panel keyed on the share mode, that meant the
 * file input was replaced roughly 200ms after the user opened the files tab.
 *
 * The replacement is invisible to a person — by then the OS file picker is
 * open and the selection lands on the new node. It is not invisible to a
 * machine: WebKit applies the file list to the input through the browser
 * process, so a node that is replaced before that round-trip completes never
 * fires its `change` event, and the chosen file is silently dropped.
 *
 * The fix was to stop keying the panel on the share mode, so the input is
 * created once and stays put. The first test below asserts that directly: it
 * was verified to fail on both Chromium and WebKit when the key is put back.
 */

/** Longer than the 200ms exit animation, with room for a slow frame. */
const TRANSITION_WINDOW_MS = 800;

test.describe('AuraShare share input', () => {
  test('the file input is created once and never replaced', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByRole('textbox', { name: 'Text to share' })).toBeVisible();

    await page.getByRole('tab', { name: 'files', exact: true }).click();
    await expect(page.getByRole('button', { name: /drop files to share/i })).toBeVisible();

    // Sample the identity of the file input across the whole transition
    // window. A replaced input is a different DOM node, so it gets a
    // different id — two ids means the input was remounted.
    const nodeIds = await page.evaluate(async (windowMs) => {
      const ids: string[] = [];
      let counter = 0;
      const started = performance.now();

      while (performance.now() - started < windowMs) {
        const input = document.querySelector('input[type="file"]') as
          | (HTMLInputElement & { __id?: string })
          | null;
        if (!input) {
          ids.push('missing');
        } else {
          if (!input.__id) {
            counter += 1;
            input.__id = `input-${counter}`;
          }
          ids.push(input.__id);
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      return ids;
    }, TRANSITION_WINDOW_MS);

    expect(
      new Set(nodeIds).size,
      `the file input was replaced during the mode switch: ${[...new Set(nodeIds)].join(', ')}`,
    ).toBe(1);
  });

  test('a file chosen right after the mode switch still reaches the app', async ({
    page,
  }) => {
    await page.goto('/app');
    await expect(page.getByRole('textbox', { name: 'Text to share' })).toBeVisible();

    // No settling wait: the selection must survive the mode switch, however
    // fast it lands.
    //
    // Note that this test is a behavioural check, not the deterministic
    // guard — it still passes when the remount bug is reintroduced, because
    // Playwright applies the file list and fires `change` quickly enough to
    // beat the 200ms remount on both engines. The test above is the one that
    // fails, every time, on both engines.
    await page.getByRole('tab', { name: 'files', exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'note.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('aura'),
    });

    await expect(page.getByText('Transmission Code')).toBeVisible();
  });
});
