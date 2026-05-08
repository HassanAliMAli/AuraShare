# AuraShare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a fully functional WebRTC P2P file-sharing application using Cloudflare Workers for signaling.

**Architecture:** React frontend with WebRTC DataChannels for file transfer. Cloudflare Worker + KV for SDP signaling (offer/answer exchange).

**Tech Stack:** React, Vite, TailwindCSS, WebRTC, Cloudflare Workers, Cloudflare KV.

---

### Task 1: Setup Cloudflare Worker Backend

**Files:**
- Create: `worker/wrangler.json`
- Create: `worker/package.json`
- Create: `worker/src/index.ts`
- Create: `worker/tsconfig.json`

- [ ] **Step 1: Initialize Worker Files**
Create the necessary configuration files for the Cloudflare Worker. The worker will handle `/api/room` routes.

- [ ] **Step 2: Implement Worker Logic**
Implement the REST API in `worker/src/index.ts` using native `fetch` handlers.
Methods:
- `POST /api/room` -> Generates a 6-digit ID, stores `{ offer }` in KV with expiration, returns ID.
- `GET /api/room/:id` -> Returns the stored offer.
- `POST /api/room/:id/answer` -> Updates KV with `{ answer }`.
- `GET /api/room/:id/answer` -> Returns the stored answer.

- [ ] **Step 3: Setup Local Dev**
Add local development scripts to `worker/package.json` using `wrangler`.

### Task 2: WebRTC Service Layer

**Files:**
- Create: `src/lib/webrtc.ts`

- [ ] **Step 1: Implement WebRTC connection manager**
Create a `WebRTCManager` class or a set of functions that handle creating an `RTCPeerConnection`, setting up a data channel, and creating an offer.

- [ ] **Step 2: Implement File Chunking**
Add methods to read a `File` in chunks and send it via the data channel.

- [ ] **Step 3: Implement Receiver Logic**
Add methods to receive chunks, reconstruct the file, and trigger a download using `Blob` and object URLs.

### Task 3: Signaling Integration (Frontend)

**Files:**
- Create: `src/hooks/useSignaling.ts`

- [ ] **Step 1: Implement the useSignaling hook**
Create a React hook that communicates with the Cloudflare Worker API. It should support creating a room, polling for an answer, joining a room, and polling for the offer.

### Task 4: UI Wiring

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/AuraDropzone.tsx`
- Modify: `src/components/Constellation.tsx`

- [ ] **Step 1: Replace Mock Discovery**
Update `App.tsx` to use the `useSignaling` and `WebRTCManager`. Add UI for displaying the connection code (for the sender) and inputting the code (for the receiver).

- [ ] **Step 2: Wire Dropzone**
When a file is dropped in `AuraDropzone`, trigger the sender flow, create a room, and display the 6-digit code.

- [ ] **Step 3: Update Progress UI**
Replace the simulated progress in `App.tsx` with actual progress from the WebRTC DataChannel.

### Task 5: Testing and Polish

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Error Handling**
Add error states for disconnected peers, invalid codes, or failed transfers.

- [ ] **Step 2: Final Polish**
Ensure all animations in `App.tsx` correctly reflect the real WebRTC state (connecting, transferring, success).
