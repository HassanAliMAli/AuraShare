# AuraShare API and transfer protocol

Implemented contract, 2026-11-16. This describes the working tree, not a claim
that these changes have been deployed or runtime-tested.

The Worker serves assets and signaling. HTTP JSON responses include no-store,
JSON content type, nosniff, frame protection, and referrer-policy headers.
Errors use `{ "error": { "code": "…", "message": "…" } }`.

## Bootstrap and admission

| Endpoint | Behavior |
|---|---|
| `GET /api/ice-servers` | Public STUN-only bootstrap: `{iceServers, expiresAt:null, degraded:true}`. Never contains TURN credentials, even with TURN secrets configured. |
| `POST /api/room` | Mints a six-character Crockford code. A browser request whose `Origin` does not match the request origin or `APP_ORIGIN` is refused with `403 forbidden` before the limiter and before any room is reserved. Existing codes are rejected internally; retry at most five times, then return `503 room_unavailable`. |
| `GET /api/room/{code}/ws?v=2` | WebSocket upgrade. Browser Origin must match the request origin or configured `APP_ORIGIN`. Maximum two peers; missing/expired reservations and full rooms are rejected before acceptance. |
| `POST /api/room/{code}/ice-servers` | Requires `Authorization: Bearer <peer-token>`, a live admitted socket, and issuance rate/quota checks. A present browser `Origin` must match. |

The v2 socket receives a private server frame:

```json
{"type":"admitted","version":2,"token":"<64 random hex characters>","expiresAt":1234567890000}
```

The token is scoped to that room and socket, kept in browser memory, and stored
in the DO's socket attachment for hibernation. It is not a URL parameter and
is never relayed to the other peer. Token lifetime is 24 hours, extended when
fresh credentials are successfully issued. Disconnect/error/expiry revokes
API authorization. Already-issued TURN credentials remain usable until their
own expiry; API revocation cannot recall them.

Client order: mint or enter code, open socket, wait for admission, obtain the
peer's ICE config, prepare WebRTC, then send `ready`. Early signaling is bounded
to 128 frames. Socket admission has a 10-second deadline and at most three
attempts, with cancellable 250 ms retry delays.

Legacy sockets can still upgrade without `v=2`, but receive no token. The public
STUN bootstrap remains available for old pages. Mixed transfer versions require
reloading both devices; large unversioned text is not silently downgraded.

## TURN configuration and renewal

Protected response: `{iceServers, expiresAt, degraded, serverTime}`. With TURN
configured, each peer gets its own one-hour credentials, renewed 15 minutes
before expiry. Server time lets the browser derive a conservative local expiry
without assuming synchronized device clocks. No global credential cache exists.

A valid same-peer cache is reused; concurrent same-peer issuance coalesces.
Credentials and quota metadata survive hibernation in socket attachments.
Cached ICE configuration is capped at 1,200 UTF-8 JSON bytes, reserving attachment
space for authorization, quotas and traffic counters; oversized configuration
fails closed with `503 turn_unavailable`.
Issuance permits at most four upstream attempts per peer per hour and requires
30 seconds between upstream attempts. A separate approximate IP binding limits
credential requests to 10/minute; binding errors/missing bindings fail closed.
Room creation/socket handshake rate limiting remains 120/minute/IP.

If TURN secrets are absent, protected lookup reports STUN-only degraded mode
and the app displays a warning. If configured TURN issuance fails, lookup
returns `503 turn_unavailable`, never stale/expired credentials.

Both devices update their ICE configuration before restart. Only the sender
initiates offers. `refresh-request`, `refresh-prepare`, and `refresh-ready`
coordinate renewal; offers, answers, and ICE carry a 32-hex-character generation.
Candidates for previous generations are retired. A bounded renegotiation
pauses new payload sends, then resumes on a stable, connected peer connection.
Renewal is also checked on visibility changes. Renewal failure ends the session
with a visible error rather than silently using expired credentials.

## Signaling and room lifetime

| Frame | Meaning |
|---|---|
| `hello` with `role`, `version:2` | Announce current client protocol. |
| `ready` | ICE configuration and peer connection are prepared. |
| `offer` / `answer` with `sdp`, `generation` | Initial or renewed SDP negotiation. |
| `ice` with `candidate`, `generation` | Candidate for that negotiation. |
| `refresh-request` | Receiver asks sender to coordinate renewal. |
| `refresh-prepare` / `refresh-ready` with `id` | Both peers prepare renewed ICE configuration. |
| `heartbeat` | Exact frame `{"type":"heartbeat"}`; consumed locally, not relayed. |
| `peer-present`, `peer-left`, `room-expired` | Server-owned room lifecycle notifications. |

The relay validates client signaling shapes and forwards accepted frames unchanged;
client-supplied admission or room lifecycle frames are never forwarded. Legacy
SDP/ICE frames without a generation remain accepted for upgrade diagnostics.
Frames over 256 KiB measured as UTF-8 bytes (or binary byte length) close the
socket with 1009. Binary frames and malformed/unsupported JSON count as invalid.
Each socket has a fixed 60-second traffic window: at most 300 messages and
2 MiB of inbound data, including heartbeats and invalid frames. The eighth
invalid frame or exceeding either traffic budget closes the socket with 1008.
Counters survive DO hibernation alongside peer authorization and TURN quota;
credential updates merge current attachment state instead of restoring old
traffic counters. Closing revokes authorization and notifies the remaining peer
through the normal disconnect flow. Invalid messages never renew the lease.
These limits bound a socket, not distributed abuse across many rooms.
Data-channel protocol validation remains the browser's job.

