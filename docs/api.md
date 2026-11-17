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

## Join links and QR

The waiting screen renders the code as a QR image. It encodes
`https://<origin>/app?code=<CODE>` locally as an SVG data URI; no image service
is contacted. Opening the link pre-fills the receiver's code field but does not
connect on its own — the user still submits the form, so a link cannot silently
join a session. The query is removed from the address bar with
`history.replaceState` after the app reads it.

## Data-channel v2

Both sides first exchange `{"v":2,"kind":"hello","maxChunk":65536,"resume":true,"direct":true,"receiveDirect":true}`. `maxChunk`
is the largest binary payload the sender accepts; a peer that omits it is an
older client and the session stays at the legacy 16 KiB payload. A 10-second
version handshake deadline prevents old peers from waiting indefinitely.
Control frames must fit the negotiated SCTP message size and the local 64 KiB
frame ceiling. `direct` advertises protocol support. `receiveDirect` additionally
requires a secure context, the save picker, and writable file handles. Missing
flags are false. Both peers must advertise `direct`, and the receiver must
advertise `receiveDirect`, before using a direct-only size or frame.

- `descriptors`: at most 32 files, sequential indices, sanitized names, at most
  256 MiB for memory receive and 2 GiB with negotiated direct save. Receiver
  requests one selected file at a time. Sender selection
  rejects more than 32 files before room creation. Names and MIME strings must fit 255 characters;
  existing empty-file, size and MIME restrictions apply. Mixed valid/invalid
  selections show rejection reasons and require explicit confirmation to share
  the valid subset.
- `request`: fresh 128-bit attempt `id` and descriptor `index`. When both peers
  advertise resume support, a retry may include a positive byte `offset` and
  the receiver’s CRC-32 of the retained prefix. An updated sender recomputes
  that checksum from its file before resuming. A rejected in-memory prefix
  is released so the next attempt starts at zero. Sequence numbers restart at zero.
- `direct-request`: fresh attempt `id`, descriptor `index`, and byte `offset`.
  New saves send zero. A resume sends a positive 1 MiB-aligned offset and a
  64-character lowercase hex `digest` of the checkpoint plus the original
  whole-file `fingerprint`. The sender verifies both and rejects a mismatch
  with `failed` before sending `start`.
- `start`: same `id`, `index`, `media` (`file` or `text`), and exact byte
  `size`. Direct sends also carry the whole-file `fingerprint`.
- Binary: 16-byte attempt ID + uint32 big-endian sequence + payload bytes.
  Payloads are at most 64 KiB (excluding the 20-byte header) when both peers
  advertise the larger size, and 16 KiB when either side is an older client.
  The SCTP message limit can lower it further. Oversized or empty binary
  payloads are invalid frames and terminate the transfer session.
  Direct frames add a big-endian uint32 rolling CRC-32 at byte 20 before the
  payload. It covers the restored prefix, if any, and data through this frame.
  The receiver checks sequence, remaining size, and CRC before each write.
- `credit`: direct mode only. `id` and the next expected `sequence`. The
  sender may send one chunk after `start`; each subsequent chunk and `complete`
  wait for the preceding credit. The receiver releases credit only after the
  destination write and any checkpoint for that chunk complete.
- `complete`: same `id`, CRC-32, and chunk count. Receiver verifies attempt,
  sequence, exact size, checksum, and UTF-8 for text before acknowledging.
  Direct saves also verify the whole-file fingerprint before closing.
- `ack`: same `id`. Sender completion requires this acknowledgement. For
  memory and text it confirms verified receipt. For direct mode it additionally
  confirms the destination stream closed successfully after verification.
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
automatically: each row shows a Save action that starts one download from a user gesture. A programmatic click outside a gesture can be dropped by the browser,
which previously left the receiver believing a file had been saved. Starting a download does not prove the browser saved it to disk. Starting it
begins the URL's 60-second release timer; expiry resumes eligible queued work.
Unsaved files count against the budget until saved or the session ends.
Reset/unmount discards unsaved files but does not prematurely revoke a save
that has already started. Re-entering the app shares the same page budget.
This bounds app-owned file storage, not exact browser RSS, garbage-collection
timing or browser download internals, and it does not indicate when a save to
disk completes.

Memory requests and ACKs have a 30-second deadline. Direct request
preparation and completion ACKs have a 120-second deadline. The transfer
inactivity deadline is 120 seconds and is refreshed by progress independently
of room heartbeats. Same-session memory retry can keep an in-memory prefix.
Skip, closing the session, or invalid data discard that memory. A text sender
gets delivery status and a retry action on recoverable failure.

### Direct save and reconnect

Save directly opens the browser picker from the receiver's click. Cancelling
it sends no request. The receiver writes to the selected destination without
assembling the file in memory. One protocol payload is applied at a time,
with a 1 MiB checkpoint block and bounded hashing buffers. The browser controls
temporary-file implementation and may need space for both its staged destination
and the local checkpoint. A permission, quota, write, or integrity error
aborts the destination. A direct file is marked saved only after successful
stream close. A channel that closes after this commit can still leave the
sender without its ACK. A retry uses a new attempt; an already saved output
can be checked locally or saved again.

Where IndexedDB and Web Locks are available, the receiver retains at most one
partial file per origin and browser profile, up to 2 GiB, with access serialized
across tabs. Each full 1 MiB block and its metadata are committed in the same
transaction. Metadata contains a random local transfer identifier, descriptor,
offset, CRC-32, SHA-256 chain state, whole-file fingerprint, and expiration. Room codes, peer tokens,
and TURN credentials are excluded. A checkpoint expires 24 hours after its
last committed block. Expired records are removed when the app next opens or
checks the checkpoint, including while the app is open when its expiry timer
can run. Browser eviction or clearing site data can remove a record earlier.
Direct saves without checkpoint storage and memory receives have no
cross-session recovery. Cancellation or interruption can leave the last
committed checkpoint available. A failed final integrity check clears the
checkpoint, and a successful save removes it after committing the destination.

To resume, the sender selects the original file in a new share. The receiver
joins using the new code, chooses Resume on the matching descriptor, and picks
a destination again. The old partial output is staged in browser storage. The
receiver replays full blocks into the new destination, independently checking
its checksum and hash chain. The chain begins with 32 zero bytes and each
state is SHA-256 of the previous 32-byte state followed by the next block.
The final block may be shorter than 1 MiB. Before sending any direct file
data, the sender scans the selected file in bounded blocks to obtain the
whole-file fingerprint. For a resume the sender also checks the intermediate
chain state at the requested offset. After both checks pass, streaming
continues at the verified offset, with chunk sequence zero and the restored
CRC-32. Start over replaces the checkpoint
and requests from zero. Discard partial deletes its browser data. Saving
without a checkpoint is available if the browser cannot maintain one or a
different partial occupies the slot. WebRTC DTLS supplies transport encryption.

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
