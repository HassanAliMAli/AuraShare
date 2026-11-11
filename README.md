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
`src/lib/router.ts` (no react-router). Deep links already work because the
Worker serves the SPA with `not_found_handling = "single-page-application"`.

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

### End-to-end tests

`test/e2e/` drives the real stack with Playwright: two browser contexts, a live
Wrangler Durable Object signaling relay, and a genuine WebRTC data channel.
Covered flows are text share, file share (download verified byte-identical),
and the unknown-code error path.

The suite starts both servers itself (Vite on `:5173`, Wrangler on `:8787`) via
`webServer` in `playwright.config.ts`, so `npm run test:e2e` is a one-liner.
It drives the system Google Chrome (`channel: 'chrome'`) instead of downloading
a bundled Chromium.
