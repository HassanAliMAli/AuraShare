# Maintenance Plan — dependencies and the minor findings

**Date:** 2026-11-14
**Origin:** the final code review of 2026-11-14 (see the audit report)
**Scope:** the second major finding (outdated dependencies) and every minor
finding, except the testing finding, which was deliberately deferred.

Two things are **not** in this plan, on purpose:

- **The backend coverage threshold.** Deferred by choice — the backend has
  tests, they are simply not measured against a number yet.
- **TypeScript 7.** Blocked upstream, not by us. `typescript-eslint`
  supports TypeScript `>=4.8.4 <6.1.0`, and TypeScript 7.0 ships no stable
  JavaScript API (7.1 will). Our lint step would stop working. Revisit when
  `typescript-eslint` widens its range.

## Why this order

Cheap and safe first, expensive and risky last. The codebase is clean before
any dependency moves, so when a test fails after an upgrade there is exactly
one suspect.

Every pull request is a branch, a CI run, a rebase merge, and a live check —
the Worker deploys itself on every merge to `main`.

| # | Pull request | Covers | Risk |
|---|---|---|---|
| 1 | `chore: remove the dead code, share the button` | m1, m4, m5, m7, m8, m9 | none |
| 1b | `fix: the motion tokens were never applied` | m10 (new) | low |
| 2 | `fix(worker): a re-minted code must not shorten a live session` | m2, m3 | low |
| 3 | `fix: keep a received download alive long enough` | m6 | low |
| 4 | `chore(deps): patch bumps and the audit fix` | D1 | low |
| 5 | `chore(deps): React 19.3 and lucide-react 1.73` | D2 | low |
| 6 | `chore(deps): framer-motion becomes motion 14` | D3 | medium |
| 7 | `chore(deps): Vitest 5` | D4 | medium |

---

## PR 1 — `chore: remove the dead code, share the button`

No behaviour change at all. The tree gets clean before any dependency moves.

### m1 — dead exports and dead code

| What | Where | Fix |
|---|---|---|
| `progressVariants` is never used anywhere | `frontend/src/lib/motion.ts:95` | delete it |
| `EASE_OUT`, `DURATION_MICRO`, `DURATION_STANDARD`, `DURATION_ENTER` are exported but only used inside their own file | `frontend/src/lib/motion.ts:15-19` | drop `export` |
| `MAX_NAME_LENGTH` is exported but only used inside its file | `frontend/src/lib/protocol.ts:23` | drop `export` |
| `isFileDescriptor` is exported but only used inside its file | `frontend/src/lib/protocol.ts:43` | drop `export` |

Dropping `export` is the right fix rather than deleting: the code is used,
it just does not belong to the module's public surface. These are app
modules, not a published package.

### m4 — the transfer session is handed callbacks it does not own

`frontend/src/lib/webrtc.ts:239` spreads every P2P event into
`TransferSession`, which declares only `TransferEvents`. Four callbacks
(`onError`, `onConnected`, `onDisconnected`, `onRoomEnded`) are passed and
never used.

**Fix:** name the transfer events explicitly.

```ts
this.transfer = new TransferSession(dc, {
  onProgress: this.events.onProgress,
  onTransferComplete: this.events.onTransferComplete,
  onFileComplete: this.events.onFileComplete,
  onFileAcknowledged: this.events.onFileAcknowledged,
  onFileDescriptorsReceived: this.events.onFileDescriptorsReceived,
  onTextReceived: this.events.onTextReceived,
  onProtocolError: (message) => this.events.onError(message),
});
```

### m5 — a log label that lies

`frontend/src/stores/AppProvider.tsx:80` labels every P2P error
*"Signaling error"*, but the channel carries ICE failures, data-channel
errors and protocol errors too.

**Fix:** `[P2P] error:`.

### m8 — two buttons that duplicate each other

`Cancel` and `End session` in `frontend/src/components/features/SharingView.tsx`
are the same button written twice, and neither uses the shared `Button`.
They cannot simply switch to `Button variant="quiet"`: that variant is
accent-coloured, and these are deliberately muted until hovered.

**Fix:** add a `muted` variant to the shared button — muted text, accent on
hover — and use it in both places. The page looks identical; the styling
lives in one place.

### m9 — the rate limiter spends a token on requests that cannot spend anything

`backend/modules/routes.ts:55` limits every path starting with `/api/room`,
so `GET /api/room` (a 404) and a WebSocket request without an `Upgrade`
header (a 426) each burn a token of a real user's budget.

**Fix:** limit the two routes that actually touch a room — the mint, and a
socket request that is a real upgrade.

### m7 — the test report is a snapshot

`docs/TEST_REPORT.md` describes the 2026-11-12 run ("32 files / 329 tests").
The suite is now 25 files / 364 tests. The record stays as it is — it is a
report of that run — with one line added at the top giving the current
numbers and the date.

### Verification

`npm run lint`, `npm run typecheck`, `npm run test`, then the Playwright
matrix. Nothing should change: no test asserts on the exports being removed,
and the button variant is a visual no-op.

