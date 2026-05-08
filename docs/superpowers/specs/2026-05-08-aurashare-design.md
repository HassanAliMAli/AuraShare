# AuraShare Architecture Design

## Overview
AuraShare is a 100% free, browser-based peer-to-peer (P2P) file sharing application. It uses WebRTC for direct device-to-device file transfers and Cloudflare Workers for signaling.

## 4-Round Free Alternative Protocol Validation
1. **File Transfer**: WebRTC DataChannels allow direct P2P transfers. This means zero server-side storage costs and zero bandwidth costs, scaling infinitely for free.
2. **Signaling Server**: We require a signaling mechanism to exchange Session Description Protocol (SDP) offers and answers. A Cloudflare Worker backed by Cloudflare KV provides a 100% free mechanism for this. Users generate a short code or room ID, the worker stores the offer, and the peer retrieves it and posts an answer.
3. **STUN/TURN**: Google's public STUN servers will be used for NAT traversal.
4. **Hosting**: Cloudflare Pages for the static React/Vite frontend.

## Architecture

### Frontend (React + WebRTC)
- **UI Components**: Existing `AuraDropzone` and `Constellation` will be wired up to actual connection states.
- **WebRTC Manager**: A class/hook to manage `RTCPeerConnection` and `RTCDataChannel`.
- **File Chunking**: Files will be read via `FileReader` in chunks (e.g., 64KB) and sent over the DataChannel to support files larger than memory.
- **Progress Tracking**: Real-time progress updates based on chunks sent/received.

### Backend (Cloudflare Workers + KV)
A single worker exposing REST endpoints:
- `POST /api/room`: Create a new room with an SDP offer.
- `GET /api/room/:id`: Get the room's SDP offer.
- `POST /api/room/:id/answer`: Post the SDP answer.
- `GET /api/room/:id/answer`: Poll for the SDP answer.

## Data Flow
1. **Sender** creates a room, generates an SDP Offer, sends to `POST /api/room`.
2. Sender receives a 6-digit room code and waits (polls `GET /api/room/:id/answer`).
3. **Receiver** enters the code, calls `GET /api/room/:id`, receives the Offer.
4. Receiver generates an SDP Answer, sends to `POST /api/room/:id/answer`.
5. Sender polls and receives the Answer. Both establish a P2P WebRTC connection.
6. Files are transferred directly between peers.

## Security
- Files are encrypted in transit by WebRTC (DTLS/SRTP).
- The signaling data in KV will be set to expire (TTL = 10 minutes) automatically.
