# AuraShare

Peer-to-peer file and text sharing with a **Field Instrument** interface — precision network equipment, not a toy. A Cloudflare Worker mints a six-character code and relays the WebRTC handshake. File data travels directly between the two browsers when ICE can find a path, and through Cloudflare TURN when it cannot. File contents are never stored, and TURN only relays encrypted packets.

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 |
| Language | TypeScript 6 (strict mode) |
| Build | Vite 8 |
| Styling | Tailwind CSS 4 (`@theme` tokens) |
| Animation | Motion 14 |
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
frontend/      React app — components, hooks, stores, lib, types, styles, Vite config
backend/       Cloudflare Worker — routes, RoomDO signaling relay, TURN credentials
shared/        Room-code, heartbeat and ICE contracts imported by both sides
docs/          API contract, deployment runbook, maintenance plan, process notes, archive
wrangler.toml  deployment descriptor (Worker entry + SPA assets)
dist/          generated Vite build output — never edit
```

```
Browser A (Sender)                          Browser B (Receiver)
     │                                           │
     │  POST /api/room → mint 6-char code         │
     │  WS  /api/room/:id/ws                     │
     │──────────────► RoomDO ◄───────────────────│
     │   SDP offer/answer + trickle ICE relay     │
     │                                           │
     │◄═══════════ WebRTC DataChannel ══════════►│
     │        direct path when ICE finds one      │
     │                    │                       │
     │                    ▼                       │
     │              TURN relay                    │
     │   only when a direct path fails; the       │
     │   packets stay end-to-end encrypted        │
```

One Durable Object per room code acts as a dumb WebSocket relay for SDP/ICE exchange. File data travels directly between peers over a WebRTC DataChannel, encrypted with DTLS. When ICE cannot find a direct pair — symmetric NAT, a restrictive firewall — the browser routes the same encrypted packets through Cloudflare TURN.

What each part can see:

- **Signaling (RoomDO):** the room code, SDP/ICE, and connection metadata needed to introduce the peers. It never receives file contents.
- **TURN:** encrypted packets and the addressing needed to relay them. It cannot read the plaintext.
- **Storage:** none of the file contents. The room’s only persisted row is the time its code was minted, and it is released when the room ends.

## Limits

| Limit | Value | Source |
|---|---|---|
| File size | 256 MiB per file | `MAX_FILE_SIZE` |
| Files per transfer | 32 | `MAX_FILES_PER_TRANSFER` |
| Text | 1 MiB of UTF-8 | `MAX_TEXT_BYTES` |
| Peers per room | 2 | `RoomDO` capacity check |
| Room code | 6 characters, Crockford base32 | `shared/room-code.ts` |

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
