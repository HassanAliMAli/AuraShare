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

## The content security policy

The policy lives in `frontend/public/_headers` and is applied to every
response by the Workers assets layer:

```
default-src 'self'; script-src 'self' https://static.cloudflareinsights.com;
style-src 'self' 'unsafe-inline'; connect-src 'self' wss:;
img-src 'self' data:; font-src 'self' data:
```

It is written by hand, so it drifts from the app silently — a directive
that is too tight does not fail the build, it fails in the browser. Two
allowances need a reason:

- **`font-src 'self' data:`** — the display face is inlined into the
  stylesheet as a `data:` URI. Without `data:` the browser refuses it and
  the live site quietly falls back to a typeface that is not the design.
- **`script-src 'self' https://static.cloudflareinsights.com`** — the
  Cloudflare Web Analytics beacon the edge injects into every HTML
  response. The **host** is allowed, not the script's path: the edge
  injects the beacon with a version segment (`/beacon.min.js/vce70...`),
  and a path source does not match that URL in Chrome — measured, the path
  form Cloudflare's own FAQ suggests is refused. The automatic setup
  reports to this domain's own `/cdn-cgi/rum`, so `connect-src 'self'`
  covers the upload.

Two things are deliberately **not** allowed:

- **`'unsafe-inline'` for scripts** — the tempting way to unblock an
  inline script, and the wrong way: it would let any injected script run.
  The stylesheet keeps it, because React needs it for inline styles.
- **Cloudflare's inline *JavaScript Detections* script** — it is a
  bot-detection helper, unrelated to the app, and its body holds the
  request's ray ID, so a hash would change on every response and
  allowing it would mean `'unsafe-inline'`. It stays blocked, and the
  console shows one CSP error for it on every page load.

`test/lib/securityHeaders.test.ts` guards all of this, including the
absence of `'unsafe-inline'` in `script-src`.

## TURN credentials

**TURN is configured.** The Worker holds a Cloudflare Calls TURN key, and
`GET /api/ice-servers` returns the STUN servers plus six TURN URLs with
ephemeral credentials:

```json
{
  "iceServers": [
    { "urls": "stun:stun.cloudflare.com:3478" },
    { "urls": "stun:stun.cloudflare.com:443" },
    {
      "urls": [
        "turn:turn.cloudflare.com:3478?transport=udp",
        "turn:turn.cloudflare.com:3478?transport=tcp",
        "turns:turn.cloudflare.com:5349?transport=tcp",
        "turn:turn.cloudflare.com:443?transport=udp",
        "turn:turn.cloudflare.com:80?transport=tcp",
        "turns:turn.cloudflare.com:443?transport=tcp"
      ],
      "username": "…",
      "credential": "…"
    }
  ]
}
```

STUN alone is enough for most peers: it discovers the public address of a
NAT, and if the NAT is a normal cone or port-preserving mapping, the two
peers can reach each other. It is **not** enough behind a symmetric NAT,
where the mapping differs per destination — the most common case on a
corporate or mobile network. Those peers simply cannot connect, and the
failure looks like a timeout rather than an error. TURN is what makes them
work.

The credentials are **ephemeral**: the Worker mints them per isolate with a
24-hour TTL and re-mints them an hour before they expire, so nothing
long-lived is ever handed to a browser. The endpoint falls back to STUN-only
if the Cloudflare API is unreachable — it never returns an error, because a
connection timeout is a better failure than a broken app.

### Rotating the key

The Worker reads two secrets, `TURN_KEY_ID` and `TURN_KEY_API_TOKEN`. They
hold the TURN key's ID and its API token. To rotate:

```bash
# 1. create a new key
cf realtime turn keys create --name "aurashare"

# 2. put its id and secret on the Worker
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_KEY_API_TOKEN

# 3. confirm the endpoint serves TURN again
curl https://aurashare.hassanali.site/api/ice-servers
```

The old key can then be deleted:

```bash
cf realtime turn keys list
cf realtime turn keys delete --key-id <id>
```


## Durable Objects

The signalling relay is a Durable Object, one instance per transmission code,
addressed by `env.ROOMS.idFromName(code)`.

- It holds **one** persisted row: the time its code was minted. That row is
  what makes a room real — a code nobody minted opens nothing.
- It hibernates between messages, so an idle room costs nothing.
- Its **lease** is an alarm the object schedules for itself: 10 minutes from
  the mint while the room waits for a second peer, 30 minutes once the two
  peers are talking.
- When the room ends — the last peer left, or the lease ran out — the
  storage is deleted. An empty SQLite database still costs about 12 KB, so
  a room that keeps its storage keeps costing.

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

## Rate limiting, and what the free plan allows

The room routes — `POST /api/room` and the WebSocket route — are the ones
that can spend the Durable Object budget, so they are rate limited per client
IP. Only the requests that can actually reach a room are counted: the mint,
and a WebSocket request that carries the upgrade header. A request that is
refused before a room exists — the wrong method on the mint path, a socket
request without the upgrade header — costs the Durable Object nothing, so it
does not spend a real user's budget. The limit is a **Workers rate limiting
binding**, declared in `wrangler.toml`:

```toml
[[ratelimits]]
name = "ROOM_RATE_LIMITER"
namespace_id = "7321"

  [ratelimits.simple]
  limit = 120
  period = 60
```

120 requests a minute per IP is far above what one person needs — a session
costs three requests: one mint and two sockets — and far below what a flood
needs. The check happens in the Worker, before the room is touched, so a
request that is turned away costs nothing but itself.

