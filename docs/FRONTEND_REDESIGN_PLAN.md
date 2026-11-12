# AuraShare — Frontend Redesign & Restructure Plan

**Date:** 2026-11-12
**Status:** **Delivered** — PR #3 (this plan), PR #4 (restructure), PR #5 (redesign)
**Scope:** Frontend only for PRs 1–2. PR 3 is backend and is listed for completeness.

> **Outcome.** The redesign shipped as PR #5 with the "Field Instrument" direction
> exactly as specified below: Archivo + IBM Plex Sans + JetBrains Mono, one amber
> accent on a warm neutral base, the eight-step type scale, hairline rules instead
> of elevation, and every banned layout replaced. Two silent, page-wide bugs
> surfaced during the work and are now covered by regression tests — see
> "Bugs found while building this" at the end of the document.
**Standard:** `.opencode/skills/frontend-standards` (plus `backend-standards`, `testing-standards`)

---

## 0. Why this plan exists

The current frontend is **AI slop**: it hits four explicitly banned patterns on their
textbook form, and it is not a deliberate style choice — it is the default output of an
un-guided generator.

| Banned pattern | Where it lives today |
|---|---|
| Centered hero — headline, subtitle, two buttons | `landing/Hero/Hero.tsx` |
| Three equal rounded icon cards in a row | `landing/HowItWorks/HowItWorks.tsx` **and** `landing/WhyAuraShare/WhyAuraShare.tsx` |
| Indigo/purple accent + gradients | `--color-signal: #6c7cf8` (hue 233°) drives every accent, plus `.bg-gradient-transfer` |
| Neon glow + glassmorphism/blur as decoration | `--shadow-glow-signal/-transfer`, `backdrop-blur-*` on 12 elements, `blur-[80px]` ambient blobs |
| Inter / Space Grotesk as the display face | `index.css` `--font-display` / `--font-body` |
| "Live" badge — pulsing dot with no meaning | `layout/SiteFooter.tsx:15` |
| Same big shadow + giant radius on every element | `rounded-2xl/3xl/[48px]/[56px]` + `shadow-xl/2xl` throughout |

Plus three real defects, verified in a browser:

1. `/app` requests `font-family: Inter` (`AuraApp.tsx:25`) but only **`Inter Variable`** is
   ever loaded — the whole app page silently falls back to the generic `sans-serif`.
2. `prefers-reduced-motion` is ignored by Framer Motion — no `MotionConfig reducedMotion="user"`.
   Measured with reduced motion emulated: the H1 still animates `blur(1.67px)` +
   `translateY(12.13px)` at 80 ms.
3. `--color-text-ghost #50505e` = **2.47:1** on the base (needs 4.5:1), used for real labels
   including the inactive tab label.

**Goal:** a frontend that is deliberately designed, passes the standard line-by-line, and
lives in the `frontend/ backend/ docs/ test/` layout the standards require.

---

## 1. Design direction — "Field Instrument"

The product is peer-to-peer file transfer: precise, private, no account, no server.
The interface should read like **precision network equipment** — engineered, legible,
honest about what the machine is doing. Warm neutral base, one amber indicator accent,
hairline rules, monospace for machine output, left-aligned editorial layouts.

Explicitly rejected: glow, glass, blur, gradients, blobs, centered-everything, equal card
rows, decorative icons, cosmic whimsy.

### 1.1 Type system

| Role | Family | Package | Notes |
|---|---|---|---|
| Display | `Archivo Variable` | `@fontsource-variable/archivo` (5.3.0) | `wght 100–900`, `wdth 62–125`. Headlines use `font-stretch: 112%` for a wide, stenciled feel. |
| Body / UI | `IBM Plex Sans Variable` | `@fontsource-variable/ibm-plex-sans` (5.3.0) | Engineering heritage; holds up at 13–14 px. |
| Machine output | `JetBrains Mono Variable` | `@fontsource-variable/jetbrains-mono` (5.3.0) | Room codes, byte counts, step numbers, colophon. |

Rationale: Brave research (Nov 2026) — *"Technical products are gravitating toward
DIN-influenced faces like Barlow and IBM Plex Sans. These carry engineering heritage that
gives developer tools and data products a distinct visual identity."* None of the three is
on the standard's banned list; all three are self-hosted via Fontsource (no CDN).

> Note: the current `--font-mono: 'JetBrains Mono'` token is **dead** — the family is never
> loaded. PR 2 makes it real.

### 1.2 Colour system (contrast-validated)