Unpaired code validity is 10 minutes from mint. Paired idle TTL is 30 minutes.
Connected data channels send signaling heartbeats every 60 seconds; unpaired
heartbeats cannot extend code validity. Alarms are updated only near expiry.
Last-peer departure and expiry release storage and authorization.

## Data-channel v2

Both sides first exchange `{"v":2,"kind":"hello"}`. A 10-second version
handshake deadline prevents old peers from waiting indefinitely. Control frames
must fit the negotiated SCTP message size and the local 64 KiB frame ceiling.

- `descriptors`: at most 32 files, sequential indices, sanitized names, at most
  256 MiB each. Receiver requests one selected file at a time. Sender selection
  rejects more than 32 files before room creation. Names and MIME strings must fit 255 characters;
  existing empty-file, size and MIME restrictions apply. Mixed valid/invalid
  selections show rejection reasons and require explicit confirmation to share
  the valid subset.
- `request`: fresh 128-bit attempt `id` and descriptor `index`.
- `start`: same `id`, `index`, `media` (`file` or `text`), and exact byte `size`.
- Binary: 16-byte attempt ID + uint32 big-endian sequence + payload bytes.
  Payloads are at most 16 KiB (excluding the 20-byte header) and smaller when
  negotiated limits require it. Oversized or empty binary payloads are invalid
  frames and terminate the transfer session.
- `complete`: same `id`, CRC-32, and chunk count. Receiver verifies attempt,
  sequence, exact size, checksum, and UTF-8 for text before acknowledging.
- `ack`: same `id`; sender completion requires this acknowledgement.
- `failed` / `cancel`: same `id` and bounded reason. Old-attempt data is ignored.

Text is UTF-8 encoded once and capped at 1 MiB. The editor shows a byte counter,
rejects oversize drafts visibly, and preserves their contents. The receiver
assembles all bytes before strict decoding, so multibyte characters may safely
cross chunk boundaries. Text and files share backpressure and cancellation.
Incoming payloads are copied into blocks of at most 1 MiB; retained buffer count depends on announced size,
not the number of frames. Even 1-byte chunks do not create one retained object
per frame. Buffer allocation/assembly failures produce a recoverable transfer
error and release receive storage.

The page-wide download budget is 512 MiB of accounted file bytes: retained
object URLs plus twice the next file size for assembly and File creation.
The receiver waits before requesting a file if it would exceed this budget,
shows a preparing status, and permits cancelling that queued file. There is no
peer response timeout until the request is actually sent.

A received file is held in memory as an object URL and is **not** saved
automatically: the row shows a Save action, and Save all spends the batch from
one click. A programmatic click outside a gesture can be dropped by the browser,
which previously left the receiver believing a file had been saved. Saving
starts the URL's 60-second release timer; expiry resumes eligible queued work.
Unsaved files count against the budget until saved or the session ends.
Reset/unmount discards unsaved files but does not prematurely revoke a save
that has already started. Re-entering the app shares the same page budget.
This bounds app-owned file storage, not exact browser RSS, garbage-collection
timing or browser download internals, and it does not indicate when a save to
disk completes.

Response/ACK deadline is 30 seconds. Inactivity deadline is 120 seconds, refreshed
by transfer progress rather than room heartbeats. There is no total duration
limit for a progressing transfer. Cancelling releases timers, buffers, and drain
waits. Failed files pause the batch and expose Retry/Skip; retries use a fresh
attempt ID and restart at byte zero. Completed history is preserved. A text
sender gets delivery status and a retry action on recoverable failure.

An ACK confirms verified receipt of bytes, not that the browser completed a
save to disk. CRC-32 detects corruption; WebRTC DTLS supplies transport encryption.

On socket close or error, authorization and cached TURN credentials are revoked.
The remaining peer receives `peer-left` once; repeated error/close callbacks for
that socket are deduplicated with a hibernation-compatible attachment marker.
The last departing peer releases room storage immediately. An error closes the
socket with code 1011; a concurrent close does not prevent cleanup.

## Errors and verification

| Status | Codes |
|---|---|
| 401 | `unauthorized` |
| 403 | `forbidden` |
| 404 | `not_found`, `room_not_found` |
| 409 | `room_full`, internal `room_conflict` |
| 426 | `upgrade_required` |
| 429 | `rate_limited` (with Retry-After) |
| 500 | `internal_error` |
| 503 | `room_unavailable`, `turn_unavailable` |

Browser WebSocket handshake failures do not expose the HTTP response body.
Wrong/expired codes therefore share a friendly join error. No CORS access is
advertised for credential endpoints. Origin checks supplement token authorization;
they are not authentication for non-browser clients. Anonymous room creation
still needs usage monitoring; admission does not eliminate all relay abuse.

Durable Object forwarding rejections return JSON `503 room_unavailable` for
socket requests or `503 turn_unavailable` for credential requests. Unexpected
Worker handler exceptions return JSON `500 internal_error`. These responses use
the standard security headers and reveal no exception details. Successful
WebSocket upgrade responses pass through unchanged. Failures outside the
application handler remain platform-controlled.
