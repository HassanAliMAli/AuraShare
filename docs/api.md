# AuraShare API and transfer protocol

Implemented contract, 2026-11-14. This describes the working tree, not a claim
that these changes have been deployed or runtime-tested.

The Worker serves assets and signaling. HTTP JSON responses include no-store,
JSON content type, nosniff, frame protection, and referrer-policy headers.
Errors use `{ "error": { "code": "…", "message": "…" } }`.

## Bootstrap and admission

| Endpoint | Behavior |
|---|---|
| `GET /api/ice-servers` | Public STUN-only bootstrap: `{iceServers, expiresAt:null, degraded:true}`. Never contains TURN credentials, even with TURN secrets configured. |
| `POST /api/room` | Mints a six-character Crockford code. Existing codes are rejected internally; retry at most five times, then return `503 room_unavailable`. |
| `GET /api/room/{code}/ws?v=2` | WebSocket upgrade. Browser Origin must match the request origin or configured `APP_ORIGIN`. Maximum two peers; missing/expired reservations and full rooms are rejected before acceptance. |
| `POST /api/room/{code}/ice-servers` | Requires `Authorization: Bearer <peer-token>`, a live admitted socket, and issuance rate/quota checks. |

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
Issuance permits at most four upstream attempts per peer per hour and requires
30 seconds between upstream attempts. A separate approximate IP binding limits
credential requests to 10/minute; binding errors/missing bindings fail closed.
Room creation/socket rate limiting remains 120/minute/IP.

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

The relay allows only client signaling types; client-supplied admission or room
lifecycle frames are not forwarded. Binary signaling or frames over 256 KiB
are dropped. Data-channel protocol validation remains the browser's job.

Unpaired code validity is 10 minutes from mint. Paired idle TTL is 30 minutes.
Connected data channels send signaling heartbeats every 60 seconds; unpaired
heartbeats cannot extend code validity. Alarms are updated only near expiry.
Last-peer departure and expiry release storage and authorization.

## Data-channel v2

Both sides first exchange `{"v":2,"kind":"hello"}`. A 10-second version
handshake deadline prevents old peers from waiting indefinitely. Control frames
must fit the negotiated SCTP message size and the local 64 KiB frame ceiling.

- `descriptors`: at most 32 files, sequential indices, sanitized names, at most
  256 MiB each. Receiver requests one selected file at a time.
- `request`: fresh 128-bit attempt `id` and descriptor `index`.
- `start`: same `id`, `index`, `media` (`file` or `text`), and exact byte `size`.
- Binary: 16-byte attempt ID + uint32 big-endian sequence + payload bytes.
  Payloads are at most 16 KiB and smaller when negotiated limits require it.
- `complete`: same `id`, CRC-32, and chunk count. Receiver verifies attempt,
  sequence, exact size, checksum, and UTF-8 for text before acknowledging.
- `ack`: same `id`; sender completion requires this acknowledgement.
- `failed` / `cancel`: same `id` and bounded reason. Old-attempt data is ignored.

Text is UTF-8 encoded once and capped at 1 MiB. The editor shows a byte counter,
rejects oversize drafts visibly, and preserves their contents. The receiver
assembles all bytes before strict decoding, so multibyte characters may safely
cross chunk boundaries. Text and files share backpressure and cancellation.

Response/ACK deadline is 30 seconds. Inactivity deadline is 120 seconds, refreshed
by transfer progress rather than room heartbeats. There is no total duration
limit for a progressing transfer. Cancelling releases timers, buffers, and drain
waits. Failed files pause the batch and expose Retry/Skip; retries use a fresh
attempt ID and restart at byte zero. Completed history is preserved. A text
sender gets delivery status and a retry action on recoverable failure.

An ACK confirms verified receipt of bytes, not that the browser completed a
save to disk. CRC-32 detects corruption; WebRTC DTLS supplies transport encryption.

## Errors and verification

| Status | Codes |
|---|---|
| 401 | `unauthorized` |
| 403 | `forbidden` |
| 404 | `not_found`, `room_not_found` |
| 409 | `room_full`, internal `room_conflict` |
| 426 | `upgrade_required` |
| 429 | `rate_limited` (with Retry-After) |
| 503 | `room_unavailable`, `turn_unavailable` |

Browser WebSocket handshake failures do not expose the HTTP response body.
Wrong/expired codes therefore share a friendly join error. No CORS access is
advertised for credential endpoints. Origin checks supplement token authorization;
they are not authentication for non-browser clients. Anonymous room creation
still needs usage monitoring; admission does not eliminate all relay abuse.

Unit/contract and E2E fixtures are updated for v2. Tests have not been executed
under the user's no-tests instruction. Build/package checks do not prove real
TURN renewal continuity, failure recovery, or cross-browser behavior.