Base is warm near-black, not blue-black. One accent — amber, the colour of an indicator
lamp. Green and red appear **only** for success/error state.

| Token | Value | on base | on surface | on raised | Verdict |
|---|---|---|---|---|---|
| `--c-base` | `#0e0e0c` | — | — | — | page background |
| `--c-surface` | `#171715` | — | — | — | panel |
| `--c-raised` | `#1f1f1c` | — | — | — | raised panel |
| `--c-border` | `#2b2b27` | 1.36 | — | — | hairline, decorative only |
| `--c-border-strong` | `#3d3d37` | 1.77 | — | — | interactive borders |
| `--c-text` | `#f0eee7` | **16.64** | 15.46 | 14.23 | AA |
| `--c-text-2` | `#a8a49a` | **7.77** | 7.22 | 6.64 | AA |
| `--c-text-3` | `#8d8a80` | **5.59** | 5.20 | 4.78 | AA |
| `--c-accent` | `#e8a33d` | **8.96** | 8.32 | 7.66 | AA |
| `--c-accent-ink` | `#0e0e0c` | — | — | — | text on accent = **8.96** |
| `--c-success` | `#6fbf8b` | **8.74** | 8.12 | 7.48 | AA |
| `--c-error` | `#e5645f` | **5.81** | 5.40 | 4.97 | AA |

Every value clears WCAG AA (4.5:1) on **all three** surfaces. The old `--color-text-ghost`
(2.47:1) is deleted.

### 1.3 Spacing, radius, elevation

- **Spacing:** `4 8 12 16 24 32 48 64 96` — real tokens, applied via `gap-*`/`p-*` from a single
  `--spacing` scale. The dead `--space-*` family (14 tokens) is deleted.
- **Radius:** `0` (hairline surfaces) / `4px` (buttons, inputs) / `9999px` (pills, only where
  a pill is semantically right). All `rounded-3xl`, `rounded-[48px]`, `rounded-[56px]` go.
- **Elevation:** **no drop shadows.** Surfaces are separated by 1px `--c-border` rules and
  background steps. `shadow-xl/2xl` and the `--shadow-glow-*` tokens are deleted.
- **Type scale:** `12 13 14 16 20 28 40 56` with defined roles. The current 15-size spread
  (including `text-[8px]`, `text-[9px]`, `text-[10px]` ×33) collapses to 8 steps.
  **Minimum size on screen: 12px, and never below 13px for anything that carries meaning.**

### 1.4 Motion

- One easing curve, one duration set: `120ms` (micro), `200ms` (standard), `320ms` (enter).
- **No infinite decorative loops.** The morphing blob, rotating core, travelling packet,
  pulsing dot, and blur/scale view transitions all go.
- Movement must carry meaning: a progress bar filling, a tab indicator sliding, a row
  expanding. Nothing pulses to prove the page is alive.
- `<MotionConfig reducedMotion="user">` wraps the app so the OS preference is honoured
  globally — this also fixes defect #2.

---

## 2. Target repository structure

```
frontend/
  index.html
  public/            logo.svg, manifest.webmanifest, _headers, robots.txt, 404.html
  src/
    components/
      landing/       Hero/ HowItWorks/ Comparison/ Privacy/ FAQ/ FinalCTA/ Section.tsx
      features/      ShareTabs/ ShareInput/ CodePanel/ FileList/ Status/
      layout/        LandingNav/ SiteNav/ Footer/
      ui/            Button/ Field/ Panel/ FileIcon/
    hooks/           useReducedMotion.ts, useRoute.ts
    stores/          AppProvider.tsx, appStore.ts
    lib/             protocol/ signaling/ transfer/ webrtc/ roomCode/ validation/ router/
    types/
    styles/          tokens.css, base.css
    index.css
    main.tsx
  vite.config.ts
backend/
  index.ts
  modules/           routes.ts, turn.ts, room-code.ts, room-do.ts, errors.ts
docs/
  api.md             ← NEW, required by backend-standards
  FRONTEND_REDESIGN_PLAN.md
  PROJECT_AUDIT_2026-11-12.md
test/
  shared/            fixtures.tsx, setup.ts
  <block>/           landing, app, features, layout, lib, p2p, store, worker
  e2e/
wrangler.toml       ← stays at the root (project deployment descriptor)
```