---

## PR 1b — `fix: the motion tokens were never applied`

**A new finding, made while implementing PR 1.** It is not in the review
report; it came out of measuring the migrated button against the raw one it
replaced.

### m10 — every duration and easing token is silently ignored

Seven places use the Tailwind v3 way of pointing a utility at a CSS
variable:

```tsx
duration-[--duration-micro]   // Button, Hero, AuraDropzone, ShareModeTabs
duration-[--duration-standard] // FAQItem
ease-[--ease-standard]        // FAQItem
accent-[--color-accent]       // ReceiverFileList
```

Tailwind v4 changed the syntax: a CSS variable is now written
`duration-(--duration-micro)`, or `duration-[var(--duration-micro)]`. The v3
form is no longer converted, so Tailwind emits the token name as a literal
value:

```css
.duration-\[--duration-micro\] {
  --tw-duration: --duration-micro;
  transition-duration: --duration-micro;   /* not a <time> — dropped */
}
```

`transition-duration` falls back to `unset`, which for a transition is `0s`.
So the design system's motion tokens — 120ms, 200ms, the one easing curve —
are declared in `tokens.css` and **never applied**. Every hover colour change
snaps instead of fading, and the FAQ accordion opens without animating.

**Fix:** the v4 syntax, in all seven places. The tokens then do what
`tokens.css` says they do.

**The guard:** the Playwright matrix, plus a look at the FAQ accordion and a
hover on a button. The measurement that found this — the computed
`transition-duration` of a button, `0s` where `0.12s` was designed — is the
same measurement that has to change.

**Note for PR 1:** the two text buttons PR 1 migrates were plain text links
with Tailwind's default 150ms fade, so the shared `muted` variant carries
`duration-150` to keep them exactly as they were. This pull request replaces
that with the real token, and the variant's own duration goes away with it.

---

## PR 2 — `fix(worker): a re-minted code must not shorten a live session`

Backend correctness. Two small changes in one file, both about a room that
is asked to do two things at once.

### m2 — a second mint of the same code cuts a live session short

`backend/modules/room-do.ts:154` — `reserve()` writes the mint time and
arms the alarm with `force`, so it overwrites whatever deadline the room
had.

The scenario: room `A1B2C3` is minted, two peers join, the room gets its
30-minute lease. A later `POST /api/room` happens to mint `A1B2C3` again —
the code space is 32⁶ ≈ 1.07 billion, so it is rare, but it happens — and
`reserve()` sets the alarm back to `now + 10 minutes`. The live session's
lease is now shorter than it was, and the code's window restarts.

**Fix:** a room that is already minted is left alone. Only a new room is
written and armed.

```ts
private async reserve(): Promise<Response> {
  const existing = await this.state.storage.get<number>(MINTED_KEY);
  if (existing !== undefined) {
    // The room already exists. Its deadline is not ours to move: a second
    // mint of the same code must not shorten a live session's lease.
    return json({ reserved: true });
  }
  const now = Date.now();
  await this.state.storage.put(MINTED_KEY, now);
  await this.arm(now + CODE_VALIDITY_MS);
  return json({ reserved: true });
}
```

`arm()` loses its `force` parameter with this — no call site needs it any
more, and the `deadline <= current` guard already refuses to move a
deadline backwards.

**The guard:** a test that mints a room, pairs it, mints the same code
again, and asserts that the alarm is still the 30-minute lease and not the
10-minute code window. It must fail against the old code.

### m3 — a guess pays for storage it never had

`backend/modules/room-do.ts:66` — a join for a code nobody minted calls
`release()`, which is `deleteAll()`. But `MINTED_KEY` is the only key the
room ever writes, so `minted` being absent already means there is nothing
stored. The call does not release anything; it just makes the Durable
Object create a database and immediately delete it.

**Fix:** drop the call. The 404 stands on its own.

**The guard:** a test that joins an unminted code and asserts that no
storage was written and none was deleted — a guess now costs one Durable
Object request and nothing else. It must fail against the old code.

### Verification

`npm run test` (the worker block), plus a live check that a minted code
still opens and an unminted one is still refused. Both guards are verified
to fail when the fix is put back.

---

## PR 3 — `fix: keep a received download alive long enough`

`frontend/src/stores/AppProvider.tsx:211` revokes the object URL one second
after the download is triggered. A large file on a slow link can still be
reading the blob when the URL is revoked, and the download dies.

**Fix:** give the browser time — revoke after 60 seconds instead of one.
The blob is already in memory (the file was received), so the extra time
costs nothing that was not being spent anyway.

**The guard:** the receiver flow in the end-to-end suite already downloads
a file and compares it byte for byte. That is the guard; it must fail if
the window is shortened further.

---

## PR 4 — `chore(deps): patch bumps and the audit fix`

`npm audit` reports 12 advisories, all **moderate** — no high, no critical,
which is why the CI gate (`--audit-level=high`) passes today.

