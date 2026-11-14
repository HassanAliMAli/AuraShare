# Plan for issues 11–15

Prepared: 2026-11-14. This covers the numbered easy-to-hard list from the review.
Status: implemented in the working tree, with TypeScript 7 intentionally held
until supported upstream. See `docs/api.md` for the final protocol and
`docs/MAINTENANCE_PLAN.md` for implementation/verification status. No tests run.
The sections below retain the original plan for traceability.

## Recommended sequence

| Step | Issue | Deliverable |
|---|---|---|
| 1 | 13 | Finish cancellation and stale-event cleanup. |
| 2 | 11a | Restrict TURN issuance to admitted peers and limit abuse. |
| 3 | 12 | Explicit transfer failure, cancellation, and retry behavior. |
| 4 | 14 | Chunked, byte-correct text using the same transfer lifecycle. |
| 5 | 11b | Credential renewal and shorter TURN lifetime. |
| 6 | 15 | Separate major dependency migrations, subject to compatibility. |

Keep each step independently reviewable. No new framework or state-machine
library is needed. Proposed timeout and rate-limit numbers below are starting
configuration choices, not requirements imposed by the cited standards.

## 13 — Finish pending-operation cancellation

Already done: manager identity guards in the provider, checks after initial
ICE/room fetches, retry closure checks, and heartbeat cleanup. Preserve these.

Remaining changes:

1. Give each manager an AbortController. Pass its signal to ICE configuration,
   room minting, and subsequent credential requests. Close aborts the requests;
   AbortError must not silently trigger the ordinary STUN fallback.
2. Give WebSocket opening a deadline and an explicit cancellation path. Cancel
   pending retry delays immediately, reject the pending open promise once, and
   detach handlers from failed/replaced sockets. Aborting fetch does not abort
   a WebSocket: close that resource explicitly.
3. Capture the peer connection locally during SDP operations. After every await,
   check that the manager is active and still owns that connection before
   sending SDP, applying candidates, or reporting success/error.
4. Add TransferSession disposal: cancel drain waits and timers, clear buffers,
   pending files and queues, and detach data-channel listeners. Blob reads are
   not assumed abortable: check ownership again after arrayBuffer() resolves.
5. Make repeated close/dispose calls harmless. Deliberate cancellation must
   neither show an error nor revive the old session.

Files: signaling.ts, webrtc.ts, transfer.ts, AppProvider.tsx.

Review criteria: reset during fetch, WebSocket retry, SDP setup, and a file
read cannot produce a later send or UI update. A new session owns its own
timers, callbacks, and cancellation signal. A mint that already reached the
server can still leave an unused reservation until its normal expiry;
client-side abort cannot undo server-side work.