> **`wrangler.toml` stays at the repository root** — an approved exception to "server
> configs live in backend/". It is the project-level *deployment descriptor*: it binds
> the Worker (`backend/index.ts`) **and** the SPA assets that the frontend build emits
> to `dist/`. The Cloudflare Workers Builds integration runs `npx wrangler deploy` from
> the repository root, and wrangler only searches the working directory and its
> ancestors — it cannot discover a config inside a subdirectory, so hiding it in
> `backend/` breaks the deploy pipeline. All server *code* lives in `backend/` exactly
> as the standard requires. **Approved by the maintainer, 2026-11-12**, and recorded in
> `backend-standards` so it is not moved back.

---

## 3. PR 1 — Restructure (mechanical, low risk)

**Goal:** reach the required layout without touching a single line of component logic.
The Playwright E2E suite is the safety net — it drives the real stack (Vite + Wrangler
Durable Object + a genuine WebRTC data channel, byte-compared download).

### Steps

1. `git mv src frontend/src`
2. `git mv worker backend`
3. `git mv public frontend/public`
4. `git mv index.html frontend/index.html`
5. `git mv vite.config.ts frontend/vite.config.ts`
6. `git mv src/test/setup.ts test/shared/setup.ts`
7. Move the 13 co-located `src/**/*.test.*` files into `test/<block>/` (dedupe against the
   existing block tests — do not keep both).
8. Config edits:
   - `frontend/vite.config.ts` — `root: __dirname`, `build.outDir: '../dist'`,
     alias `@ → ./frontend/src`
   - `vitest.config.ts` — alias `@ → ./frontend/src`, `setupFiles → './test/shared/setup.ts'`,
     `coverage.include → ['frontend/src/**']`
   - `tsconfig.app.json` — `include: ["frontend/src"]`, `paths {"@/*": ["./frontend/src/*"]}`
   - `tsconfig.test.json` — `paths {"@/*": ["./frontend/src/*"]}`
   - `tsconfig.worker.json` — `include: ["backend"]`
   - `wrangler.toml` — **stays at the repo root**, `main = "backend/index.ts"`,
     `assets.directory = "./dist"` (see the note below)
   - `eslint.config.js` — split `globals.browser` (frontend) from worker globals (backend)
9. `package.json` scripts — **keep every script name identical** so CI needs no edits:
   - `dev` → `vite --config frontend/vite.config.ts`
   - `dev:worker` → `wrangler dev`
   - `build` → `tsc -b && vite build --config frontend/vite.config.ts`
   - `test` / `test:coverage` / `test:e2e` unchanged
10. Delete dead files: `src/stores/index.ts` (imported by nobody),
    `src/components/landing/index.ts` trimmed to the exports actually used.

### Gotchas (already mapped)

