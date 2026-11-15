# AuraShare — Audit Fix Checklist

**Audit date:** 2026-11-15
**Verdict at audit time:** NON-COMPLIANT
**Progress:** `1 / 29` issues · `5 / 143` tasks
**Task split:** P0 34 · P1 65 · P2 44

Tick a **task** when that step is done. Tick the **issue** only when every task
under it is ticked and the acceptance condition in the issue text is met. Do not
tick work that is only planned.

> **Test ban:** no tests, lint, typecheck or build may be run in this session.
> Tasks that say “verify” therefore mean static inspection (read the diff, grep
> for the old string, check the file exists) unless test execution is explicitly
> allowed later. Do not tick a behaviour-changing issue on static inspection
> alone once the ban is lifted — run the affected block plus one E2E pass first.

> **Scope change (2026-11-15):** the owner removed the entire test suite
> (`test/`, Playwright/Vitest configs, test scripts and CI test jobs) and
> directed that no tests be added or run. Every test-related task below is
> **N/A** from this date. The audit is preserved as a historical record.

---

## P0 — Critical

- [ ] **C1. Correct the privacy/security copy in `frontend/src/lib/landingCopy.ts`.**

  Replace “no server in the path”, “Your files never touch a server”, “NO SERVER”
  and “never sees your files, your metadata, or you” with wording that says:
  file contents are never stored; encrypted packets may be relayed through TURN
  when a direct path fails; the signaling server sees the room code and
  handshake metadata. Update `HERO.subtitle`, `PRIVACY.title`, `PRIVACY.subtitle`
  and `FOOTER.trust`.

    - [ ] **C1.1** Inventory every overclaim in the file: `HERO.subtitle` (L22),
      `HOW_IT_WORKS.subtitle` (L39), `mechanismTail` (L74), `PRIVACY.title` (L119),
      `PRIVACY.subtitle` (L121), `PRIVACY.relayLabel` / `directLabel` / `caption`
      (L128–131), FAQ `different` (L143), FAQ `security` (L158), `FOOTER.trust`
      (L176). Put the list in the issue notes before editing.
    - [ ] **C1.2** Agree the three facts the new copy must state: (a) AuraShare
      never stores file contents; (b) DTLS keeps the payload end-to-end encrypted,
      but TURN may relay the encrypted packets when a direct path fails; (c) the
      signaling Worker sees the room code, SDP/ICE and connection metadata.
      Check the “No tracking” point (L125) against the Cloudflare analytics
      beacon allowed in `frontend/public/_headers` — soften or remove it if the
      beacon makes it false.
    - [ ] **C1.3** Rewrite `HERO.subtitle` (L21–22). Remove “directly” as an
      unconditional claim and “no server in the path”; keep one sentence, plain
      tone, and mention the TURN fallback without turning the hero into a
      networking lecture.
    - [ ] **C1.4** Rewrite `PRIVACY.title` (L119) and `PRIVACY.subtitle` (L121).
      Title must no longer say files never touch a server; subtitle must no longer
      claim the server never sees metadata. Keep the section about what is and is
      not stored.
    - [ ] **C1.5** Update the supporting copy that repeats the same claim:
      `HOW_IT_WORKS.subtitle` (L39), `mechanismTail` (L74), `PRIVACY.points`
      (L123–127), `PRIVACY.relayLabel` / `directLabel` / `caption` (L128–131).
      The labels must describe the direct lane **and** the TURN lane.
    - [ ] **C1.6** Align the FAQ answers that contradict the new wording:
      `different` (L143) says “connects your two devices directly” and `security`
      (L158) says the server “never sees file content”. Keep the second (still
      true) but qualify the first. Replace `FOOTER.trust` `NO SERVER` (L176)
      with a statement that is true, e.g. `NO FILE STORAGE`.
    - [ ] **C1.7** Update the tests that assert the old copy:
      `test/lib/landingCopy.test.ts:48` (`expect(PRIVACY.title).toContain('never
      touch a server')`), `test/layout/layout.test.tsx:86` (`NO SERVER`), and any
      `test/landing/landing.test.tsx` assertion that reads `PRIVACY.*` or
      `FOOTER.trust` (L72, L83, L112).
    - [ ] **C1.8** Re-read the whole file and grep the repository for
      `no server`, `never touch a server`, `NO SERVER`, `never sees your files`,
      `steps out of the path` to prove no old claim survives. Cross-check every
      new sentence against the TURN behaviour documented in `docs/api.md` and
      `backend/modules/turn.ts`.

