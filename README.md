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
docs/       API contract, audits, redesign plan
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

Requires **Node.js ^22.22.2, ^24.15.0, or ≥26.0.0**. These ranges cover the
frontend, Worker tooling, and production build.

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
npm run preview          # Preview production build locally
```

`docs/PROCESS_NOTES.md` records the things that cost time on this project.

## Deploy

**Live:** <https://aurashare.hassanali.site>

There is no deploy step: **Cloudflare Workers Builds deploys the Worker on
every push to `main`**, and the `Workers Builds: aurashare` check on the
commit is the deploy. Push a branch, open a pull request, let CI run, merge —
the deployment follows the merge.

To deploy locally instead:

```bash
npx wrangler login     # once; the token expires and has to be renewed
npm run deploy         # build + wrangler deploy
```

TURN credentials are set on the Worker (`TURN_KEY_ID` and
`TURN_KEY_API_TOKEN`), so a peer behind a symmetric NAT can connect too —
see the comments in `wrangler.toml` and the
[deployment runbook](docs/DEPLOYMENT.md), which also covers how to check a
deployment, what the SPA deep link does to a `curl`, how to rotate the
TURN key, how the room routes are rate limited, and what a flood would
cost on the free plan.

## Quality

Before committing, run the checks CI runs:

```bash
npm run lint
npm run typecheck
npm run build
npm audit --audit-level=high
```

CI runs the same gates on every pull request and on every push to `main`.
There is no test suite in this project by the owner's decision. Do not add,
restore, or run Playwright, Vitest, or any other tests unless the owner
explicitly asks.
