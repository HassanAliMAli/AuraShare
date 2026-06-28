# AuraShare Architecture Design (SUPERSEDED)

> **⚠️ This document is superseded.** It describes the original KV-polling signaling approach that was replaced with Durable Objects + raw WebRTC. See [DEPLOYMENT.md](../../DEPLOYMENT.md) for the current architecture.

## Original Overview
AuraShare is a 100% free, browser-based peer-to-peer (P2P) file sharing application. It uses WebRTC for direct device-to-device file transfers and Cloudflare Workers for signaling.

## Original Architecture
The original design used Cloudflare Workers + KV for SDP offer/answer exchange via HTTP polling. This was replaced with:
- **Durable Objects** with Hibernatable WebSockets for real-time signaling (no polling)
- **Raw RTCPeerConnection** (no PeerJS dependency)
- **Cloudflare Calls TURN + Metered TURN** fallback for NAT traversal