- [ ] **C2. Correct `frontend/src/components/ui/PathDiagram.tsx`.**

  The comment and aria-label say file data travels directly between devices and
  never touches a server. Add the TURN fallback so the diagram and its accessible
  description match the real transport.

    - [ ] **C2.1** Choose the visual treatment and write it down: either (a) add a
      TURN node on the data lane with a dashed fallback segment, or (b) keep the
      single data lane and label it “direct, or relayed via TURN”. Keep the flat
      SVG style — no gradient, blur or glow.
    - [ ] **C2.2** Update the component doc comment (L7–12) so it describes the
      handshake relay, the direct data path **and** the TURN fallback.
    - [ ] **C2.3** Rewrite the `aria-label` (L19) to match the new drawing. It
      must not say file data always travels directly; it must mention that TURN
      relays the encrypted packets when a direct path cannot be established.
    - [ ] **C2.4** Implement the chosen treatment inside the SVG (L35–63). If a
      TURN node is added, adjust the `viewBox` and the label positions so nothing
      overlaps at mobile width; use the existing `text-3` / `accent` tokens.
    - [ ] **C2.5** Keep the diagram and `PRIVACY.caption` in sync (C1.5). Both
      the Hero and the Privacy section render this component
      (`Hero.tsx:80`, `PrivacySection.tsx:47`), so one caption change covers both.
    - [ ] **C2.6** Add or update a test for the accessible name — at minimum an
      assertion that the SVG’s label contains “TURN” or “relayed”, so the old
      direct-only wording cannot come back silently.

- [ ] **C3. Correct `README.md`.**

  Remove “No servers, no limits”. State the real limits (256 MiB per file, 32
  files per transfer, 1 MiB text) and the Worker + TURN topology.

    - [ ] **C3.1** Rewrite the opening paragraph (L3): remove “No servers, no
      limits” and the unqualified “Files flow directly”; state that a Worker
      handles signaling and TURN may relay encrypted traffic when a direct path
      fails.
    - [ ] **C3.2** Add a short **Limits** subsection with the real values from
      source: 256 MiB per file (`MAX_FILE_SIZE`), 32 files per transfer
      (`MAX_FILES_PER_TRANSFER`), 1 MiB text (`MAX_TEXT_BYTES`), two peers per
      room, and the six-character code.
    - [ ] **C3.3** Update the architecture ASCII diagram (L42–52) and the
      paragraph at L54. Show the TURN fallback as a branch of the WebRTC path and
      stop saying file data never touches the server.
    - [ ] **C3.4** Describe the actual topology in prose: browser ↔ RoomDO
      signaling, browser ↔ browser DataChannel, browser ↔ TURN when ICE cannot
      find a direct pair. Name what the server can and cannot see.
    - [ ] **C3.5** Cross-check the limits and topology against
      `frontend/src/lib/protocol.ts`, `frontend/src/lib/validation.ts`,
      `docs/api.md` and `backend/modules/turn.ts`; no number may be invented.

- [ ] **C4. Resolve the `shared/` layout rule.**

  Only `docs/`, `frontend/`, `backend/` and `test/` are allowed at the top level.
  Preferred: document `shared/` as an approved browser/Worker contract folder in
  a root `AGENTS.md`. Alternative: move the three contracts into `frontend/` and
  `backend/` with parity tests. Do not leave the exception undocumented.

    - [ ] **C4.1** Inventory the folder: `shared/heartbeat.ts`, `shared/ice.ts`,
      `shared/room-code.ts`. Record every import site (frontend, backend, test)
      so a move is not guesswork.
    - [ ] **C4.2** Decide Option A (document the exception) or Option B (move the
      files, keep parity tests). Write the decision and the reason in this
      checklist before touching code. Prefer A unless the folder keeps growing.
    - [ ] **C4.3** Option A: add `shared/` to the layout rules in the root
      `AGENTS.md` (C6), state that it holds only code imported by both the
      browser and the Worker, and add it to the README repository layout (M9.3).
    - [ ] **C4.4** Option B: move each contract to its owning side (Worker
      protocol vs browser protocol), duplicate only what both sides need, and add
      parity tests that fail if the copies diverge. Update the tsconfig path
      mappings in `tsconfig.app.json`, `tsconfig.worker.json` and
      `tsconfig.test.json` as part of the move.
    - [ ] **C4.5** Add a layout guard test under `test/` that lists the approved
      top-level directories and fails on an unapproved one. Keep an explicit
      allow-list for root config files (`wrangler.toml`, `package.json`, etc.).

- [x] **C5. Remove or relocate the root scratch scripts.**

  Both scripts were untracked, never committed, and referenced nowhere else in
  the repository. Per the user's direction they were **moved, not deleted**, to
  `test/manual/`, made portable, and documented.

  > **Later note (2026-11-15):** the owner then removed the whole test suite,
  > including `test/manual/`; this item remains history only.
  >
  > **Resolution 2026-11-15:** `check-filechooser.mjs` counts native file-picker
  > events after one dropzone click in Chromium and WebKit. `check-live-share.mjs`
  > stages a file against the deployed site and reports the transmission code,
  > console/API errors and a screenshot. Both now read the target from
  > `AURASHARE_URL`; the live probe resolves its sample file from the working
  > directory and creates the screenshot folder. Scripts
  > `test:manual:chooser` / `test:manual:live` were added, and
  > `test/manual/README.md` documents usage and side effects.

    - [x] **C5.1** Read both scripts and record purpose, hardcoded values and
      side effects: `check-filechooser.mjs` drove `localhost:5173`;
      `check-live-share.mjs` drove the production URL and hardcoded
      `<repo>/README.md` in `setInputFiles`.
    - [x] **C5.2** `git status --short` and `git log --all -- <file>` confirmed
      both were untracked and never committed. The user directed relocation
      instead of deletion, so no user work was discarded.
    - [x] **C5.3** Chosen: move them to `test/manual/` (inside `test/`, outside
      every collected suite).
    - [x] **C5.4** Done: hardcoded path replaced with `path.resolve()` on an env
      var, target URL made env-configurable, npm scripts added, and
      `test/manual/README.md` written.
    - [x] **C5.5** *(Not applicable — the scripts were moved, not deleted. The
      “no root scratch scripts” rule still lands with C6.)*

