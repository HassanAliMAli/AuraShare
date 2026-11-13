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
  a code is guessable in theory. It is protected by rate limiting at the
  edge and by the fact that guessing it only lets an attacker join a session
  they already have a code for.
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
| `offer` | `{ type: "offer", sdp: RTCSessionDescriptionInit }` | either | SDP offer. |
| `answer` | `{ type: "answer", sdp: RTCSessionDescriptionInit }` | either | SDP answer. |
| `ice` | `{ type: "ice", candidate: RTCIceCandidateInit }` | either | Trickle ICE candidate. |

A frame that is not valid JSON, or that is JSON but not one of these shapes,
is ignored by the receiving client.

## Durable Object lifecycle

One `RoomDO` instance exists per transmission code, addressed by
`env.ROOMS.idFromName(code)`.

- **No state is persisted.** The relay holds only the live sockets.
- The DO **hibernates** between messages, so an idle room costs nothing.
- An alarm is set on every connect and on every relayed message. When it
  fires after 30 minutes of inactivity, every socket in the room is closed
  with code `1000` and the reason `room expired`, and the DO evicts itself.

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
| `409` | `room_full` | A third peer tried to join a room that already has two. |
| `426` | `upgrade_required` | The WebSocket route was called without an `Upgrade: websocket` header. |

The client only checks the status code (`res.ok`) and never parses an error
body, so the shape is free to change — but it is documented and tested so
that it does not change by accident.

## Limits

| Limit | Value | Where |
|---|---|---|
| Peers per room | 2 | A third peer is refused with `409`. |
| Room idle TTL | 30 minutes | An idle room evicts itself and closes its sockets. |
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
