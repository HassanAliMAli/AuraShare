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
npm run test:e2e:fresh   # Stop this checkout's servers, then run the E2E suite
npm run test:live        # Check the deployed Worker (needs LIVE_URL)
npm run preview          # Preview production build locally
```

`docs/PROCESS_NOTES.md` records the things that cost time on this project —
among them why a guard has to be *watched failing* before it is called a
guard, and how to clean up after a cancelled background run.

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

TURN credentials are optional and configured with `wrangler secret` — see the
comments in `wrangler.toml` and the [deployment runbook](docs/DEPLOYMENT.md),
which also covers how to check a deployment, what the SPA deep link does to a
`curl`, and why TURN matters behind a symmetric NAT.

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

#### The suite's own STUN server

The peer-to-peer tests drive two browsers against each other **on the same
machine**, so their ICE candidates have to be able to reach each other. They
cannot, out of the box:

- WebKit obfuscates every host candidate with an mDNS name (`<uuid>.local`)
  and a release build has no switch to turn that off;
- the only other candidate it gathers points at the machine's *public*
  address, and getting there from the same machine means the NAT has to
  hairpin — a cloud NAT does not.

On a GitHub runner that leaves the peer connection with no usable candidate
pair, and the test fails with `ICE negotiation failed` — intermittently,
depending on whether mDNS happened to resolve.

So the suite runs its own STUN server (`test/e2e/stun-server.ts`) on the same
host. The binding request comes from the host's own private address, so the
reflexive candidate it returns *is* that address, and the two peers reach
each other directly — no mDNS, no hairpinning, and no dependency on the
public internet either. `test/e2e/helpers.ts` points the app at it instead of
the public STUN servers; the endpoint's own behaviour is covered by
`test/worker/worker.test.ts`.

The Chromium projects use the system Chrome (`channel: 'chrome'`), which is
already installed. **WebKit is Playwright's own build and has to be downloaded
once:**

```bash
npx playwright install --with-deps webkit
```

CI does this automatically. On Linux it also needs the shared libraries
WebKit links against (`libevent`, `libavif`, `libmanette`, `libyuv`, `libgav1`);
`--with-deps` installs them.

> **"Host system is missing dependencies" on your own machine?** Playwright
> checks the libraries its browser builds need before it starts them, and
> refuses to launch when one is absent. `npx playwright install --with-deps
> webkit` installs them — but it needs `sudo`, and it needs to reach the
> package mirror. On a machine you cannot install to, set
> `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true` to skip the check and
> launch anyway:
>
> ```bash
> PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true npx playwright test
> ```
>
> It is an escape hatch, not a fix: if a library really is missing, the
> browser process dies at launch instead of at the check.

> **Running inside a snap-confined editor?** VS Code installed as a snap
> exports `GIO_MODULE_DIR`, and the snap's GIO proxy modules carry an RPATH into
> core20 — which breaks WebKit's network process with
> `page.goto: WebKit encountered an internal error` on every navigation.
> `playwright.config.ts` clears the variable for the WebKit projects, so the
> suite works either way.

#### The stale-server guard
The suite reuses a server that is already listening on `:5173` or `:8787`,
which is what makes `npm run test:e2e` a one-liner. It is also how the suite
can end up testing something other than the code in your working tree:

- a server left over from **another checkout** — another branch, another
  worktree — keeps serving *that* tree's code;
- **`vite preview`** serves the built `dist/` folder, not the source;
- any unrelated process squatting on the port is reused just the same.

None of them announce themselves. The suite simply runs, and the result is
about a codebase that is not the one on disk.

So before any test runs, `test/e2e/e2e-preflight.ts` looks at each port and
reads two things about whatever holds it: the **command line** (is it the
server the suite expects?) and the **working directory** (is it serving this
checkout?). A server that passes both is safe to reuse — Vite and Wrangler
both watch the filesystem, so they pick up a change as soon as it is saved.
Anything else stops the run with the PID and the command to stop it:

```
✗ :5173 is held by PID 207539 — "node .../vite preview --config
  frontend/vite.config.ts --port 5173", working directory
  /home/you/Desktop/coding/AuraShare, which is not the Vite dev server.
  The suite would talk to the wrong server.
```

The check runs as Playwright's `globalSetup`, so `npx playwright test` is
covered too. To stop the servers this checkout started and run the suite
against fresh ones:

```bash
npm run test:e2e:fresh
```

#### Mobile layout checks

`test/e2e/mobile-layout.spec.ts` runs only on the mobile projects (it skips
itself on desktop) and asserts the three things a desktop-only matrix never
checks: nothing overflows the viewport horizontally, no input is under 16px
(iOS Safari zooms the page on focus below that), and every control meets the
24×24px minimum of WCAG 2.2 SC 2.5.8.

#### Accessibility and visual contracts

Two more specs run on **every** project, because what they check is wrong on
every screen size, not just on a phone:

- `test/e2e/accessibility.spec.ts` — every control on the landing page meets
  the 24×24px minimum (the footer links were 17px tall and nothing measured
  them, because the tap-target check only looked at the app screen), and the
  skip link expands out of its `sr-only` box when it takes keyboard focus and
  actually moves focus into the main content.
- `test/e2e/typography-layout.spec.ts` — the three things the redesign is
  built on and that engines disagree about: Archivo's `font-stretch` width
  axis, `dvh` units, and the flex shell that fills the viewport and pins the
  footer to its bottom edge.