- [ ] **C6. Restore a short root `AGENTS.md`.**

  Cover the allowed top-level layout, the `shared/` decision, the approved root
  `wrangler.toml` exception, the test policy and the no-root-scratch rule.

    - [ ] **C6.1** Draft the file with these sections: Project layout, Where code
      lives, Approved exceptions, Verification, Git workflow, Do not.
    - [ ] **C6.2** Write the layout section: allowed top-level directories
      (`docs/`, `frontend/`, `backend/`, `test/`, plus `shared/` if C4 chooses
      Option A), root config files, and where a new file belongs.
    - [ ] **C6.3** Record the two approved exceptions with reasons: `shared/`
      (browser ↔ Worker contracts) and root `wrangler.toml` (Workers Builds runs
      `wrangler deploy` from the repository root).
    - [ ] **C6.4** Write the verification policy: which commands exist, what must
      pass before a PR, and the rule that a guard must be watched failing before
      it is called a guard. Do **not** bake this session’s temporary test ban into
      the repository rules.
    - [ ] **C6.5** Write the workflow and “do not” rules: feature branch → PR →
      green CI → merge; no commits to `main`; no root scratch scripts; no secrets
      in the tree. Reference `.opencode/AGENTS.md` instead of duplicating it, and
      re-read the result against C4 and the README layout.

---

## P1 — Major

- [ ] **M1. Extract the repeated brand markup into a shared `Brand` component.**

  `frontend/src/components/layout/LandingNav.tsx`,
  `LandingFooter.tsx` and `SiteNav.tsx` duplicate the logo + wordmark.

    - [ ] **M1.1** Create `frontend/src/components/ui/Brand.tsx` with explicit
      props for the element (`link` vs `button`), `href`/`onClick`, accessible
      label, logo size (`h-6` vs `h-7`) and motion variants. Keep the wordmark a
      `span`, never a heading.
    - [ ] **M1.2** Replace the brand block in `LandingNav.tsx` (L12–27) with
      `Brand`, preserving `fadeLeftVariants`, the `-my-2` / `py-2` tap target and
      the “back to top” label.
    - [ ] **M1.3** Replace the brand block in `LandingFooter.tsx` (L18–27).
      Confirm the footer still renders one link, not a nested interactive.
    - [ ] **M1.4** Replace the brand block in `SiteNav.tsx` (L16–32) with the
      button variant, preserving `aria-label="AuraShare — start over"` and the
      44px tap target.
    - [ ] **M1.5** Update `test/layout/layout.test.tsx` (brand names, “does not
      nest a heading” test at L66) and grep for leftover
      `[font-stretch:108%]` / `logo.svg` duplicates in the three files.

- [ ] **M2. Extract the repeated transmission-code panel.**

  `frontend/src/components/landing/Hero/Hero.tsx` and
  `frontend/src/components/features/SharingView.tsx` duplicate the same panel.

    - [ ] **M2.1** Create `frontend/src/components/features/TransmissionCodePanel.tsx`
      (or `ui/`) with props for the code value, caption, alignment and whether the
      code is a live room code or the static `A1B2C3` sample.
    - [ ] **M2.2** Replace the panel in `Hero.tsx` (L64–77) with the component,
      keeping the left-aligned hero treatment and the sample code.
    - [ ] **M2.3** Replace the panel in `SharingView.tsx` (L95–108) with the
      component, passing `state.roomId` and the centred alignment.
    - [ ] **M2.4** Keep the two visual differences as props, not as forked markup:
      hero is left-aligned, sharing view is centred; both keep the “6 characters”
      label and the divider caption.
    - [ ] **M2.5** Update `test/landing/landing.test.tsx` and
      `test/features/shareFlow.test.tsx` if they query the panel text; grep for
      “Transmission code” to find every assertion.

- [ ] **M3. Implement the ARIA tabs keyboard pattern in `ShareModeTabs.tsx`.**

  Add Arrow Left/Right/Home/End handling, roving `tabIndex` and focus that follows
  the selected tab.

    - [ ] **M3.1** Add a ref array for the two tab buttons and set
      `tabIndex={active ? 0 : -1}` on each tab.
    - [ ] **M3.2** Add an `onKeyDown` handler: ArrowRight/ArrowLeft move to the
      next/previous tab with wraparound; Home/End jump to the first/last. Ignore
      other keys and do not hijack vertical arrows.
    - [ ] **M3.3** After a keyboard move, call `actions.setShareMode(mode)` and
      move focus to the newly selected tab (focus in the same handler or after the
      state update, whichever the component structure supports).
    - [ ] **M3.4** Fix the dangling `aria-controls`: `ShareModeTabs.tsx:32` points
      at `share-panel-${mode}`, but `ShareInputView.tsx:18` renders only the active
      panel, so the inactive tab controls a missing id. Either render both panels
      with the inactive one hidden, or make `aria-controls` resolve for both tabs.
    - [ ] **M3.5** Add tests in `test/features/shareInput.test.tsx` (after L145):
      ArrowRight selects files, ArrowLeft wraps from text to files, Home/End, and
      exactly one tab has `tabIndex="0"`. Keep the existing click tests passing.
    - [ ] **M3.6** Confirm the roving tabindex does not break the visual underline
      (`layoutId="activeTab"`) and that the tab list still exposes
      `aria-selected` correctly to assistive technology.

