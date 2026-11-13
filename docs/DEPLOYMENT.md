# Deployment

AuraShare is one Cloudflare Worker. It does two unrelated jobs: it relays the
signalling frames between the two peers of a session, and it serves the built
SPA. **File contents never pass through it** — they travel peer to peer over a
WebRTC data channel.

| | |
|---|---|
| **Live URL** | `https://aurashare.hassanali.site` |
| **workers.dev URL** | `https://aurashare.hassanali205031.workers.dev` |
| **Worker name** | `aurashare` |
| **Zone** | `hassanali.site` (custom domain `aurashare.hassanali.site`) |
| **Deploy** | Cloudflare Workers Builds — automatic on every push to `main` |
| **Contract** | [`docs/api.md`](api.md) |

## There is no deploy step

**Workers Builds deploys the Worker on every push to `main`.** The
`Workers Builds: aurashare` check on the commit is the deploy: it runs
`npx wrangler deploy` from the repository root, and it fails the build if the
deploy fails.

So the normal loop is: push to a branch, open a pull request, let CI run,
merge. The deployment follows the merge. `npm run deploy` exists for a local
deploy when you need one, and it is **not** part of the normal flow.

> **`wrangler.toml` stays at the repository root.** Wrangler only searches the
> working directory and its ancestors, so a config inside `backend/` is not
> found and the build fails with *"Missing entry-point to Worker script or to
> assets directory"*. All the server *code* lives in `backend/`; only the
> descriptor is at the root.

## Checking a deployment

The fastest check is the live one:

```bash
LIVE_URL=https://aurashare.hassanali.site npm run test:live
```

It runs six checks against the deployed Worker — the landing page, the app
screen, the ICE server list, room minting, and the two error shapes from the
API contract. It is skipped unless `LIVE_URL` is set, so the normal suite
never depends on a deployment being up.

To see what is actually deployed:

```bash
# the account's Worker scripts and when they last changed
cf workers scripts search

# the domains attached to one script
cf workers scripts get aurashare --help
```

## Authenticating

Two tools, one account.

```bash
npx wrangler login     # Wrangler — used by this project, it has wrangler.toml
cf auth login           # the Cloudflare CLI (beta) — the whole API, JSON output
```

Both open a browser and store an OAuth token in your home directory. **Both
tokens expire, and the refresh token expires with them** — when that happens
the only way back in is to log in again. A Wrangler token that has expired
says so plainly:

```
✘ ERROR: Not logged in. Your auth token has expired and could not be
  refreshed, and the environment is non-interactive.
```

## The SPA deep link, and why `curl` lies about it

`/app` is the app screen. A browser navigating to it gets the SPA. **A plain
`curl` does not** — it gets a JSON 404:

```bash
curl https://aurashare.hassanali.site/app
# {"error":{"code":"not_found","message":"Not found"}}   ← HTTP 404
```

That is not a bug. Cloudflare's static-asset router serves `/index.html` for
a **navigation request** — one that carries `Sec-Fetch-Mode: navigate`, which
browsers attach automatically — and only for those. Everything else that
matches no asset falls through to the Worker, which answers with its JSON
error. Same URL, two different answers depending on who is asking.

Check it the way a browser asks:

```bash
curl -H 'Sec-Fetch-Mode: navigate' https://aurashare.hassanali.site/app
# 200, text/html, the SPA shell
```

`fetch()` in the browser and in Node cannot make this request: the Fetch
standard forbids `Sec-`-prefixed headers, so they are stripped before the
request leaves. `test/live/deployment.test.ts` therefore sends it over raw
HTTP instead.

## TURN credentials

**TURN is not configured.** `/api/ice-servers` returns the three STUN servers
and no TURN entry.

STUN is enough for most peers: it discovers the public address of a NAT, and
if the NAT is a normal cone or port-preserving mapping, the two peers can
reach each other. It is **not** enough behind a symmetric NAT, where the
mapping differs per destination — the most common case on a corporate or
mobile network. Those peers simply cannot connect, and the failure looks like
a timeout rather than an error.

To turn TURN on:

1. Create a TURN key in the dashboard: **Cloudflare → Calls → Turn
   Applications → Add**. It gives you a key ID and an API token.
2. Set them on the Worker:

   ```bash
   npx wrangler secret put TURN_KEY_ID
   npx wrangler secret put TURN_KEY_API_TOKEN
   ```

3. Deploy, and check that the endpoint now returns a TURN entry:

   ```bash
   curl https://aurashare.hassanali.site/api/ice-servers
   # {"iceServers":[...,{"urls":"turn:...","username":"...","credential":"..."}]}
   ```

The credentials are **ephemeral**: the Worker mints them per isolate with a
24-hour TTL and re-mints them an hour before they expire, so nothing
long-lived is ever handed to a browser. The endpoint falls back to STUN-only
if the Cloudflare API is unreachable — it never returns an error, because a
connection timeout is a better failure than a broken app.

## Durable Objects

The signalling relay is a Durable Object, one instance per transmission code,
addressed by `env.ROOMS.idFromName(code)`.

- It holds no persisted state — only the live sockets.
- It hibernates between messages, so an idle room costs nothing.
- An alarm evicts the room after 30 minutes of inactivity.

Migrations are declared in `wrangler.toml` and applied by the deploy:

```toml
[[durable_objects.bindings]]
name = "ROOMS"
class_name = "RoomDO"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["RoomDO"]
```

`class_name` must match the exported class name, and the class must be
re-exported from the entry point — `backend/index.ts` does both, even though
the class itself lives in `backend/modules/room-do.ts`.

## The signing relay is a dumb pipe

The Worker never parses, validates or transforms a signalling frame. Whatever
one peer sends arrives at the other byte for byte. Validation is the client's
job, in `frontend/src/lib/protocol.ts` — a frame that does not match one of
the documented shapes is dropped before it reaches the WebRTC layer.

This matters when reading the Worker code: there is nothing to validate
there, and adding validation would change the contract in
[`docs/api.md`](api.md).

## If a deploy goes wrong

| Symptom | Usual cause |
|---|---|
| The build fails with *"Missing entry-point to Worker script"* | `wrangler.toml` is not at the repository root |
| The build fails with a missing `class_name` | The Durable Object class was renamed or is no longer re-exported from `backend/index.ts` |
| The landing page loads but `/app` 404s | The assets are not being served — check that `dist/` was built and that `[assets]` in `wrangler.toml` still points at it |
| The app connects and then drops | Usually ICE, not the Worker — check `/api/ice-servers` and whether TURN is configured |
| The Worker is up but old | The deploy did not run — check the `Workers Builds: aurashare` check on the commit |
