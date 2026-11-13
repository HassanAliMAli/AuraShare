# Working notes

Short notes on things that cost time, written down so the next session does
not pay for them again. Each one is a mistake that was actually made here,
not a hypothetical.

## `gh api -f body=@file` does not read the file

```bash
gh api -X PATCH repos/:owner/:repo/pulls/7 -f body=@body.md   # ✗
```

`-f` takes a literal string. `@body.md` becomes the body of the pull request
— the four characters `@body.md` — and the API accepts it without complaint.

Read the file into the argument instead:

```bash
gh api -X PATCH repos/:owner/:repo/pulls/7 -f body="$(cat body.md)"   # ✓
```

The same applies to any `gh` flag that takes a string. `--raw-field` has the
same behaviour. The only file-reading flags are the ones documented as such
(`--input`, for a request body).

**Check the result, not the command.** A pull request whose body is
`@body.md` is visible immediately — but it is the kind of mistake that gets
found by a reviewer instead of by you.

## "Verified to fail" means you ran it

A test that guards a bug is only worth what its verification is worth. The
useful claim is not *"this test would catch it"* — it is *"I put the bug back
and watched this test fail, and here is the message it printed"*.

During the frontend redesign, a test was claimed to catch the WebKit file
remount defect. When the bug was put back, the test passed. The defect was
real; the guard was not. The difference between the two is one command:

```bash
# put the bug back
sed -i 's|<ShareInputView />|<ShareInputView key={state.shareMode} />|' \
  frontend/src/components/app/AuraApp.tsx

# watch the guard fail
npx playwright test share-input.spec.ts --project=chromium --project=webkit

# put the fix back
git checkout frontend/src/components/app/AuraApp.tsx
```

Do that for every guard you claim, and quote the failure message in the pull
request. It is also how the real bugs got found — the ICE guard failed for a
reason nobody had predicted, and that reason was the actual bug.

## Keep anything that matters inside the repository

`/tmp/opencode` is a scratch directory. A server restart, a container
recycle, or a cleanup job can empty it, and everything in it goes with it:
the throwaway scripts that proved a hypothesis, the before/after
measurements, the byte-level diff that found a protocol bug.

The permanent artefacts belong in the repo:

- a hypothesis worth keeping → a test in `test/`;
- a measurement worth keeping → a comment or a document;
- a script worth keeping → `test/e2e/` (the suite's own STUN server started
  this way).

The scratch directory is for the *process*, not for the *result*.

## A cancelled background run leaves the servers running

A background command that is cancelled — or that dies with the shell — does
not take its children with it. A half-finished Playwright run leaves Vite on
`:5173`, Wrangler on `:8787` and the STUN server on `:13478`, and the next
run reuses them. That is the stale-server problem the pre-flight guard now
catches, but the fix is to clean up in the first place.

Find the process and stop it by PID:

```bash
ss -lptn | grep -E ':5173|:8787|:13478'
kill <pid>
```

Do **not** use `pkill -f vite` to tidy up: the pattern also matches the
shell running the command itself, and the shell dies with it.

The same applies to a port that is still held after a crash — `wrangler dev`
writes its state into `.wrangler/`, and a second `wrangler dev` on the same
port fails with a confusing error rather than a clear one.