- [ ] **M4. Hide collapsed FAQ answers from assistive technology in `FAQItem.tsx`.**

  The `grid-rows-[0fr]` animation leaves collapsed text in the accessibility tree.
  Add `hidden`, `inert` or `aria-hidden` while collapsed.

    - [ ] **M4.1** Choose the mechanism. `hidden` would kill the grid animation;
      prefer `inert={!open}` plus `aria-hidden={!open}` on the panel so the text
      leaves the accessibility tree while the CSS transition still runs.
    - [ ] **M4.2** Apply it to the panel in `FAQItem.tsx` (L37–49), keeping
      `role="region"` and `aria-labelledby` for the open state.
    - [ ] **M4.3** Verify there are no focusable children inside the collapsed
      panel today (there are not); if one is added later, `inert` must stay.
    - [ ] **M4.4** Add a test in `test/landing/landing.test.tsx` (FAQ accordion,
      L128–160): the closed panel is `aria-hidden`/inert and its answer is not
      reachable; the open panel is exposed.
    - [ ] **M4.5** Check the reduced-motion path and the `motion-tokens` E2E
      contract: the transition must still be measurable when the panel is not
      hidden by `display: none`.

- [ ] **M5. Add route-change focus and title management.**

  `frontend/src/lib/router.ts` and `App.tsx` do not update `document.title` or move
  focus after navigation. Focus the new page heading/main and set a route title.

    - [ ] **M5.1** Define a route metadata map (path → title) in one place, e.g.
      `frontend/src/lib/routes.ts`: `/` → the current landing title, `/app` →
      “Transfer — AuraShare”, fallback → landing title.
    - [ ] **M5.2** Apply `document.title` on initial render and on every route
      change, including back/forward (`popstate`), not only on `navigate()`.
    - [ ] **M5.3** Add `tabIndex={-1}` to both `<main id="main-content">`
      elements (`LandingPage.tsx:22`, `AuraApp.tsx:32`) so they can receive focus
      programmatically, and suppress the focus ring for programmatic focus.
    - [ ] **M5.4** Move focus to the new route’s `<main>` after a route change,
      but **not** on the first render (that would steal focus on page load). Use a
      ref/flag to skip the initial mount.
    - [ ] **M5.5** Preserve the skip link: it must still move focus into
      `#main-content`, and the lazy `Suspense` loader must not steal focus back
      when the app chunk resolves.
    - [ ] **M5.6** Add tests (extend `test/lib/router.test.ts` or add an `App`
      test): title changes for `/` and `/app`, focus lands on `main` after
      `navigate('/app')`, and no focus move on initial render.

- [ ] **M6. Announce dynamic errors in `ErrorView.tsx`.**

  Add `role="alert"` or an `aria-live` region so a failed connection is announced.

    - [ ] **M6.1** Add `role="alert"` to the message container in `ErrorView`
      (`frontend/src/components/features/SuccessView.tsx:68–92`); the live region
      must exist before the text changes, so put the role on the wrapper that is
      mounted with the view.
    - [ ] **M6.2** Make the error programmatically labelled: give the “Connection
      failed” line a real heading (`h2`) and associate it with the message, or
      include the heading text inside the alert.
    - [ ] **M6.3** Decide whether to move focus. If yes, focus the heading or the
      “Try again” button with `tabIndex={-1}`; do not trap focus and do not steal
      it if the user has already moved elsewhere.
    - [ ] **M6.4** Check for double announcement: the view is keyed
      (`AuraApp.tsx:58`) inside `AnimatePresence`, so confirm the alert mounts once
      per error, not on every re-render.
    - [ ] **M6.5** Add a test in `test/features/` asserting
      `getByRole('alert')` contains the message and the retry button is still
      reachable.