Basis: AbortController cancels fetch/body consumption; other asynchronous
resources require explicit cleanup. [AbortController documentation](https://developer.mozilla.org/en-US/docs/Web/API/AbortController).

## 11 — Restrict TURN credentials without breaking long sessions

Current gap: GET /api/ice-servers is public, does not check a room, and shares
one 24-hour credential cache across callers. Both browser roles fetch it
before opening their signaling socket.

### 11a — Admission and issuance controls

1. Validate browser WebSocket Origin against the expected deployment origin,
   with an explicit development configuration. Origin is an additional browser
   protection, not authentication for arbitrary HTTP clients.
2. After accepting a room socket, issue that peer a cryptographically random
   256-bit token. Bind it to the room and that accepted socket, with expiry.
   Store the peer authorization in hibernation-compatible socket attachments.
   Send the token only to that socket, never through the peer relay.
3. Add a protected room-specific ICE endpoint. Require the token in an
   Authorization header; verify room, expiry, and a still-admitted socket in
   the DO before issuing credentials. A room code alone is not authorization.
   Do not put tokens in URLs, logs, or persistent browser storage.
4. Reorder setup: mint/join room, open signaling, receive admission, fetch ICE,
   then prepare WebRTC. Buffer early peer/SDP messages until setup is ready.
   Bound the buffer and its wait time so admission cannot hang indefinitely.
5. Public ICE lookup returns STUN only. Missing/invalid tokens cannot obtain
   TURN credentials. On authenticated issuance failure, return an explicit
   error or a clearly identified STUN-only degraded mode; never expired TURN.
6. Add a separate approximate IP limiter for issuance, initially 10 requests
   per minute. Add an authoritative per-peer issuance cooldown/quota in the
   room, allowing initial setup, bounded retries, and scheduled renewal.
   On authorization/issuance-limiter failure, do not mint TURN credentials.
7. Remove the shared global credential cache. Reuse valid credentials only for
   the same admitted peer; coalesce simultaneous requests and never reuse an
   expired cache entry after an upstream error. Remove peer authorization on
   disconnect. Handle storage cleanup and update the API lifecycle docs.

Security boundary: this is still an anonymous app. An attacker can create a
legitimate room and become an admitted peer, so admission is not a complete
anti-abuse guarantee. Bound creation and issuance, monitor usage, and use an
additional challenge only if abuse warrants it. Removing an API token's
authorization does not revoke TURN credentials already issued; those remain
usable until expiry or provider-side revocation.

Cloudflare's rate limiter is approximate, not a global hard budget. The DO
quota controls per-room issuance. [Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

### 11b — Shorter TTL with renewal

Do this after cancellation and transfer pause/failure handling are established.
Do not shorten the TTL by itself: Cloudflare disconnects active allocations
after credential expiry. [TURN FAQ](https://developers.cloudflare.com/realtime/turn/faq/).

Proposed policy: one-hour per-peer credentials, renewed 15 minutes before
expiry, with expiresAt returned explicitly. Re-check remaining validity when
a suspended tab becomes visible; browser timers are not guaranteed to fire
on schedule in the background.

Replace the current one-off offerSent gate with serialized renegotiation:
update ICE configuration and coordinate ICE restart using the sender as the
offer initiator. The receiver requests renegotiation rather than generating a
competing offer. Associate buffered candidates with the correct ICE generation.
Pause transfer sends while needed, retain bounded pending state, and resume
only after connectivity is usable; fail clearly if renewal/restart fails.
Do not assume setting new credentials alone refreshes an existing allocation.

Files: routes.ts, room-do.ts, room-protocol.ts, turn.ts, rate-limit.ts,
wrangler.toml, signaling.ts, webrtc.ts, protocol.ts, shared wire types, docs/api.md.

Review criteria: outsiders and expired/disconnected peer tokens cannot obtain
TURN; one peer does not receive another peer's cached credentials; renewal
cannot resurrect a closed session. End-to-end continuity through actual TURN
expiry remains unverified while runtime tests are excluded.

Sources: [credential generation](https://developers.cloudflare.com/realtime/turn/generate-credentials/),
[WebSocket attachments](https://developers.cloudflare.com/durable-objects/api/state/),
[ICE restart](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/restartIce).

## 12 — Transfer errors, timeouts, and retry

1. Use a small explicit lifecycle: idle, receiving/sending, awaiting ACK,
   complete, failed, cancelled. Every attempt gets a fresh transferId, separate
   from the file-list index, so late messages cannot complete a new attempt.
2. Add validated start, complete, ACK, failure, and cancel messages carrying
   that ID. Include attempt identity and sequence in binary framing; validate
   metadata against the requested descriptor, not a filename fallback.
3. Wrap metadata send, reads, chunk sends, and completion send in one error
   path. On recoverable transfer failure, clear its buffer/timers and inform
   the other peer if the channel is usable. Malformed protocol or broken
   transport ends the session once through the existing error path.
4. Proposed deadlines: 30 seconds to start/acknowledge, 120 seconds without
   transfer progress. Reset the inactivity clock on actual progress, not on
   room heartbeats. A large file progressing normally has no total-duration
   deadline. Cancellation always releases pending drain waits.
5. Sender success means a matching receiver ACK after length/integrity checks,
   not merely that local dc.send calls finished. Receiver ACK confirms received
   bytes; it does not prove the browser saved the file to disk.
6. A failed file shows a Retry action and releases the queue. Pause the rest
   of the batch until retry/skip, preserve completed files, and avoid automatic
   retry loops. Retry sends the whole file from byte zero with a new ID;
   partial-transfer resume is outside this fix.

Files: transfer.ts, protocol.ts, shared types, webrtc.ts, appStore.ts,
AppProvider.tsx, ReceiverFileList.tsx, SharingView.tsx.

Review criteria: read/send failure, missing data, bad checksum, stalled send,
missing ACK, cancellation, and late frames all reach a defined final state.
The next attempt cannot reuse bytes from the failed attempt.

## 14 — Chunk text safely and stop silent truncation

1. Use the transfer lifecycle from issue 12 for text rather than building a
   second send queue. Announce transferId, text kind, and UTF-8 byte count.
2. Encode once with TextEncoder. Start with 16 KiB binary payload chunks,
   constrained by pc.sctp.maxMessageSize minus framing overhead. Apply that
   sizing rule to file/control frames too; a fixed chunk size is not a promise
   that every peer accepts it.
3. Reuse backpressure, timeout, cancellation, sequencing, integrity, and ACK
   handling. Assemble at most the existing 1 MiB text budget, then decode
   complete UTF-8 data with strict decoding. Do not decode each partial chunk.
4. Validate the byte limit before opening a room. Show a byte counter and a
   clear validation message; preserve the user's full draft. Reject over-limit
   incoming data instead of silently displaying a truncated success.
5. Add a bounded protocol-version/capability handshake before transferring.
   An old peer gets a reload/update message; it must not wait for unknown
   frames forever. Keep the small legacy text path only if explicitly
   negotiated and its fully encoded message fits the negotiated limit.

Files: transfer.ts, protocol.ts, webrtc.ts, shared types, AuraTextarea.tsx,
AppProvider.tsx, docs/api.md or a dedicated data-channel protocol document.

Review criteria: emoji/non-Latin text crossing a chunk boundary is preserved;
exact-limit text is accepted; oversize text is rejected visibly; successful
delivery is acknowledged with the complete original byte sequence.

The negotiated message size bounds send(), and oversized sends throw.
[WebRTC specification](https://www.w3.org/TR/webrtc/#dom-rtcdatachannel-send).

## 15 — Major upgrades in separate changes

1. **jest-dom 7.0.1 first.** Add @testing-library/dom as an explicit devDependency
   using the supported >=10 <11 range; 10.4.2 is already installed transitively.
   Keep the /vitest setup import. Node 22 is the new minimum. Review matcher
   imports and type declarations before updating the lockfile.
   [v7 release notes](https://github.com/testing-library/jest-dom/releases/tag/v7.0.0).
2. **jsdom 31.0.1 separately.** Align local/CI/README Node requirements with
   ^22.22.2 || ^24.15.0 || >=26.0.0. The current local Node 24.22.3 qualifies;
   CI's Node 22 major selector must resolve to a compatible patch.
   Review CSS/computed-style, focus, selector, and canvas changes. No canvas
   package is needed unless this project actually uses that optional feature.
   [jsdom release notes](https://github.com/jsdom/jsdom/releases).
3. Before installing jsdom 31, remove or scope the global Undici 7 override:
   jsdom 31.0.1 declares Undici ^8.12.3. Let jsdom use its supported major;
   retain any necessary Undici 7 patch override only for consumers needing 7.
   Recheck every existing override instead of applying a global major bump.
   [jsdom package metadata](https://github.com/jsdom/jsdom/blob/main/package.json)
   (the source reports 31.0.1 today; recheck the published package when implementing).
4. **Prepare for TypeScript 7; do not force it now.** Remove deprecated baseUrl
   while keeping explicit relative paths, then remove ignoreDeprecations only
   where no remaining deprecated setting requires it. Keep TypeScript 6.0.3
   until TypeScript-ESLint officially supports 7; its verified range today is
   >=4.8.4 <6.1.0. Do not use force/legacy-peer-deps to hide the conflict.
   [TypeScript configuration migration](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html),
   [supported compiler versions](https://typescript-eslint.io/users/dependency-versions/).

## Verification under the no-tests instruction

No unit, integration, E2E, live, manual browser transfer, or CI test run will be
started. During implementation, use code/protocol review, npm ls, dependency
audit, lint, typecheck, production build, and an offline Worker bundle check
as applicable. Do not push/deploy as an indirect way to trigger test suites.

Document intended regression cases without executing them. Static checks can
establish build/type/dependency consistency; they cannot establish cross-browser
transfer recovery, TURN renewal continuity, or changed jsdom/matcher behavior.
Record those as runtime-unverified rather than claiming they passed.

For rollout, keep old/new signaling contracts and protocol versions explicit.
Do not immediately remove a live bootstrap endpoint while already-open clients
still depend on it; retire compatibility behavior in a documented later deploy.
Track the credential endpoint's STUN-only public behavior separately from its
protected TURN replacement. Implementation does not itself authorize deployment.
