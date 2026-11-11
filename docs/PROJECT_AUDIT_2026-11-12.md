# AuraShare — Project Audit

**Date:** 2026-11-12  
**Verdict:** **NON-COMPLIANT**  
**Scope:** AGENTS.md, frontend/backend/testing standards, source, worker, tests, docs, config, dependencies, and a browser pass at 375px and 1280px.

> This report supersedes the untracked `docs/PROJECT_AUDIT.md` and `docs/PROJECT_AUDIT_pass2_superseded.md`. Their coverage numbers and several findings are now outdated.
>
> **Archive note (post-audit):** `AGENTS.md`, `CLAUDE.md`, `DEPLOYMENT.md`, and the superseded audit files referenced in this report were removed from the repository after the audit was written. Those references describe the tree at audit time.

## Evidence

- `npm run lint` — pass.
- `npm run typecheck` — pass.
- `npm run build` — pass.
- `npm run test` — **3 failed / 266 tests** (27 files pass, 3 fail).
- `npx vitest run src --coverage` — **24.05% statements** vs the required 80% gate.
- Coverage over the untracked `test/lib`, `test/hooks`, and `test/p2p` blocks — 89.45%, but the run still fails because of the 3 failing tests.
- `npm audit` — **26 vulnerabilities: 11 high, 14 moderate, 1 low**; 4 high remain with `--omit=dev`.
- `npm run dev:worker` — **fails before startup**: compatibility date not supported by the installed runtime.
- Browser pass — desktop hero CTA stays stacked/full-width; footer separators stay hidden.
- Current versions checked with npm/Brave: React 19.3.1, Vite 8.3.8, Tailwind 4.3.5, Motion 14.12.0, TypeScript 7.0.2, Wrangler 4.160.1, Vitest 5.1.0. The project intentionally pins older majors, but security patches inside the allowed ranges are available now.

---

## Critical

### 1. The responsive `xs` breakpoint is broken
- **Where:** `src/index.css:3`; used in `Hero.tsx:57`, `SiteFooter.tsx:14`, `LandingFooter.tsx:34`.
- **What:** `@custom-variant xs (&:where(@media (min-width: 480px)));` is invalid Tailwind v4 syntax. The built CSS emits `.xs\:flex-row:where()` and `.xs\:block:where()` with no media query. At 1280px the hero CTA row is still `flex-direction: column` with a 768px-wide button, and footer separators are `display: none`.
- **Fix:** use `@custom-variant xs (@media (min-width: 480px));` (or a proper `@media` wrapper), rebuild, and verify computed styles at 375px and 1280px.

### 2. Untrusted peer input is not validated, and file integrity is not verified
- **Where:** `src/lib/signaling.ts:66-70`, `src/lib/transfer.ts:48-105`, `src/lib/webrtc.ts:65-114`.
- **What:** `JSON.parse(...) as WireSignal` and `JSON.parse(...) as SignalingMessage` trust arbitrary peer data. `file-metadata` accepts any name/size/type; `receiveBuffer` accumulates every chunk with no cap; no SHA-256 hash is sent or checked anywhere. A malicious peer can crash a view or exhaust receiver memory. AGENTS.md §12 explicitly requires hash-before-send and verify-on-receive.
- **Fix:** add runtime type guards for every signaling/control message; cap file count, file size, and text size on the receiver; abort on protocol violations; implement SHA-256 verification (SubtleCrypto) or document an explicit waiver with rationale.

### 3. The toolchain has high-severity vulnerabilities
- **Where:** `package-lock.json` / installed `node_modules`.
- **What:** direct vulnerable packages include `vite@8.0.11` (high), `wrangler@4.105.0` (high), `vitest@4.1.9` (moderate), `eslint@10.3.0`/`typescript-eslint@8.59.2` (moderate). `npm audit --omit=dev` still reports 4 high advisories. No browser runtime library is implicated, but the build/deploy toolchain is.
- **Fix:** run `npm update vite wrangler vitest @vitest/coverage-v8 eslint typescript-eslint` within the existing ranges (Vite ≥8.3.8, Wrangler ≥4.160.1, Vitest ≥4.1.12), refresh the lockfile, and add `npm audit --audit-level=high` to CI. Do not jump Motion 12→14, TypeScript 6→7, or Vitest 4→5 without approval and a migration plan.