- [ ] **M7. Complete socket-error cleanup in `backend/modules/room-do.ts`.**

  `webSocketError` revokes auth and closes the socket but does not notify the other
  peer with `peer-left` or call `releaseIfEmpty`. Mirror `webSocketClose` and add a
  test for the error path.

    - [ ] **M7.1** Make `webSocketError` (L130–134) mirror `webSocketClose`
      (L114–128): revoke auth, notify the other sockets with `peer-left`, then
      `close(1011, …)` inside a `try/catch`.
    - [ ] **M7.2** Call `await this.releaseIfEmpty(ws)` after the close so an
      errored last peer releases the room’s storage instead of waiting for the
      alarm.
    - [ ] **M7.3** Make the notification idempotent: workerd may invoke both the
      error and close handlers for one socket. Have `revoke` report whether the
      socket was still authorized, and only send `peer-left` / release once.
    - [ ] **M7.4** Keep the `console.error('[RoomDO] websocket error:', error)`
      log; do not log tokens or attachment contents.
    - [ ] **M7.5** Update `test/worker/worker.test.ts` around L437: assert the
      peer receives `peer-left`, the errored socket is closed with 1011, and
      `deleteAllCalls()` increments when it was the last peer. Add a case where a
      peer remains, so storage is **not** released.

- [ ] **M8. Measure backend and shared coverage.**

  `vitest.config.ts` includes only `frontend/src/**`. Add `backend/**` and
  `shared/**` to coverage, or define an explicit separate threshold.

    - [ ] **M8.1** Inventory which backend and shared files are already exercised
      by `test/worker/*` and `test/lib/*`; list genuinely untested files before
      changing the config.
    - [ ] **M8.2** Add `backend/**` and `shared/**` to `coverage.include` in
      `vitest.config.ts` (L27).
    - [ ] **M8.3** Exclude files that are entry points or type-only shims from the
      threshold (for example `backend/index.ts` if it is only wiring), but keep
      them in the report. Document every exclusion.
    - [ ] **M8.4** Set separate thresholds for the backend if the global 80/80/80/80
      is not realistic: use per-glob threshold keys if the installed Vitest
      supports them, otherwise add a second coverage script/config.
    - [ ] **M8.5** When test execution is permitted, run coverage once, record the
      measured statements/branches/functions/lines per area, then set the
      thresholds just below the measured floor. Do not guess the numbers.
    - [ ] **M8.6** Update the README Quality paragraph (L125–128), which currently
      says “80% over all of `frontend/src/`”, to match the new scope.

- [ ] **M9. Refresh stale README facts.**

  Motion 12 → Motion 14; “ambient, organic UI” → the “Field Instrument” direction;
  add `shared/` to the repository layout; remove “No limits”.

    - [ ] **M9.1** Change the stack table `Motion 12 (Framer Motion)` (L13) to the
      installed major (`motion@^14.14.0`). Verify every other row against
      `package.json` at the same time.
    - [ ] **M9.2** Replace “ambient, organic UI” (L3) with the actual design
      direction used in `frontend/src/styles/tokens.css`: “Field Instrument —
      precision network equipment”.
    - [ ] **M9.3** Add `shared/` to the repository-layout block (L34–40) once C4
      decides its status, and describe it in one line.
    - [ ] **M9.4** Remove “No limits” and any remaining “No servers” claim (this
      overlaps C3.1; do them in the same edit so the two copies cannot drift).
    - [ ] **M9.5** Re-check the docs list at L39 (“API contract, test report,
      audits, redesign plan”) after M13 archives the historical docs.

- [ ] **M10. Fix stale code comments.**

  `frontend/vite.config.ts` refers to `backend/wrangler.toml` (the file is at the
  root). `backend/index.ts` says the DO stores only the mint time, but socket
  attachments also hold tokens, credentials and quota state.

    - [ ] **M10.1** In `frontend/vite.config.ts`, fix L8 (`backend/wrangler.toml
      → assets.directory`) and L40–41 (“`backend/.wrangler/` when running from
      the backend config”) to name the root `wrangler.toml` and the actual
      `.wrangler/` location.
    - [ ] **M10.2** In `backend/index.ts` L7–9, replace “the DO holds the time its
      code was minted and nothing else” with the accurate split: storage holds the
      mint time; per-socket authorization, TURN credentials and issuance quota
      live in hibernatable socket attachments and are revoked when the socket
      leaves.
    - [ ] **M10.3** Grep the repository for `backend/wrangler` and for “nothing
      else” / “only the mint time” to catch other copies; confirm the diff is
      comment-only with no behaviour change.

- [ ] **M11. Remove the session-specific note from `docs/api.md`.**

  The final “Tests have not been executed…” paragraph is audit status, not part of
  the API contract.

    - [ ] **M11.1** Delete the final paragraph (“Unit/contract and E2E fixtures are
      updated for v2. Tests have not been executed…”) from `docs/api.md`.
    - [ ] **M11.2** Remove or reword the release-status sentence “Unit/contract and
      E2E fixtures are updated for v2” — a contract document should describe the
      contract, not the state of a work session.
    - [ ] **M11.3** Make the errors/verification table the stable ending, then grep
      `docs/` for other “this session”, “not been executed” or “user’s no-tests”
      notes and move them to `docs/PROCESS_NOTES.md` if the history matters.