| Risk | Handling |
|---|---|
| `dist/` must stay at repo root | `build.outDir: '../dist'`; CI's e2e job assumes `assets.directory` exists |
| `@` alias lives in 4 places | vite, vitest, tsconfig.app, tsconfig.test — all four updated together |
| Playwright pins `:5173` / `:8787` | `root` set explicitly in the new vite config so the dev server serves `frontend/` |
| `.wrangler/` state dir | Vite's `server.watch.ignored: ['**/.wrangler/**']` matches at any depth ✅ |
| ESLint spans two runtimes | Explicit `files` split for `frontend/**` vs `backend/**` |
| **`wrangler.toml` must stay at the repo root** | The Cloudflare Workers Builds integration runs `npx wrangler deploy` from the root. Wrangler only searches the working directory and its ancestors — it cannot find a config inside a subdirectory, so hiding it in `backend/` fails the dashboard build with *"Missing entry-point to Worker script or to assets directory"*. The file is the project-level **deployment descriptor** (Worker entry **and** SPA assets), not private server config; all server *code* still lives in `backend/`. |

### PR 1 acceptance

- `npm run lint`, `npm run typecheck`, `npm run build` green
- `npm run test:coverage` green at the 80% thresholds
- `npm run test:e2e` green (text share, file share byte-compared, malformed code)
- `git status` shows renames only — no behaviour change

---

## 4. PR 2 — Redesign (the real work)

**Logic layer is NOT rewritten.** `lib/webrtc.ts`, `signaling.ts`, `transfer.ts`,
`protocol.ts`, `roomCode.ts`, `validation.ts`, `router.ts`, `stores/`, `types/` are solid and
covered by 329 passing tests. They move in PR 1 and are left alone here. Only
`components/**`, the token layer, and the font imports change.

### 4.1 Token layer

New `frontend/src/styles/tokens.css` — the single source for colour, type, spacing, radius,
motion. All component classes resolve to these tokens; **no raw hex, no arbitrary
`[Npx]`, no inline styles** outside this file.

Deleted: `--color-signal`, `--color-transfer`, `--color-warn`, `--color-bright`,
`--color-aura-*`, `--color-text-ghost`, `--color-void`, all 14 `--space-*`, all
`--duration-*`, all `--ease-*`, `--shadow-glow-*`, `--radius-blob`, `--radius-full`.

### 4.2 Landing page — section by section

| Section | Today (slop) | New |
|---|---|---|
| **Nav** | Sticky glass bar, uppercase tracking-widest links, white pill CTA | Flat bar, 1px bottom rule, `Archivo` wordmark, one amber **text** link (no pill) |
| **Hero** | Centered; h1 + sub + **two** buttons; glassy blob device visual | **Left-aligned** 12-column split. Left: eyebrow, wide `Archivo` h1, one sub line, **one** primary CTA, three mono spec lines (no account / no size cap / E2E). Right: a **flat SVG schematic** — two device outlines, dashed muted relay line, solid amber direct line, room code in mono. No blur, no gradient, no glass. |
| **How it works** | 3 equal icon cards | **Numbered protocol rows.** Full-width hairline-ruled rows: `01` (mono) │ device-pair glyph │ title │ description. Reads as a spec sheet, not a card grid. |
| **Why AuraShare** | 3 equal icon cards | **Comparison table** — AuraShare vs WeTransfer vs Google Drive vs AirDrop across 5 real criteria (server routing, max file size, account required, E2E, cost). Real content, and it directly answers the FAQ's own comparison question. |
| **Privacy** | Chip row + glass panel with gradient beam | Chips → inline mono uppercase list with amber bullets. Diagram redrawn as a 2-lane schematic with hairline rules: muted dashed relay lane above, amber solid direct lane below. |
| **FAQ** | Glass accordion | Flat accordion, hairline rules, **no** panel background, mono index numbers. (ARIA is already correct — keep it.) |
| **Final CTA** | `rounded-[3rem]` gradient panel | **Full-bleed solid amber band**, one ink-on-amber button. No gradient, no rounded blob, no glow. |
| **Footer** | Centered glass trust strip | Left-aligned 3-column: wordmark + tagline │ link columns │ colophon (version, stack). Small mono type. |

### 4.3 App (`/app`)

| Element | Today | New |
|---|---|---|
| Brand | `<h1>` **inside a `<button>`** (invalid nesting) | `<a>` to `/`; the page owns a single real `<h1>` |
| Mode switch | White pill in a glass container | Proper `role="tablist"` + `role="tab"` + `aria-selected`, amber underline indicator |
| Text share | Glass panel + giant animated teal blob behind it | Flat bordered panel, 16 px+ textarea, mono char count |
| File drop | Morphing gradient blob, 20 s rotation loop | Dashed hairline drop target, static file glyph, amber on drag-over |
| Code display | `rounded-[56px]` glass slab, 8xl type | Bordered "ticket" panel, **mono**, amber, large |
| Progress | Gradient fill bar | 2 px solid amber bar, `role="progressbar"` retained |
| Status / success / error | Giant glowing circles + "Harmony Achieved" | Bordered panel, mono status line, one clear action |
| Receive code | "cosmic code" wording | "6-character code" — matches `landingCopy.ts` and the actual Crockford alphabet |

### 4.4 Copy rewrite

The cosmic vocabulary is filler that carries no information. Replace with plain, factual
language. Current → new:

| Now | New |
|---|---|
| "Reaching across the cosmos" | "Establishing a direct connection" |
| "Waiting for cosmic alignment…" | "Waiting for the other device" |
| "Harmony Achieved" | "Transfer complete" |
| "Cosmos Disrupted" | "Connection failed" |
| "Copy to Universe" | "Copy text" |
| "Begin New Cycle" | "Share something else" |
| "Try Re-Alignment" | "Try again" |
| "Input the 6-character cosmic code" | "Enter the 6-character code" |
| "Release your files" / "Drag & drop or click to browse the cosmos" | "Drop files here" / "or browse" |
| "One code. Two devices. Zero friction." | "One code. Two devices. A direct link." |
| "Your files take the direct route." | "Your files never touch a server." |

The FAQ copy and the comparison table content stay — they are already specific and factual.

### 4.5 Logo

`public/logo.svg` is a **three-stop gradient blob** (indigo → teal → amber) — textbook slop.
Replace with a flat, single-colour mark: **two outlined device squares connected by a solid
amber bar**, no gradient, no blur, no opacity tricks. SVG, hand-authored, checked against
`#0e0e0c` and on white.

### 4.6 Accessibility work (explicit)

- `<MotionConfig reducedMotion="user">` at the app root.
- `--c-text-3` replaces `--color-text-ghost` everywhere; **no** text below 4.5:1.
- `<h1>` removed from the nav button; one `<h1>` per view.
- `aria-label` removed from the role-less `<div>` in `DevicePairCard` (dead ARIA).
- `role="tablist"` / `role="tab"` / `aria-selected` on the mode switch.
- Focus rings: 2 px `--c-accent` + 2 px offset on **every** interactive element.
- Inputs: minimum 16 px font size (prevents iOS zoom-on-focus).
- `prefers-reduced-motion`: no infinite loops remain, so the preference is honoured by
  construction as well as by `MotionConfig`.

### 4.7 PR 2 acceptance

- Every rule in `frontend-standards` checked line by line — no banned pattern remains
- All text ≥ 4.5:1 on all three surfaces (verify programmatically)
- No `text-[Npx]` below 12px, no `text-[8px]`/`[9px]`/`[10px]`
- Zero `backdrop-blur`, zero `shadow-glow-*`, zero `rounded-[4Npx]`, zero gradient utilities
- Zero raw hex outside `tokens.css`; zero hardcoded easing outside `motion.ts`
- Keyboard walkthrough of every view: focus visible, order sensible, no traps
- `npm run lint && npm run typecheck && npm run test:coverage && npm run test:e2e` green
- Visual diff reviewed at 375 / 768 / 1280 / 1920

---

## 5. PR 3 — Backend split + API contract (independent)

Required by `backend-standards`; unrelated to the frontend but listed so the whole
structure lands.

1. Write `docs/api.md` **first** — `POST /api/room`, `GET /api/ice-servers`,
   `WS /api/room/:code/ws`, with inputs, outputs, and a consistent
   `{ error: { code, message } }` shape.
2. Split `backend/index.ts` (231 lines) into `modules/routes.ts`, `modules/turn.ts`,
   `modules/room-code.ts`, `modules/room-do.ts`, `modules/errors.ts`.
3. Standardise the error shapes currently mixed between JSON and plain text
   (`Room full`, `Not found`).
4. Keep `test/worker/worker.test.ts` green against the split.

---

## 6. Known risks

| Risk | Mitigation |
|---|---|
| Redesign regresses behaviour | Logic layer untouched in PR 2; E2E suite runs in every PR |
| Font load causes FOUT/CLS | `font-display: swap` (Fontsource default) + `size-adjust` fallback in `tokens.css` |
| Restructure breaks the deploy | `assets.directory` path pinned in CI; `npm run deploy` smoke-tested before merge |
| Scope creep on PR 2 | Component-by-component table above is the contract; anything extra needs a new PR |
| Product naming | "AuraShare" the **name** is kept — renaming the product is a separate decision, not part of this plan |

---

## 7. Execution order

1. **PR 1** — restructure (mechanical, E2E-verified)
2. **PR 2** — token layer → primitives → landing → app → copy → logo (one PR, ordered commits)
3. **PR 3** — `docs/api.md` → backend module split

Each PR branches from `main`, opens a PR, waits for CI, and is merged only when green.


---

## Bugs found while building this

Both were invisible to the test suite and only appeared when the rendered result
was measured in a browser. They are recorded here because they are the kind of
defect a design system has to defend against, not just a one-off fix.

1. **Tailwind namespace collision.** A `--color-base` token made Tailwind v4
   resolve `text-base` as a *colour* rule instead of a font-size (`.text-base`
   resolved to `color: var(--color-base)`), which painted a button's label the
   same colour as its own background. Tailwind checks the colour namespace for
   an ambiguous `text-<name>` utility, so a colour token must never share a
   name with a size token. The colour is now `--color-canvas`.

2. **Rem basis.** `font-size: var(--text-base)` on `:root` moved the rem basis
   from 16px to 14px, silently rescaling every rem-based size in the system
   (Tailwind's spacing included). A body copy element was computing to
   12.25px. The root font size now stays at `1rem`; the token is applied to
   `body` instead.

`test/lib/tokens.test.ts` now asserts both — and the guard tests were verified
to fail when each bug is reintroduced.

## A third defect, in the test suite

The Playwright download test registered `waitForEvent('download')` *after* the
click. Playwright does not buffer events, so a download that landed in that gap
was lost, and the test waited out its full 90-second timeout for an event that
had already fired. The previous UI was slow enough to hide the race; the
redesigned one is not. The listener is now registered before the click.
