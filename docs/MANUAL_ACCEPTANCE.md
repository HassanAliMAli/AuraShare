# Manual browser acceptance

Use disposable files and two browser profiles or devices. Record the date,
build or commit, sender and receiver browser and OS versions, device models,
result, and any outstanding issue for each run. Independently compare the SHA-256
of every saved file with the original, for example with `sha256sum` on Linux.

| Scenario | Expected result | Recorded result |
|---|---|---|
| Per-file Save | Receive several files in memory. Each Save click starts only that file's download and shows **Download started**. All saved files match the originals. | Not run |
| Direct save | On a supported receiver, cancel the picker once and confirm the sender receives no request. Save a small file and one over 256 MiB. Progress follows writes, and **Saved to disk** appears after close. Both outputs match. | Not run |
| Unsupported receiver or older peer | A small file uses the memory flow. The receiver explains the 256 MiB limit. A file above that limit is rejected when either peer lacks direct-save support. | Not run |
| Slow disk and write failure | Observe a large transfer to slow storage without whole-file growth in app memory. Deny picker permission or use a disposable quota-limited volume. The UI reports failure, no success appears, and the partial is available only through its last committed block. | Not run |
| Cancel, retry, skip and discard | Cancel before and after 1 MiB. In memory mode, retry and skip advance the expected file without showing a false success. In direct mode, discard removes the retained partial, and Start over requests from zero. | Not run |
| Session close and reconnect | Close the receiver after several MiB, reopen it, and join a fresh room. Resume a reselected original and verify the output hash. Repeat after changing one byte inside the retained prefix while keeping the same name and size. Repeat with a change beyond the retained prefix. Both mismatches must fail and Start over must be available. | Not run |
| Interrupted resume | Disconnect again during resumed transfer, then rejoin and confirm the new checkpoint can be used. Try disconnecting around completion and check both peers' displayed status and actual disk output. | Not run |
| Offline fallback | Open a production build once, let its service worker activate, then navigate offline. The offline page appears. Reconnect and reload to see the current site. | Not run |
| Accessibility | Navigate with the keyboard, including Save directly, Resume, Start over and Discard partial. Check focus after picker cancellation, file-specific labels, accessible progress, errors and completion announcements. | Not run |
| Room and text | Check room creation, code entry and copy (including I/L/O), QR links, Unicode text, peer departure, expiry, interruption and TURN fallback where available. | Not run |

| Browser and device pairing | Build / environment | Result |
|---|---|---|
| Chrome → Chrome | Local host has Chrome 157.0.8103.78 on Ubuntu 26.04.1 LTS. No interactive display accessible to this session. | Not run |
| Chrome ↔ Firefox | Firefox binary present. The sandbox could not start it to read its version. | Not run |
| Safari desktop ↔ Safari iOS | No macOS or iOS devices attached. | Not run |
| Chrome desktop ↔ Android Chrome | No Android device attached. | Not run |