- [ ] **M12. Clean generated/local dead weight.**

  `test-results/.last-run.json`, `coverage/`, `dist/`, `backend/.wrangler/`,
  `.wrangler/` and `.playwright-mcp/` console logs. Confirm before deleting;
  rebuild `dist/` when it is needed again.

    - [ ] **M12.1** For each path, check `git check-ignore -v <path>` and
      `git ls-files <path>`: confirm it is ignored and untracked. Current sizes:
      `coverage/` 1.2M, `dist/` 1.0M, `backend/.wrangler/` 8K, `.wrangler/` 20M,
      `.playwright-mcp/` 2.4M, `test-results/` 8K.
    - [ ] **M12.2** Ask the user before deleting anything; `.wrangler/` contains
      local Durable Object state and `.playwright-mcp/` may contain screenshots
      or console logs the user still wants.
    - [ ] **M12.3** Delete the approved paths only; never delete source,
      `node_modules/` or tracked files.
    - [ ] **M12.4** Keep `dist/` if it is needed to serve a local preview, and
      rebuild it with `npm run build` when that becomes necessary (build
      execution is deferred under the current ban).
    - [ ] **M12.5** Record what was removed and the reclaimed size in this item so
      the next audit does not re-litigate it.

- [ ] **M13. Archive or delete delivered and historical docs.**

  `docs/PROJECT_AUDIT_2026-11-12.md`, `docs/TEST_REPORT.md`,
  `docs/FRONTEND_REDESIGN_PLAN.md` and `docs/ISSUES_11_15_PLAN.md`. Move them to
  `docs/archive/` if the history is wanted, otherwise remove them. Keep
  `docs/api.md`, `docs/DEPLOYMENT.md`, `docs/MAINTENANCE_PLAN.md` and
  `docs/PROCESS_NOTES.md`.

    - [ ] **M13.1** Decide keep / archive / delete for each of the four files;
      record the decision with a one-line reason per file.
    - [ ] **M13.2** If archiving, create `docs/archive/README.md` with a table:
      file, date, status (superseded/delivered), and the current document that
      replaces it.
    - [ ] **M13.3** Move the approved files with `git mv` so history follows
      them; do not copy-and-delete.
    - [ ] **M13.4** Update every link to a moved file: at least
      `docs/MAINTENANCE_PLAN.md:188` (`docs/TEST_REPORT.md`) and any references
      inside the archived documents themselves. Grep for each filename.
    - [ ] **M13.5** Keep `docs/api.md`, `docs/DEPLOYMENT.md`,
      `docs/MAINTENANCE_PLAN.md`, `docs/PROCESS_NOTES.md` and this checklist in
      place; verify nothing in the active set links to a deleted file.
    - [ ] **M13.6** Update the README docs description (L39) and any “see …” line
      that still points at the old locations.

---

## P2 — Minor

- [ ] **m1. Enforce the documented 16 KiB chunk ceiling on receive.**

  `frontend/src/lib/transfer.ts` and `transfer-protocol.ts` accept binary payloads
  larger than the documented limit.

    - [ ] **m1.1** Confirm the contract: `docs/api.md:100` says “Payloads are at
      most 16 KiB”; the sender caps the payload at
      `Math.min(16 * 1024, maxFrame() - HEADER_BYTES)` in `transfer.ts:246`.
      Decide whether the limit is payload-only or includes the 20-byte header and
      write the answer down.
    - [ ] **m1.2** Add an exported `MAX_CHUNK_BYTES` (or similarly named) constant
      next to `HEADER_BYTES` in `transfer-protocol.ts` so sender and receiver read
      the same number.
    - [ ] **m1.3** Enforce it in `readChunk` (`transfer-protocol.ts:55–62`):
      reject a frame whose payload exceeds the ceiling instead of slicing it.
      Keep the existing `<= HEADER_BYTES` rejection.
    - [ ] **m1.4** Decide the failure mode: `readChunk` returning `null` currently
      produces `fatal('Invalid binary frame')` in `transfer.ts:188`. Either keep
      that or add a distinct “Oversized binary frame” reason so the user-facing
      message is accurate.
    - [ ] **m1.5** Add tests in `test/lib/transfer-protocol.test.ts` (L103–106)
      and `test/p2p/transfer.test.ts` (chunk validation, L301+) for exactly
      16 KiB (accepted) and 16 KiB + 1 byte (rejected). Update `docs/api.md` only
      if the header-inclusive decision changes the wording.

- [ ] **m2. Remove duplicated motion constants.**

  `frontend/src/lib/motion.ts` repeats the durations and easing defined in
  `frontend/src/styles/tokens.css`. Derive them or add a parity test.

    - [ ] **m2.1** Reconcile the easing story first: `motion.ts:15` uses
      `EASE_OUT = [0.16, 1, 0.3, 1]` (matching `--ease-out`), while the tokens also
      define `--ease-standard: cubic-bezier(0.4, 0, 0.2, 1)` and the FAQ uses it.
      The comment at `motion.ts:7` says “one easing curve”; make the comment and
      the tokens agree.
    - [ ] **m2.2** Export the numeric motion constants (micro/standard/enter and
      both curves) from one module and build the variants from them, so there is
      one TypeScript source.
    - [ ] **m2.3** Add a unit parity test that reads `frontend/src/styles/tokens.css`
      and compares `--duration-micro|standard|enter` and the easing values with
      the exported constants. `test/e2e/motion-tokens.spec.ts` only checks the
      computed browser styles; it does not catch a TS/CSS drift.
    - [ ] **m2.4** Keep the visual result identical: no duration, easing or
      stagger value may change. Diff the variant objects before/after.

