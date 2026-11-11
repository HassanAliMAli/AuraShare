# AuraShare — Test Report

**Date:** 2026-11-12
**Verdict:** FAIL (original run — see post-fix status)
**New suites:** `test/` (the 13 co-located `src/**/*.test.*` files were folded into the block suites during the restructure; every test now lives under `test/`)
**Build:** PASS (`npm run build`)

**Post-fix status:** PASS — the three failures below are fixed; `npm test` now reports 32 files / 329 tests passing. The failure analysis is preserved for the record.

**Automated E2E:** PASS — `npm run test:e2e` (Playwright, `test/e2e/`) reports 4 passed covering text share, file share (byte-identical download), the unknown-code error path, and the malformed-code path.

**Coverage:** PASS — `npm run test:coverage` enforces 80% thresholds over all of `frontend/src/` (measured 94.09% statements, 84.64% branches, 91.34% functions, 95.52% lines).

**Audit:** PASS — `npm audit --audit-level=high` exits 0 (13 advisories, all moderate).

> **Restructure note (2026-11-12).** The repo moved to `frontend/ backend/ docs/ test/`. The
> failure analysis below is the original record and its paths (`src/…`) are as they were at
> the time of the original run; today the same files live under `frontend/src/…`.
> Current numbers after the restructure: **19 files / 279 tests** passing,
> coverage **93.97% statements / 84.64% branches / 90.86% functions / 95.38% lines**,
> E2E **4 passed**.

## Block Results

| Block | Result | Tests |
|---|---|---|
| `lib` | PASS | 51 |
| `hooks` | PASS | 5 |
| `store` | FAIL | 27/28 |
| `features` | FAIL | 31/32 |
| `landing` | PASS | 12 |
| `layout` | PASS | 7 |
| `p2p` | PASS | 46 |
| `worker` | FAIL | 21/22 |
| `app` | PASS | 8 |

**Total:** 208/211 passed.

Run a block with:

```bash
npx vitest run test/<block>
```

## Failures

### 1. `store` — reset ke baad bhi connect timeout fire hota hai

- **Broke:** `join` ke baad `reset` karne par 30s baad status `idle` ke bajaye `error` ho jata hai. `reset` `connectTimeoutRef` clear nahi karta (`src/stores/AppProvider.tsx:141`).
- **Repro:** `npx vitest run test/store` → "cancels the pending connect timeout when the session is reset" → join click → reset click → `advanceTimersByTime(30000)`.
- **Error:** `test/store/AppProvider.test.tsx:318` — expected `idle`, received `error`.

### 2. `features` — active share mode assistive tech ko expose nahi hota

- **Broke:** Active Text/Files tab par `aria-pressed` ya equivalent state missing hai, isliye screen reader active mode nahi bata sakta (`src/components/features/ShareModeTabs.tsx:24`).
- **Repro:** `npx vitest run test/features` → "exposes the active mode to assistive technology" with `shareMode: 'files'`.
- **Error:** `test/features/shareInput.test.tsx:137` — `aria-pressed` received `null`.

### 3. `worker` — closed WebSocket ko dobara close karta hai

- **Broke:** `RoomDO.webSocketClose` departing socket par `ws.close()` call karta hai; workerd socket pehle hi close kar chuka hota hai, jisse uncaught Durable Object exception aata hai.
- **Repro:** `npx vitest run test/worker` → "survives the departing socket already being closed by the runtime"; live me nonexistent room `ZZZZZZ` join timeout par bhi same error aaya.
- **Error:** `test/worker/worker.test.ts:293` — promise rejected `WebSocket is already closed`; live: `worker/index.ts:205:8`.

## Live E2E — PASS (main flows)

- **Text share:** `ZB5DKX` → sender "Receiver Connected", receiver ko `"live e2e hello"` + "Harmony Achieved" mila.
- **File share:** `GE9XJ1` → "1 file ready" → `aura-e2e.txt` download hua, downloaded file `cmp` se byte-identical.
- **Error path:** `ZZZZZZ` → 30s timeout → "Cosmos Disrupted" → "Try Re-Alignment" se idle form wapas aaya.
- **Routing:** unknown route → landing page fallback.

## Extra Live Findings (app code untouched)

