import { defineConfig, devices } from '@playwright/test';

/**
 * Browser environment for the WebKit projects.
 *
 * A snap-confined editor (VS Code installed as a snap) exports
 * `GIO_MODULE_DIR` pointing at the snap's GIO proxy modules. Those modules
 * carry an RPATH into `/snap/core20/current/lib/x86_64-linux-gnu`, so GIO
 * loading them pulls core20's glibc into the browser process. WebKit's network
 * process then loads core20's `libpthread.so.0` against the system glibc and
 * dies with:
 *
 *   WPENetworkProcess: symbol lookup error:
 *   /snap/core20/current/lib/x86_64-linux-gnu/libpthread.so.0:
 *   undefined symbol: __libc_pthread_init, version GLIBC_PRIVATE
 *
 * The symptom is `page.goto: WebKit encountered an internal error` on every
 * navigation. Chromium is unaffected — it does not use the GIO proxy — so the
 * failure reads as "WebKit is broken" rather than "the environment is leaking".
 *
 * Clearing the variable is a no-op outside a snap. It is applied per project
 * rather than to `process.env`, because the test runner's own worker processes
 * do not inherit a mutation made while the config file is being loaded.
 */
const webkitEnv = { ...process.env };
delete webkitEnv.GIO_MODULE_DIR;

/**
 * End-to-end configuration for the real user flows (text, file, bad code).
 *
 * The suite drives two browser contexts against the live stack: the Vite dev
 * server on :5173 and the Wrangler worker on :8787 (Durable Object signaling
 * relay). Vite proxies `/api` to the worker, so the browser only ever talks to
 * one origin.
 *
 * ## The browser matrix
 *
 * The redesign introduced three things that engines disagree about:
 * `Archivo`'s `font-stretch` width axis (a variable-font feature), `dvh`
 * units, and a flex shell that fills the viewport. Chrome alone does not
 * exercise any of them, and AuraShare is a file-sharing tool — people use it
 * from phones. So the matrix covers:
 *
 * - `chromium`       — desktop, the system Google Chrome (`channel: 'chrome'`),
 *                      the browser the local Playwright MCP server uses.
 * - `webkit`         — desktop Safari engine, where `font-stretch` and `dvh`
 *                      are most likely to differ from Blink.
 * - `mobile-chromium`— a Pixel-sized viewport with touch, on Blink.
 * - `mobile-webkit`  — an iPhone-sized viewport with touch, on WebKit: the
 *                      closest thing to the real iOS Safari this suite can get.
 *
 * The two mobile projects are the highest-value additions: a 390px viewport is
 * where a desktop-first layout breaks, and iOS Safari is where `dvh`,
 * `font-stretch` and tap handling actually diverge.
 *
 * `channel: 'chrome'` is set per project rather than globally — it applies to
 * the Chromium projects only. WebKit is Playwright's own build, so it needs
 * `npx playwright install webkit` (CI does this; see `.github/workflows/ci.yml`).
 *
 * The device options only reach the page through the `contextOptions` fixture:
 * `browser.newContext()` does not inherit a project's viewport, touch support
 * or user agent on its own, so `test/e2e/helpers.ts` passes them explicitly.
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
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], launchOptions: { env: webkitEnv } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], channel: 'chrome' },
    },
    {
      name: 'mobile-webkit',
      use: { ...devices['iPhone 13'], launchOptions: { env: webkitEnv } },
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
    {
      // A STUN server on the same host, so the two peers of a session can
      // reach each other over the machine's own private address. Without it
      // WebKit has no usable ICE candidate on a runner: it obfuscates every
      // host candidate with mDNS, and the reflexive candidate points at the
      // public address, which a cloud NAT will not hairpin. See
      // `test/e2e/stun-server.ts`.
      command: 'node --experimental-strip-types test/e2e/stun-server.ts',
      port: 13478,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