- [ ] **m3. Align theme colours and add PWA icons.**

  `frontend/index.html` and `frontend/public/manifest.webmanifest` use `#0c0c0e`
  while the design token is `#0e0e0c`. Add 192 px and 512 px PNG icons alongside
  the SVG.

    - [ ] **m3.1** Change `frontend/index.html:9` (`theme-color`) and
      `manifest.webmanifest:7–8` (`background_color`, `theme_color`) to `#0e0e0c`.
      Consider defining the theme colour in one place if the build can inject it.
    - [ ] **m3.2** Generate 192×192 and 512×512 PNG icons from `logo.svg` (use an
      existing image tool; do not add a runtime dependency). Store them in
      `frontend/public/`.
    - [ ] **m3.3** Add both PNGs to `manifest.webmanifest.icons` with the correct
      `sizes` and `type: "image/png"`. Add a 180×180 `apple-touch-icon` PNG to
      `index.html` (iOS does not use the SVG for the home screen).
    - [ ] **m3.4** Extend `test/app/pwa.test.ts`: theme/background colour equals
      the token value, and the manifest lists a 192 and a 512 icon that exist on
      disk.
    - [ ] **m3.5** Keep the existing “no maskable icon it does not have” test
      passing: every icon entry must still have `purpose: "any"` (or a real
      maskable asset if one is added).

- [ ] **m4. Tighten the CSP in `frontend/public/_headers`.**

  Narrow `connect-src ... wss:` so it does not allow every WSS host; add
  `object-src 'none'` and `base-uri 'none'`.

    - [ ] **m4.1** Confirm the signaling socket is same-origin in production. If
      it is, `'self'` covers `wss://aurashare.hassanali.site` (CSP allows the
      secure WebSocket upgrade for the same host); if a cross-origin relay is ever
      used, add that exact host instead of the `wss:` scheme.
    - [ ] **m4.2** Replace the blanket `wss:` in `connect-src` with `'self'` (and
      an explicit host only if m4.1 finds one).
    - [ ] **m4.3** Add the missing directives: `object-src 'none'`,
      `base-uri 'none'`, `frame-ancestors 'none'` (belt-and-braces with
      `X-Frame-Options: DENY`) and `form-action 'self'`.
    - [ ] **m4.4** Update `test/lib/securityHeaders.test.ts`: assert that
      `connect-src` does not contain the bare `wss:` scheme, and that
      `object-src` / `base-uri` are present and `'none'`.
    - [ ] **m4.5** Check the dev path separately: `_headers` is a static-asset
      file served by the Worker, so the Vite dev server does not apply it. Confirm
      the production policy still allows the same-origin WebSocket and that no
      STUN/TURN URL is governed by `connect-src`.

- [ ] **m5. Add an empty state to `ReceiverFileList.tsx`.**

  An empty descriptor list currently renders “0 files ready” with no explanation.

    - [ ] **m5.1** Add a branch for `state.receivedFiles.length === 0` before the
      count header: explain that the sender is still preparing the transfer and
      that files will appear here.
    - [ ] **m5.2** Use `role="status"` (polite) rather than `alert`; an empty list
      is not an error.
    - [ ] **m5.3** Do not render an empty bordered `Panel` with no rows; either
      skip the panel or render a single placeholder row with the message.
    - [ ] **m5.4** Add a test in `test/features/receiver.test.tsx` for the empty
      list and keep the populated-list assertions unchanged.

- [ ] **m6. Decide the rate-limit fail-open behaviour.**

  `backend/modules/rate-limit.ts` lets requests through when the limiter throws.
  It is tested and deliberate; document it as an availability decision or fail
  closed for the expensive room routes.

    - [ ] **m6.1** Confirm the scope: only `rateLimited()` in
      `backend/modules/routes.ts:96–100` uses `allowRequest`, and it guards
      `POST /api/room` plus the real WebSocket upgrade. The TURN credential
      limiter in `peer-auth.ts:72` is a separate mechanism — do not conflate them.
    - [ ] **m6.2** Decide: keep fail-open (availability) or fail-closed for the two
      room routes. Consider that failing closed on a broken binding turns a
      degraded limiter into a full outage, while failing open can spend the daily
      DO budget.
    - [ ] **m6.3** If keeping fail-open: expand the comment in `rate-limit.ts:43–47`
      with the decision and the trade-off, and add a short subsection to
      `docs/DEPLOYMENT.md` near the rate-limiting section (L222+).
    - [ ] **m6.4** If failing closed: return `false` from the catch path, keep the
      `429`/`Retry-After` response, and make sure the TURN credential limiter’s
      “missing binding fails closed” statement in `docs/DEPLOYMENT.md:158` is not
      confused with the room limiter.
    - [ ] **m6.5** Update `test/worker/worker.test.ts` for the chosen behaviour:
      a limiter that throws either allows the request (current test) or returns
      429; assert the chosen contract explicitly.

