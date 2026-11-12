import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  expectPeerConnected,
  joinRoom,
  openApp,
  openReceiver,
  shareFile,
  shareText,
} from './helpers';

/**
 * Full user flows over the real stack: two browser contexts, a live Wrangler
 * Durable Object signaling relay, and a genuine WebRTC data channel.
 *
 * Every test in this file exercises one peer flow end to end.
 */

test.describe('AuraShare peer-to-peer transfer', () => {
  test('text payload reaches the receiver intact', async ({ browser }) => {
    const sender = await openApp(browser);
    const receiver = await openApp(browser);

    const payload = 'live e2e hello — 宇宙 ✨';
    const code = await shareText(sender, payload);

    await joinRoom(receiver, code);

    await expectPeerConnected(sender);
    await expect(receiver.getByText('Transfer complete')).toBeVisible();
    await expect(receiver.getByText(payload)).toBeVisible();
  });

  test('file payload is received and downloaded byte-identical', async ({ browser }) => {
    const sender = await openApp(browser);
    const receiver = await openApp(browser);

    // Resolve against the repo root so the spec does not depend on the cwd.
    const source = path.resolve(import.meta.dirname, '../../README.md');
    const expected = await readFile(source);

    const code = await shareFile(sender, source);

    await joinRoom(receiver, code);

    await expectPeerConnected(sender);
    await expect(receiver.getByText('1 file ready')).toBeVisible();
    await expect(receiver.getByText('README.md').first()).toBeVisible();

    await receiver.getByRole('checkbox', { name: 'Select README.md' }).check();

    // Register the download listener BEFORE the click. The transfer can
    // complete in a few milliseconds, and `waitForEvent` does not buffer
    // events — a download that lands between the click resolving and the
    // listener attaching is lost, and the test then waits out its whole
    // timeout for an event that already fired.
    const downloadEvent = receiver.waitForEvent('download');
    await receiver.getByRole('button', { name: /Download \(1\)/ }).click();

    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe('README.md');

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const received = Buffer.concat(chunks);

    expect(received.equals(expected)).toBe(true);
  });

  test('an unknown code ends in a recoverable error', async ({ browser }) => {
    const receiver = await openApp(browser);

    await joinRoom(receiver, 'ZZZZZZ');

    // The app waits out its 30s connect timeout before surfacing the failure.
    await expect(receiver.getByText('Connection failed')).toBeVisible({ timeout: 45_000 });
    await expect(receiver.getByText('Try again')).toBeVisible();

    // "Try again" must bring the peer back to a usable idle state.
    await receiver.getByRole('button', { name: 'Try again' }).click();
    await expect(receiver.getByRole('textbox', { name: 'Text to share' })).toBeVisible();

    // ...and the peer can start a fresh receiver session from there.
    await receiver.getByRole('button', { name: 'Receive' }).click();
    await expect(receiver.getByRole('textbox', { name: /six-character code/i })).toBeVisible();
  });

  test('a malformed code never opens a link', async ({ browser }) => {
    const receiver = await openApp(browser);

    await openReceiver(receiver);
    await receiver.getByRole('textbox', { name: /six-character code/i }).fill('AB!12Z');

    // The button must stay disabled and the reason must be on screen — a
    // dead button with no explanation is the bug this guards against.
    await expect(receiver.getByRole('button', { name: 'Establish connection' })).toBeDisabled();
    await expect(receiver.getByRole('alert')).toContainText('no I, L, O or U');

    // A well-formed code still opens the link.
    await receiver.getByRole('textbox', { name: /six-character code/i }).fill('AB12CD');
    await expect(receiver.getByRole('button', { name: 'Establish connection' })).toBeEnabled();
    await expect(receiver.getByRole('alert')).toHaveCount(0);
  });
});
