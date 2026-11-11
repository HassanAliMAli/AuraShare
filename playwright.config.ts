import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the real user flows (text, file, bad code).
 *
 * The suite drives two browser contexts against the live stack: the Vite dev
 * server on :5173 and the Wrangler worker on :8787 (Durable Object signaling
 * relay). Vite proxies `/api` to the worker, so the browser only ever talks to
 * one origin.
 *
 * `channel: 'chrome'` reuses the system Google Chrome instead of downloading a
 * bundled Chromium — the same browser the local Playwright MCP server uses.
 */
export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.spec.ts',
  // P2P handshakes are timing sensitive; keep one worker so two peers never
  // compete for the same signaling room.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The bad-code path waits out the app's 30s connect timeout.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'npx wrangler dev --port 8787 --ip 127.0.0.1',
      url: 'http://127.0.0.1:8787/api/ice-servers',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