The count is **per Cloudflare location**, so the limit is approximate
worldwide, and it is approximate within a location too. That is fine for the
job: the point is to stop a flood, not to meter a customer.

### Changing or removing it

The limit is a number in `wrangler.toml`. Change it and push:

```toml
  [ratelimits.simple]
  limit = 300   # was 120
  period = 60
```

To remove the limit entirely, delete the `[[ratelimits]]` block. The Worker
treats the binding as optional, and a Worker without it does not limit
anything.

### Why there is no WAF rule for it

The obvious place for this is a zone rate limiting rule, so the request never
reaches the Worker at all. **The free plan does not allow one.** A zone gets
exactly **one** rate limiting rule, and Cloudflare has already spent it:

```
$ cf rulesets rules create --zone hassanali.site <ruleset-id> --body '<rule>'
┌ APIError
│ [50001] exceeded the maximum number of rules in the phase http_ratelimit: 2 out of 1
```

The rule that is there is Cloudflare's own *Leaked credential check*, which
blocks requests carrying a password that has appeared in a breach. It
protects the other apps on this zone, so it is not ours to delete.

What the free plan also takes away, for whoever upgrades:

| | Free | Pro |
|---|---|---|
| Rate limiting rules per zone | 1 | 2 |
| Fields in a rule expression | Path, Verified Bot | + Host, Query, Method, Source IP |
| Counting period | 10 s | up to 1 min |
| Mitigation timeout | 10 s | up to 1 h |

The Workers binding has none of those limits, which is why it is what this
project uses.

## The signalling socket, and the edge's connection resets

A desktop Chrome's WebSocket handshake against the deployed Worker fails
intermittently. The connection is reset **before the request is sent**, so
the Worker never sees it — the Worker logs show no entry for those attempts,
and the browser reports `net::ERR_CONNECTION_RESET`.

What is known, and what is not:

| Check | Result |
|---|---|
| The refused handshake | Reaches the Worker? **No** — no log entry, and Chrome's network events show the request was never sent |
| Rate | **Variable**: 1 in 12, then 3 in 20, and 4 in 8 at another moment. It is not a stable 50% |
| With `--disable-http2` | **The same failures** (1 in 10 with HTTP/2 on, 2 in 10 with it off, measured with the rounds interleaved) — so HTTP/2 is *not* the cause |
| Plain HTTPS from the same browser | Unaffected (25 of 25) |
| Node's WebSocket, and curl's | Unaffected |
| The local Worker (`wrangler dev`) | Unaffected (8 of 8) |
| The deployment from **before** the room work | Equally affected — this did not come with the room work |

The reset happens between the browser and Cloudflare's edge, on a connection
that never carried a request. What causes it is not established: it is not
the HTTP protocol, not this Worker's code, and not the room work. It is
worth a Cloudflare support ticket with the measurements above.

The app opens the signalling socket with three attempts, which gets past it
almost every time (measured: 10 of 10 sessions started against the live
deployment). Turning HTTP/2 off for the zone was tried as a fix and **does
not work** — it is not the protocol, and the setting would cost every other
app on the zone for nothing.

## What a flood costs, and what protects the app

The account is on the **Cloudflare Free Plan**, and the free plan's limits are
hard walls rather than bills:

> *"If you exceed any one of the free tier limits, further operations of
> that type will fail with an error."* — Cloudflare, Durable Objects pricing

| | Free plan |
|---|---|
| Worker requests | 100,000 a day |
| Durable Object requests | 100,000 a day |
| Rows written (storage) | 100,000 a day |
| SQL stored data | 5 GB |

So crossing a limit does not cost money — it makes the Worker fail with
errors until the budget resets at 00:00 UTC. Three things stand between the
app and that:

1. **A room only exists if it was minted.** A stranger who guesses a code
   finds no room, no Durable Object is allocated for the attempt, and
   nothing is stored.
2. **A room gives its storage back.** The 12 KB an empty SQLite database
   costs is released the moment the room ends, instead of sitting there
   until the alarm fires.
3. **The room routes are rate limited.** One IP cannot spend the whole
   budget in a couple of minutes.

What none of that fixes: a flood spread over many IPs, or a slow patient
attack that never trips a per-IP limit. Those need the **Workers Paid plan**
($5 a month), which turns "the app is dead until 00:00 UTC" into "the
overage cost about 30 cents":

| | Free | Paid ($5/mo) |
|---|---|---|
| Worker requests | 100,000 a day — cross it and the app fails | 10M a month, then $0.30/M |
| Durable Object requests | 100,000 a day — cross it and the app fails | 1M a month, then $0.15/M |

The plan is bought in the Cloudflare dashboard, not from here.

### If the app starts failing

| Symptom | What it means |
|---|---|
| `POST /api/room` answers `503 room_unavailable` | The Durable Object namespace could not be reached, or the free plan's daily request budget is spent. The budget resets at 00:00 UTC. |
| `GET /api/room/{code}/ws` answers `404 room_not_found` | Normal for a code that was never minted or has expired. If a *minted* code is refused, the room ended early — check the Worker logs. |
| Answers `429 rate_limited` | A client went over 120 room requests a minute. Normal for a script; not normal for a person. |
| Every request fails, even `/api/ice-servers` | The Worker itself is not deploying or is erroring — check the `Workers Builds: aurashare` check and the Worker logs. |

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
| A code that was just minted is refused | The room ended early — the code is only valid for 10 minutes from the mint, and the room is released as soon as the last peer leaves |
| Room requests answer `429` | A client went over the rate limit — see [Rate limiting](#rate-limiting-and-what-the-free-plan-allows) |