- [ ] **m7. Ignore local environment files.**

  Add `.env*` and `.dev.vars` to `.gitignore`. No secret files are tracked today.

    - [ ] **m7.1** Add `.env`, `.env.*`, `!.env.example` and `.dev.vars`,
      `.dev.vars.*` to `.gitignore` (Wrangler reads `.dev.vars`).
    - [ ] **m7.2** Keep an `.env.example` tracked if one exists or is added; the
      negation must come after the `.env.*` pattern.
    - [ ] **m7.3** Run `git ls-files | grep -E '\.env|\.dev\.vars'` and confirm no
      secret file is tracked. If one is, stop and report it before changing
      history.
    - [ ] **m7.4** Confirm the production secrets stay in the Cloudflare dashboard
      (`TURN_KEY_ID`, `TURN_KEY_API_TOKEN`) as described in `docs/DEPLOYMENT.md`;
      no local file is required for deploys.

- [ ] **m8. Bump `eslint-plugin-react-refresh` from 0.5.7 to 0.5.8.**

  Patch-level update; no source change expected.

    - [ ] **m8.1** Confirm 0.5.8 exists and is the latest patch
      (`npm view eslint-plugin-react-refresh version`).
    - [ ] **m8.2** Install it as a dev dependency and let npm update
      `package.json` and `package-lock.json` together.
    - [ ] **m8.3** Inspect `eslint.config.js` for any option that changed in the
      patch; no config edit is expected.
    - [ ] **m8.4** Defer `npm run lint` under the current ban; record the version
      change and the unrun check in this item.

- [ ] **m9. Re-verify the dependency audit.**

  `npm audit` failed during the audit because the registry request failed. Re-run
  it when the registry is reachable; the 2026-11-14 record reported zero
  vulnerabilities.

    - [ ] **m9.1** Confirm the npm registry is reachable (`npm ping`).
    - [ ] **m9.2** Run `npm audit --audit-level=high` and capture the full output.
    - [ ] **m9.3** If findings appear: assess reachability, patch or document the
      accepted risk, and do not suppress the report.
    - [ ] **m9.4** Record the date, command, result and any accepted advisories in
      this item. If the registry is still down, mark it blocked rather than
      ticking it.

- [ ] **m10. Keep the TypeScript 6 and `@types/node` 24 holds documented.**

  Both are intentional. Revisit TypeScript 7 when `typescript-eslint` publishes a
  peer range compatible with it.

    - [ ] **m10.1** Add a “Dependency holds” section to
      `docs/MAINTENANCE_PLAN.md` explaining why `typescript` stays at `~6.0.3`.
    - [ ] **m10.2** Record the peer range that causes the hold:
      `typescript-eslint@8.72.2` accepts `>=4.8.4 <6.1.0`, so TypeScript 6.0.x is
      the current ceiling.
    - [ ] **m10.3** Record why `@types/node` stays on 24: it matches the Node 24
      floor in `package.json.engines` (`^22.22.2 || ^24.15.0 || >=26.0.0`), not
      the newest published types.
    - [ ] **m10.4** Add the revisit trigger: upgrade both when
      `typescript-eslint` widens its peer range, then re-check the tsconfigs and
      CI together.

---

## Suggested Work Order

Group the fixes so each batch is reviewable and does not fight itself:

1. **Copy truth:** C1 → C2 → C3 → M9. One PR, because all four describe the same
   transport; splitting them lets the claims drift again.
2. **Layout rules:** C4 → C6 → C5. The `shared/` decision must land in the root
   `AGENTS.md` in the same PR that adds the file.
3. **Accessibility:** M3 → M4 → M5 → M6. All are keyboard/AT behaviour; run one
   accessibility pass after the batch when tests are allowed.
4. **Backend correctness:** M7 → m6 → M8. Error cleanup, the rate-limit decision
   and the coverage scope touch the same Worker tests.
5. **Docs and hygiene:** M10 → M11 → M12 → M13 → m7 → m10. Low risk, no runtime
   behaviour.
6. **Small hardening:** m1 → m2 → m3 → m4 → m5 → m8 → m9. Independent patches;
   each can land alone.

---

## Already Verified (No Action)

- `docs/api.md` matches the implemented routes, error codes and transfer protocol.
- Backend layers are clear; input validation and error shapes are consistent; no
  hardcoded secrets are tracked.
- Tests are organised by block under `test/`; every block has normal-path, edge
  and bad-input coverage by inspection.
- No visual AI-slop tells: custom fonts, one amber accent, left-aligned hero,
  tables instead of three equal icon cards, no gradients, glow or glassmorphism.
- Design tokens are used throughout the components; skip links, focus rings,
  tap-target tests and reduced-motion support exist.
- Responsive coverage includes Chromium, WebKit and two mobile projects.

## Audit Limitations

- No tests, lint, typecheck or build were run (user instruction). Every “verify”
  task above is therefore static until the ban is lifted.
- Brave Search MCP hit its free-plan rate limit; versions were verified against
  the npm registry on 2026-11-15.
- `npm audit` could not complete (m9 remains blocked).
- The two `check-*.mjs` probes existed before the audit and are now relocated to
  `test/manual/` (C5, done); they are manual probes, not collected by any suite.