### 4. The test suite is red and the new block tests are not in Git
- **Where:** `test/` is untracked (`?? test/`); failures at `test/features/shareInput.test.tsx:137`, `test/store/AppProvider.test.tsx:318`, `test/worker/worker.test.ts:293`.
- **What:** on a clean checkout CI only sees the 13 co-located `src/**/*.test.*` files (55 passing tests). It cannot see the 20 block-test files, the 3 failures, or the 89% coverage result. `npm run test:coverage` on tracked code alone fails at 24.05%.
- **Fix:** commit `test/`, fix the 3 bugs, and make CI run coverage plus the block suite. Until then, the repository's quality signal is misleading.

### 5. AGENTS.md describes a different codebase
- **Where:** `AGENTS.md` §§1, 5, 5.3, 7, 11, 13, and the TypeScript version row.
- **What:** AGENTS says PeerJS 1.x, `src/lib/peer.ts`, `VITE_MOCK_PEER`, PeerJS env variables, and a chunker worker. The code uses raw WebRTC + `worker/index.ts` Durable Objects, has no PeerJS dependency, no mock flags, no `.env` files, and no chunker worker. It also says TypeScript 5.x while `package.json` pins `typescript ~6.0.2`. The README and DEPLOYMENT correctly describe raw WebRTC, so AGENTS is the outlier and will mislead agents that follow §15.2.
- **Fix:** rewrite the stale chapters to match raw WebRTC, or restore PeerJS. Update the token table, TD registry, env section, and Vite/config section in the same pass.

---

## Major

1. **Local backend development cannot start.**  
   `wrangler.toml:3` sets `compatibility_date = "2026-07-28"`, but installed workerd supports up to `2026-07-02`; `npm run dev:worker` fails with "newest date supported by this server binary is 2026-07-02". `.wrangler/` is also not ignored and its state files trigger Vite full reloads. **Fix:** update Wrangler or lower the compatibility date, add `.wrangler/` to `.gitignore`, and ignore it in `server.watch`.

2. **Session lifecycle bugs.**  
   `AppProvider.reset` (`src/stores/AppProvider.tsx:141-146`) does not clear `connectTimeoutRef`, so a canceled join fires the 30s timeout and shows an error after reset. `RoomDO.webSocketClose` (`worker/index.ts:205`) calls `ws.close()` on a socket the runtime already closed, producing an uncaught exception. `onDisconnected` is a no-op in both sender and receiver paths, so a dropped peer leaves the UI stuck. `copyText` only logs clipboard failures. **Fix:** clear the timeout on reset/startShare, guard `ws.close`, surface disconnect/transfer failure states, and show a user-visible copy error.

3. **WebRTC signaling race and unhandled failures.**  
   `src/lib/webrtc.ts:82-85` adds ICE candidates immediately; candidates that arrive before `setRemoteDescription` resolves are dropped. `handleOffer`/`handleAnswer` (`103-114`) have no try/catch and are invoked with `void`, so malformed SDP becomes an unhandled rejection. **Fix:** buffer ICE candidates until the remote description is set, and catch/report SDP errors through `onError`.

4. **The 2 GiB limit is not realistic with the current transfer design.**  
   `src/lib/transfer.ts:74` builds the whole received file in memory, and `receiveBuffer` (`109-118`) keeps every chunk. A 2 GiB file can OOM the receiver before download. There is no cancellation, resume, or streaming-to-disk path. **Fix:** stream to OPFS or chunks-to-disk, enforce a practical receiver cap, and add transfer cancellation/failure messages.

5. **Accessibility gaps.**  
   `ShareModeTabs` has no `aria-pressed`/`role="tab"` state (`src/components/features/ShareModeTabs.tsx:24-44`), confirmed by the failing test. `--color-text-ghost` (`#50505e`) has **2.47:1** contrast on `#0c0c0e` and is used at 8–10px for meaningful labels. `SiteNav` nests an `<h1>` inside a `<button>`. `DevicePairCard` puts `aria-label` on a role-less `<div>`. Framer view transitions are not covered by the CSS reduced-motion kill-switch. **Fix:** expose selected state, raise ghost contrast or reserve it for decoration, fix the heading/landmark structure, remove dead ARIA, and wrap the app in `MotionConfig reducedMotion="user"`.