- **Dev reload blocker:** `npm run dev` + `npm run dev:worker` me "Share Aura" click par page full reload ho jata hai. Wrangler `.wrangler/state/...sqlite` files project root me likhta hai, jo Vite watcher ko reload trigger deta hai. E2E production-like `wrangler dev` par kiya.
- **Worker startup blocker:** `npm run dev:worker` fail hota hai — `wrangler.toml:3` compatibility date `2026-07-28` installed workerd ke max `2026-07-02` se aage hai. Workaround: `npm run dev:worker -- --compatibility-date 2026-07-02`.
- **Console error:** `/app` text mode par `<circle> attribute r: Expected length, "undefined"` aata hai; `motion.circle` par initial `r` missing hai (`src/components/AuraTextarea.tsx:35`).
- **Bad-input UX:** 6-character invalid code jaise `AB!12Z` "Establish Link" enable karta hai, lekin submit par kuch nahi hota — koi error feedback nahi (`src/stores/AppProvider.tsx:91`).

## Status of the live findings

- **Dev reload blocker** → **Fixed.** `vite.config.ts` ab `server.watch.ignored: ['**/.wrangler/**']` set karta hai, to Wrangler ke `.wrangler/state/*.sqlite` writes dev server ka watcher trigger nahi karte. Reproduce nahi hua aur ab structurally block hai.
- **Worker startup blocker** → **Resolved.** wrangler `4.160.1` (dependency refresh ke baad) `2026-07-28` compatibility date support karta hai; `npm run dev:worker` seedha chalta hai, workaround ki zaroorat nahi.
- **Console error** → **Fixed.** Commit `3b8b248` ne aura circle ko initial radius diya; `/app` par ab console clean hai.
- **Bad-input UX** → **Fixed.** Root cause teen hisson ka combination tha, teeno band kiye gaye:
  1. Button sirf `.length !== 6` check karta tha → `AB!12Z` par enable ho jata tha. Ab `isRoomCode()` (Crockford base32) se validate hota hai.
  2. `AppProvider.join()` guard silent `return` karta tha → ab `SET_JOIN_CODE_ERROR` dispatch karta hai, jis se inline message dikhta hai.
  3. "Valid code" ka definition client aur worker ke beech mismatch tha (client `[A-Z0-9]`, worker Crockford). Ab dono `src/lib/roomCode.ts` me ek hi alphabet use karte hain — `I, L, O, U` wale codes turant reject hote hain, 30s wait nahi.

  UI: invalid code par button disabled rehta hai aur "Codes use 0-9 and A-Z — no I, L, O or U." message input ke niche aata hai (`role="alert"`, `aria-invalid`). Copy bhi theek ki: "6-DIGIT" → "6-CHARACTER".

## Automated E2E (`test/e2e/`)

Playwright suite — do browser contexts, live Wrangler Durable Object signaling relay, asli WebRTC data channel. `npm run test:e2e` dono servers khud start karta hai (Vite `:5173`, Wrangler `:8787`).

| Flow | Result |
|---|---|
| Text share | PASS — payload receiver tak intact pahuncha |
| File share | PASS — `README.md` download hua, byte-identical |
| Unknown code | PASS — 30s timeout → "Cosmos Disrupted" → "Try Re-Alignment" se idle state |
| Malformed code | PASS — `AB!12Z` par button disabled + reason message; valid code par button enable |

CI me `Playwright E2E` job add kiya gaya hai (`.github/workflows/ci.yml`).

## CI gates

`quality` job ab `npm run test:coverage` chalata hai (poore `src/` par 80% thresholds — measured 94.09% statements / 84.64% branches) aur `npm audit --audit-level=high` (abhi 0 high/critical advisories; 13 moderate, blocking nahi). Coverage report artifact ke roop me upload hota hai.

Real GitHub Actions par dono jobs green: `Lint + Typecheck + Build + Test + Audit` (50s) aur `Playwright E2E` (1m20s), artifacts `coverage-report` aur `playwright-report` upload ho gaye.

### Do CI-only bugs jo sirf asli Actions par hi pakde gaye

1. **`dist/` missing** — `wrangler dev` `assets.directory` ke absent hone par start hi nahi hota, aur `e2e` job build nahi karti thi. Fix: e2e job me `npm run build` add kiya.
2. **Node 20** — Wrangler 4 ko Node `>= 22.12.0` chahiye, workflow Node 20 pin karta tha. Local Node 24 par ye dikhai nahi diya. Fix: dono jobs ab Node 22 (Vite 8 aur Wrangler 4 dono ke liye floor), actions v4 → v7.
3. **Khali Playwright artifact** — CI reporter me `html` nahi tha, is liye `playwright-report/` banta hi nahi tha aur upload step ko "No files were found" mila. Fix: CI reporter me `html` add kiya.