- `npm audit fix` (without `--force`) fixes the `@vitest/mocker` advisory.
  It adds three packages and changes two.
- The `minimatch` advisory stays: the fix is a breaking change and is not
  worth it here. It is a build-time dependency and the advisory is a
  denial-of-service in glob parsing. It is recorded here instead of being
  forced in.

Bumped alongside it, all patch-level:

| Package | From | To |
|---|---|---|
| eslint | 10.14.0 | 10.15.0 |
| wrangler | 4.160.1 | 4.162.0 |
| @playwright/test | 1.65.0 | 1.65.1 |
| @cloudflare/workers-types | 5.20261110.1 | 5.20261114.1 |
| globals | 17.5.0 | 17.6.0 |

**Why together:** they touch nothing in the source. One PR, one CI run, one
review.

---

## PR 5 — `chore(deps): React 19.3 and lucide-react 1.73`

Both are minor upgrades inside a major version.

- **React 19.3** — no API our code uses changes.
- **lucide-react 1.73** — the icons in use are `ChevronDown`, `Image`,
  `Film`, `Music`, `FileText`, `FileArchive`, `File`, `FileType`, `ArrowUp`,
  `UploadCloud`, `Copy`, `Check`, `Clock`, plus the `LucideIcon` type. If
  any of them were renamed, the build fails on the missing export — so the
  build is the guard, and the file-type icons get one visual look.

---

## PR 6 — `chore(deps): framer-motion becomes motion 14`

The package was renamed: `framer-motion` is now `motion`, and the React
API lives at `motion/react`. Official upgrade guide: **no breaking React
API changes in v12, v13 or v14** for this project. v13 only dropped an
optional dependency that mattered for CSS-in-JS libraries — this project
uses none.

**The change:** 24 import sites move from `'framer-motion'` to
`'motion/react'`:

- 21 components and modules under `frontend/src/`
- `frontend/src/lib/motion.ts` (the `Transition` type)
- `test/shared/setup.ts` (`MotionGlobalConfig`)
- `test/app/app.test.tsx` (the `vi.mock('framer-motion', …)` mock — the
  mocked module path must match the new one, or the mock silently stops
  applying and the real animations run in the test)

**Risk:** the landing page animates on scroll and on mount. The Playwright
matrix measures layout and typography, so a broken animation shows up as a
failing test rather than as a quiet difference. One manual look at the
landing page afterwards.

---

## PR 7 — `chore(deps): Vitest 5`

Vitest 5 requires Vite ≥ 6.4 (we have 8.3.8) and Node ≥ 22.12 (CI uses 22).
Both fine.

The breaking changes, checked against this repository one by one:

| Breaking change | This repository |
|---|---|
| `clearMocks` defaults to `true` | No test depends on a mock's history crossing a test boundary — every mock is created inside its own test. Verify by running the suite. |
| `vi.mock` must be at the top level, or it throws | All seven `vi.mock` / `vi.hoisted` calls are already at the top level. |
| Unawaited async assertions now fail | Every `.resolves` / `.rejects` is already awaited. |
| `test.sequential` removed | Never used. |
| `toThrow('')` matches anything | Never used. |
| `-t` patterns join with ` > ` | The CI never filters by name. |
| Coverage `include` matches more precisely | `frontend/src/**` still matches the same set of files. |
| `vite` is now a peer dependency | Already a direct dependency. |
| `bench` API rewritten | Not used. |

**Also bumped:** `@vitest/coverage-v8` to the version that matches Vitest 5.

**The guard:** the whole suite, plus the coverage thresholds CI enforces.

---

## Every PR: the same ritual

1. `git checkout -b <branch>` from `main`.
2. Change, then `npm run lint`, `npm run typecheck`, `npm run test`, and
   `npx playwright test` for anything that can move pixels.
3. Commit with a message that says *what changed and why*, not what the
   diff already says.
4. Push, open a pull request, wait for all three checks to be green.
5. Merge with `--rebase` — the history on `main` is linear.
6. Wait for `main` to be green too, then check the live site.
7. Report the pull request link.

### Commands, in plain words

| Command | What it does |
|---|---|
| `npm run lint` | Reads the code and complains about style rules it breaks. |
| `npm run typecheck` | Checks that the types line up, without running anything. |
| `npm run test` | Runs the unit and component tests. |
| `npx playwright test` | Drives real browsers through the app: two devices, a real transfer. |
| `npm run build` | Produces the `dist/` folder the Worker serves. |
| `gh pr merge <n> --rebase` | Merges the pull request by replaying its commits on top of `main`. |

### If something breaks

Every pull request here is one rebase-merged commit, so the way back is
short:

- `git revert <sha>` on `main`, push — the Worker redeploys itself.
- For a broken live deployment, the previous Worker version can be put back
  with `npx wrangler versions deploy <version-id>` without touching `main`.

### The live check after a dependency PR

The app is the product, so the live site gets a real session: two browsers,
a text payload, and the file arriving intact. The dependency upgrades touch
the client bundle, so this is the check that matters.
