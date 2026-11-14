# AuraShare API

The AuraShare backend is a single Cloudflare Worker (`backend/index.ts`). It
does two unrelated jobs:

1. **Signalling** — mints a *transmission code* and relays WebSocket frames
   between the two peers of a session.
2. **Static assets** — serves the built SPA from `dist/` (configured in
   `wrangler.toml`, not in this document).

**File contents never pass through the Worker.** They travel peer-to-peer over
a WebRTC data channel. The Worker only carries the signalling messages that
let the two browsers find each other and negotiate that channel.

Base URL: the same origin as the app — in production
`https://aurashare.hassanali.site`. In development the Vite server on `:5173`
proxies `/api` to the Wrangler worker on `:8787`.

## Contents

- [Conventions](#conventions)
- [`GET /api/ice-servers`](#get-apiice-servers)
- [`POST /api/room`](#post-apiroom)
- [`GET /api/room/{code}/ws`](#get-apiroomcodews)
- [Signalling frames](#signalling-frames)
- [Durable Object lifecycle](#durable-object-lifecycle)
- [Errors](#errors)
- [Limits](#limits)

## Conventions

- Every response is `application/json` and carries the same security
  headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and
  `Cache-Control: no-store`. Signalling responses are per-session state and
  must never be cached.
- There is **no authentication**. A transmission code is the only secret, and
  it is a 6-character code from a 32-character alphabet — about 30 bits — so
  a code is guessable in theory. Guessing one is worth nothing, though: a
  code only opens a room that the Worker actually minted, and a room that
  was never minted does not exist. See
  [Durable Object lifecycle](#durable-object-lifecycle).
- The two routes that can reach a room — `POST /api/room`, and a
  `GET /api/room/{code}/ws` that carries the upgrade header — are **rate
  limited** per client IP, 120 requests a minute. The limit is checked
  before the room is touched, so a request that is turned away costs
  nothing but itself. A request that cannot reach a room is not counted:
  the wrong method on the mint path and a socket request without the
  upgrade header are both refused before a room exists, so they cost the
  Durable Object nothing and must not spend a real user's budget.
- There is **no CORS negotiation**: the Worker answers `OPTIONS` with an
  empty `200` and serves the same origin the app is served from.
- The method must match the route exactly. `GET /api/ice-servers` is the only
  method that reaches it, and `POST /api/room` the only one that reaches
  that; the other method on either path is a `404`.

## `GET /api/ice-servers`

Returns the ICE server list the browser should use to find a peer.

### Request

No parameters, no body.

### Response — `200 OK`

```json
{
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    { "urls": "stun:stun1.l.google.com:19302" },
    { "urls": "stun:stun.cloudflare.com:3478" },
    {
      "urls": "turn:turn.cloudflare.com:3478?transport=udp",
      "username": "a-very-short-lived-username",
      "credential": "a-very-short-lived-credential"
    }
  ]
}
```

Each entry is an [`RTCIceServer`][rtcice] — `urls` is a string or an array of
strings; `username` and `credential` are present only for TURN.

[rtcice]: https://developer.mozilla.org/docs/Web/API/RTCIceServer

### TURN credentials

If the Worker has the `TURN_KEY_ID` and `TURN_KEY_API_TOKEN` secrets, it asks
the Cloudflare Calls API for **ephemeral** TURN credentials with a 24-hour
TTL. The result is cached in the Worker isolate and re-minted one hour before
it expires.

If the secrets are **not** set, the Cloudflare API fails, or it returns an
empty list, the endpoint falls back to the three STUN servers above and
returns `200` — never an error. A peer behind a symmetric NAT will not
connect, but the failure is a connection timeout rather than a broken app.

> The credentials in the example above are illustrative. The real ones are
> minted per Worker isolate and are not valid outside their TTL.

## `POST /api/room`

Mints a new transmission code and reserves the Durable Object behind it.

### Request

No parameters, no body. The method **must** be `POST` — a `GET` to this path
is a `404`.

### Response — `200 OK`

```json
{ "roomId": "A1B2C3" }
```

`roomId` is 6 characters from the Crockford base32 alphabet
`0123456789ABCDEFGHJKMNPQRSTVWXYZ` — it excludes `I`, `L`, `O` and `U` so a
code can never be misread aloud. The same alphabet is used by the client, and
both sides must agree: a code the user typed perfectly well would otherwise
resolve to a room that does not exist and the session would hang until it
times out.

### Behaviour

The mint **reserves** the room: the Durable Object behind the code records
that it was minted, and that record is what makes the code work. A peer that
joins a code nobody minted is refused — see
[`GET /api/room/{code}/ws`](#get-apiroomcodews).

The reservation is what stops a stranger from making the Worker allocate a
Durable Object per guess. It goes through the Durable Object rather than a
key-value store because the Durable Object is strongly consistent: the
instance that answers the join is the very instance that was reserved, so
the two can never disagree. A key-value read is eventually consistent, and a
freshly minted code could still look missing.

If the room cannot be reserved, the answer is `503 room_unavailable` and no
code is handed out.

The code is valid for **10 minutes from the mint** — see
[Durable Object lifecycle](#durable-object-lifecycle).

## `GET /api/room/{code}/ws`

Opens the signalling WebSocket for a room. This is the only endpoint that
upgrades.

### Request

```
GET /api/room/A1B2C3/ws
Upgrade: websocket
```

`{code}` must match `^[0-9A-HJKMNP-TV-Z]{6}$` — exactly the codes
`POST /api/room` can mint. A code outside that pattern is a `404` and never
allocates a Durable Object.

### Response — `101 Switching Protocols`

The WebSocket is opened, and the Worker forwards it to the `RoomDO` for that
code.

### Behaviour

The room accepts **at most two** peers.

- A code that was **never minted** has no room behind it, and the join is
  refused with `404 room_not_found`. The check happens before the socket is
  accepted, so the client never sees an open connection that dies a moment
  later — and no Durable Object is left behind for the attempt.
- The first peer to connect is accepted silently.
- When the second connects, the Worker sends `{"type":"peer-present"}` to the
  peer that was already there.
- A **third** peer is refused with `409 Room full` — the check happens
  *before* the socket is accepted, so the refused client never sees an open
  connection that dies a moment later.
- Every frame one peer sends is relayed verbatim to the other one. The
  Worker does not parse, validate or transform frames.

## Signalling frames

The relay is a **dumb pipe**: whatever a peer sends arrives at the other
peer byte for byte. The Worker never inspects a frame.

Validation is the client's job, and it happens in
`frontend/src/lib/protocol.ts` — a frame that does not match one of the
shapes below is dropped before it reaches the WebRTC layer.

| Type | Shape | Direction | Meaning |
|---|---|---|---|
| `hello` | `{ type: "hello", role: "sender" \| "receiver" }` | client → peer | Sent by the client as soon as the socket opens, to announce its role. |
| `peer-present` | `{ type: "peer-present" }` | Worker → peer | The second peer joined the room. |
| `peer-left` | `{ type: "peer-left" }` | Worker → peer | The other peer closed its socket. |
| `room-expired` | `{ type: "room-expired" }` | Worker → peer | The room's lease ran out. The socket is closed right after. |
| `offer` | `{ type: "offer", sdp: RTCSessionDescriptionInit }` | either | SDP offer. |
| `answer` | `{ type: "answer", sdp: RTCSessionDescriptionInit }` | either | SDP answer. |
| `ice` | `{ type: "ice", candidate: RTCIceCandidateInit }` | either | Trickle ICE candidate. |

A frame that is not valid JSON, or that is JSON but not one of these shapes,
is ignored by the receiving client.

## Durable Object lifecycle

One `RoomDO` instance exists per transmission code, addressed by
`env.ROOMS.idFromName(code)`.

The room has a **lease**, and the lease is the alarm the Durable Object
schedules for itself. The room moves through three states:

| State | What it is | Lease |
|---|---|---|
| **Minted** | The code was handed out; nobody has joined yet. | 10 minutes from the mint. |
| **Paired** | Two peers are connected. | 30 minutes, refreshed while the peers are talking. |
| **Over** | The last peer left, or the lease ran out. | None — the room is gone. |

- **One row is persisted**: the time the room was minted. Its presence is
  what tells a reserved room from a guessed one.
- The lease **never extends the code window**. The 10 minutes are measured
  from the mint, so a code cannot be kept alive by talking to the room.
- The lease is **not** re-armed on every relayed message. `setAlarm` is a
  storage write, and the free plan allows 100,000 rows written a day — a
  busy session must not spend that budget on its own. The alarm only moves
  when the current one is close to firing.
- When the room ends — the last peer left, or the lease ran out — the
  storage is deleted (`deleteAll`). An empty SQLite database still costs
  about 12 KB, so a room that keeps its storage keeps costing.
- The DO **hibernates** between messages, so an idle room costs nothing.
- When the lease runs out, every socket in the room is sent
  `{"type":"room-expired"}` and then closed with code `1000` and the reason
  `room expired`. The peer that is still waiting learns that nobody joined
  instead of seeing a socket die for no reason.

## Errors

Every error response has the **same shape**, so a client can read it without
checking which route it came from:

```json
{ "error": { "code": "not_found", "message": "Not found" } }
```

`code` is the machine-readable value to branch on; `message` is for humans
and for logs. Error responses carry the same security headers and the same
`application/json` content type as successful ones.

| Status | `code` | When |
|---|---|---|
| `404` | `not_found` | The path does not match a route, the method is wrong for the path, or the room code is not one the Worker could have minted. |
| `404` | `room_not_found` | The code is a valid one, but no room was ever minted for it — or the room it pointed at has already ended. |
| `409` | `room_full` | A third peer tried to join a room that already has two. |
| `426` | `upgrade_required` | The WebSocket route was called without an `Upgrade: websocket` header. |
| `429` | `rate_limited` | The client IP went over the rate limit for the room routes. The answer carries `Retry-After: 60`. |
| `503` | `room_unavailable` | The room could not be reserved, so no code was handed out. |

The client only checks the status code (`res.ok`) and never parses an error
body, so the shape is free to change — but it is documented and tested so
that it does not change by accident.

A **failed WebSocket handshake** is the one case the client cannot read:
the browser gives a refused upgrade no body and no status, so a wrong code
and an expired code look the same to it. The client shows one message for
both — *"Could not join the room — check the code, it may be wrong or
expired"*.

## Limits

| Limit | Value | Where |
|---|---|---|
| Peers per room | 2 | A third peer is refused with `409`. |
| Transmission code validity | 10 minutes | Measured from the mint. After that the room is gone and the code opens nothing. |
| Room idle TTL | 30 minutes | A room with two peers survives this long without any activity. |
| Room request rate limit | 120 requests / minute / IP | Over the limit the answer is `429 rate_limited`. Only the requests that can reach a room are counted. |
| Transmission code length | 6 characters | 32-character alphabet, ~30 bits. |
| TURN credential TTL | 24 hours | Cloudflare Calls API. |
| TURN cache refresh margin | 1 hour | The credential is re-minted when less than this remains. |

> **TURN is configured on the live Worker.** `GET /api/ice-servers` returns
> the STUN servers and a TURN entry with six URLs and ephemeral credentials.
> A peer behind a symmetric NAT needs that entry to connect at all. See
> [docs/DEPLOYMENT.md](DEPLOYMENT.md#turn-credentials).

## Checking a deployment

The contract above is enforced against the running Worker by
`test/live/deployment.test.ts`, which is skipped unless `LIVE_URL` is set:

```bash
LIVE_URL=https://aurashare.hassanali.site npm run test:live
```
