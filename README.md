# AuraShare

Peer-to-peer file sharing with an ambient, organic UI. No servers, no limits, end-to-end encrypted. Files flow directly between devices via WebRTC — the cloud only relays the initial handshake.

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 |
| Language | TypeScript 6 (strict mode) |
| Build | Vite 8 |
| Styling | Tailwind CSS 4 (`@theme` tokens) |
| Animation | Motion 12 (Framer Motion) |
| P2P | Raw WebRTC (DataChannels) |
| Signaling | Cloudflare Durable Objects (Hibernatable WebSockets) |
| Icons | lucide-react |
| Fonts | @fontsource (self-hosted, no CDN) |
| Tests | Vitest + React Testing Library (unit) · Playwright (E2E) |

## Architecture

```
/        → marketing landing page (hero, how it works, privacy, FAQ, CTA)
/app     → the AuraShare P2P transfer app (lazy-loaded — WebRTC stays out of
           the landing-page bundle)
```

Routing uses a tiny zero-dependency pushState/popstate router in
`frontend/src/lib/router.ts` (no react-router). Deep links already work because the
Worker serves the SPA with `not_found_handling = "single-page-application"`.

### Repository layout

```
frontend/   React app — components, hooks, stores, lib, types, styles, Vite config
backend/    Cloudflare Worker — Durable Object relay, TURN credentials
wrangler.toml  deployment descriptor (Worker entry + SPA assets)
test/       Every test, mirrored by block (lib, p2p, features, landing, e2e, …)
docs/       API contract, test report, audits, redesign plan
```

```
Browser A (Sender)                         Browser B (Receiver)
     │                                          │
     │  POST /api/room → mint 6-char code        │
     │  WS  /api/room/:id/ws                    │
     │──────────────► RoomDO ◄──────────────────│
     │   SDP offer/answer + trickle ICE relay    │
     │                                          │
     │◄═══════════ WebRTC DataChannel ══════════►│
     │         (direct P2P, E2E encrypted)       │
```

One Durable Object per room code acts as a dumb WebSocket relay for SDP/ICE exchange. File data never touches the server — it flows directly between peers via a WebRTC DataChannel, encrypted with DTLS.

## Development

Requires **Node.js ≥ 22.12.0** — Vite 8 and Wrangler 4 both refuse to run on
anything older.

```bash
# Terminal 1: Cloudflare Worker (Durable Objects + static assets)
npm run dev:worker

# Terminal 2: Vite dev server (HMR — proxies /api to the worker)
npm run dev
```

## Commands

```bash
npm run dev              # Vite dev server
npm run dev:worker       # Wrangler local dev (DO + assets)
npm run build            # TypeScript check + Vite production build
npm run deploy           # Build + wrangler deploy to Cloudflare
npm run lint             # ESLint
npm run typecheck        # tsc --build (no emit)
npm run test             # Vitest unit tests
npm run test:coverage    # Vitest with coverage report
npm run test:e2e         # Playwright end-to-end tests (test/e2e)
npm run preview          # Preview production build locally
```

## Deploy

Authenticate Wrangler once with `npx wrangler login`, then deploy the Worker and the built assets:

```bash
npm run deploy
```

TURN credentials are optional and configured with `wrangler secret` — see the comments in `wrangler.toml`.

## Quality

Before committing, run the full check suite:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
```

CI runs the same gates and additionally enforces the coverage thresholds
(`npm run test:coverage`, 80% over all of `frontend/src/`) and `npm audit
--audit-level=high`. Both the coverage report and the Playwright report are
published as workflow artifacts.

### End-to-end tests

`test/e2e/` drives the real stack with Playwright: two browser contexts, a live
Wrangler Durable Object signaling relay, and a genuine WebRTC data channel.
Covered flows are text share, file share (download verified byte-identical),
the unknown-code error path, and the malformed-code path.

The suite starts both servers itself (Vite on `:5173`, Wrangler on `:8787`) via
`webServer` in `playwright.config.ts`, so `npm run test:e2e` is a one-liner.

#### Browser matrix

The suite runs against four configurations, because the design uses three
things that engines disagree about — a variable-font width axis (`font-stretch`),
`dvh` units, and a viewport-filling flex shell — and AuraShare is used from
phones:

| Project | Engine | Viewport |
|---|---|---|
| `chromium` | system Google Chrome | desktop |
| `webkit` | Playwright's WebKit build | desktop |
| `mobile-chromium` | system Google Chrome | Pixel 7 (touch) |
| `mobile-webkit` | Playwright's WebKit build | iPhone 13 (touch) |

Run one with `--project=mobile-webkit`, or all of them with the default
`npm run test:e2e`.

The Chromium projects use the system Chrome (`channel: 'chrome'`), which is
already installed. **WebKit is Playwright's own build and has to be downloaded
once:**

```bash
npx playwright install --with-deps webkit
```

CI does this automatically. On Linux it also needs the shared libraries
WebKit links against (`libevent`, `libavif`, `libmanette`, `libyuv`, `libgav1`);
`--with-deps` installs them.

> **Running inside a snap-confined editor?** VS Code installed as a snap
> exports `GIO_MODULE_DIR`, and the snap's GIO proxy modules carry an RPATH into
> core20 — which breaks WebKit's network process with
> `page.goto: WebKit encountered an internal error` on every navigation.
> `playwright.config.ts` clears the variable for the WebKit projects, so the
> suite works either way.

#### Mobile layout checks

`test/e2e/mobile-layout.spec.ts` runs only on the mobile projects (it skips
itself on desktop) and asserts the three things a desktop-only matrix never
checks: nothing overflows the viewport horizontally, no input is under 16px
(iOS Safari zooms the page on focus below that), and every control meets the
24×24px minimum of WCAG 2.2 SC 2.5.8.