6. **API contract and abuse controls are missing.**  
   There is no `docs/api.md`, although the Worker exposes `POST /api/room`, `GET /api/ice-servers`, and the WebSocket `/api/room/:code/ws`. Error shapes are inconsistent (`{ roomId }`, `{ iceServers }`, plain-text `Room full`/`Not found`). `/api/room` and `/api/ice-servers` have no rate limit, origin check, or bot protection; TURN credentials are minted with a 24h TTL. The 219-line `worker/index.ts` mixes routes, TURN service, and Durable Object logic. **Fix:** write the API contract, standardize `{ error: { code, message } }`, add Cloudflare rate limiting/Turnstile/origin checks, shorten TURN TTL, and split the Worker into route/service/DO modules.

7. **Layout and test organization conflict with the supplied standards.**  
   The repository uses `src/` + `worker/` at the root; the audit standards require `frontend/` + `backend/` + `test/` + `docs/`. It also keeps 13 co-located tests in `src/` and 20 block tests in `test/`, duplicating coverage. **Fix:** choose one layout. If the audit standard is authoritative, move `src/`→`frontend/`, `worker/`→`backend/`, and all tests to `test/<block>/`. If AGENTS is authoritative, amend the standard to document the exception and remove the duplicate tests.

8. **Design-token drift.**  
   49 arbitrary px/radius utilities across 15 component files bypass the spacing/type/radius scale; `AuraTextarea.tsx:41` hardcodes `#6c7cf8`/`#22d3a8`; `--space-*`, `--font-mono`, and several `--duration-*`/`--ease-*` tokens have no consumers; the fluid `--text-*` scale from AGENTS §3.2 was never implemented. **Fix:** replace arbitrary sizes with tokens, use `var(--color-*)` in the SVG, delete unused tokens, and either implement or remove the fluid typography promise.

9. **Documentation is stale.**  
   `DEPLOYMENT.md` says Node.js 18+; Vite 8 requires Node `^20.19.0 || >=22.12.0`. `README.md` says TypeScript 5; the project is on 6. **Fix:** correct both and add a note that `npm run dev:worker` needs a Wrangler/workerd combination that supports the compatibility date.

10. **No automated end-to-end coverage and no coverage gate in CI.**  
    `.github/workflows/ci.yml` runs lint, typecheck, build, and `npm test` only. There is no `test/e2e` directory, no Playwright flow, no `npm audit`, and no coverage step. **Fix:** add one happy-path E2E (text + file + bad code) and wire `test:coverage` plus `npm audit --audit-level=high` into CI.

---

## Minor

- **Dead code / dead weight:** `public/404.html` is never served with SPA fallback; `src/stores/index.ts` is unused; `src/components/landing/index.ts` exports 9 unused symbols; `SuccessView`'s check-badge branch is unreachable for file transfers; `FileIcon`'s `?? File` fallback is exhaustive/dead; `--font-mono` and custom duration/ease tokens are unused; `@keyframes spin` duplicates Tailwind's built-in.
- **Tool state in Git:** `.claude/settings.local.json` and `.serena/` are tracked; the former contains a personal allowlist with stale `peerjs.com`, fly.io, Supabase, Vercel, and Netlify domains. `.wrangler/` and `.playwright-mcp/` are not ignored. Remove from the index, add to `.gitignore`, and keep local copies.
- **PWA/SEO:** `public/manifest.webmanifest` ships only an SVG icon with `any maskable`, and `start_url: "/"` opens the landing page rather than `/app`; `public/robots.txt` points to a nonexistent `sitemap.xml`; `index.html` uses `/logo.svg` as the OG image, which most scrapers ignore.
- **Motion details:** `src/lib/motion.ts:130` animates `top` (layout property) instead of `y`; a few inline `animate={{...}}` objects bypass the variant pool (`AuraDropzone.tsx:144`, `ReceiverFileList.tsx:59,77`); persistent blobs have no `will-change: transform`; reduced motion is handled per-component but not globally for Framer.
- **Component hygiene:** `SharingView.tsx` hosts `ReceiveCodeForm` + `SharingView`; `SuccessView.tsx` hosts `SuccessView` + `ErrorView`; `Section.tsx` hosts `SectionHeader` + `Section`. `WhyAuraShare` hardcodes its subtitle in JSX and uses template-string classes instead of `cn()`; `AuraTextarea` uses template-string classes. `AuraDropzone` never clears stale validation errors and silently ignores dropped folders. `AuraTextarea` silently truncates text over 1 MiB. The test report notes a dev-only `<circle r="undefined">` warning at `AuraTextarea.tsx:35`; not reproduced in the production preview.
- **AI-slop tells:** the page uses a centered hero with two CTAs, three equal icon cards (twice), indigo/teal gradients, heavy glassmorphism/backdrop blur, and a pulsing dot with no state. These are intentional in the "Liquid Cloud" contract, but they are exactly the generic patterns the frontend standard asks to avoid. Keep only if they are a deliberate brand decision.
- **Copy mismatch:** `SharingView` says "6-digit" twice, but room codes are alphanumeric (Crockford). `landingCopy.ts` correctly says "6-character".
- **Prior docs:** `test/TEST_REPORT.md` is a report inside `test/`; move it to `docs/`. The two old audit documents in `docs/` should be archived or replaced by this one.

---

## AGENTS.md Rule Compliance

| Section | Status | Notes |
|---|---|---|
| §0 Project identity | Pass | Product and aesthetic match. |
| §1 Stack | **Fail** | PeerJS absent; TypeScript is 6.x, not 5.x; version table stale. |
| §2 Architecture | Partial | Good feature folders, line counts, named exports, no React in `lib/`. Multiple components per file, unchecked `as` casts, some barrel gaps. |
| §3 Design system | Partial | Colors mostly tokenized; 49 arbitrary px/radius utilities, hardcoded SVG hex, unused space/mono tokens, fluid type never implemented, `cn()` exceptions. |
| §4 Motion | Partial | Variants centralized; `top` animation, inline variants, no `will-change`, reduced motion not globally enforced for Framer. |
| §5 PeerJS/P2P | **Fail** | The entire chapter describes PeerJS; implementation is raw WebRTC + Durable Objects. |
| §6 Code quality | Partial | Lint/typecheck pass; console-only error paths, no transfer worker, a11y contrast/state gaps. |
| §7 Debt registry | Partial | TD-006 claims a chunker worker that does not exist; other TD items look resolved. |
| §8 Testing | **Fail** | 3 failing tests; block suite untracked; no E2E; coverage gate not in CI; tests split across `src/` and `test/`. |
| §9 Commands | Partial | Main commands work; `dev:worker` is broken; mock/e2e commands do not exist. |
| §10 Git | Not verified | On `main` with uncommitted work; CI exists; PR policy cannot be verified from the tree. |
| §11 Environment | **Fail** | No `VITE_MOCK_PEER` or PeerJS env files; no secrets found (good), but the documented contract is stale. |
| §12 Security | Partial | Size/MIME validation and filename sanitization exist; no hash verification, no receiver caps, no rate limiting/origin checks. |
| §13 Vite config | Partial | Config is functional but differs from the documented block (proxy, `@` alias, no PeerJS chunk, no fixed port). |
| §14 Ship-ready checklist | **Fail** | Red tests, a11y gaps, broken responsive variant, vulnerable toolchain, missing API docs. |
| §15 Agent instructions | **Fail** | Following AGENTS as written leads to a different stack; update it before using it as the contract. |

---

## Top 3 Fixes

1. **Fix the `xs` variant** in `src/index.css:3`, rebuild, and verify the hero/footer at 375px and 1280px. This is a one-line fix for a visible desktop/mobile layout regression.
2. **Patch the toolchain and harden the peer boundary.** Update Vite, Wrangler, Vitest, ESLint, and TypeScript-ESLint within the allowed ranges; add runtime message guards, receiver caps, and SHA-256 verification (or a documented waiver).
3. **Make quality visible.** Commit `test/`, fix the 3 failing tests, wire coverage and `npm audit` into CI, then refresh `AGENTS.md` and add `docs/api.md` so the contract and the code agree.
