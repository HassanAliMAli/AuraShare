# Deployment Guide: AuraShare (Durable Objects + Raw WebRTC)

AuraShare uses **Cloudflare Workers + Durable Objects** for real-time WebSocket signaling and **WebRTC DataChannels** for direct peer-to-peer file transfer. No third-party signaling servers, no PeerJS, no polling — just millisecond-latency SDP exchange over a hibernatable WebSocket relay.

## Architecture

```
Browser A (Sender)                         Browser B (Receiver)
     │                                          │
     │  POST /api/room → mint 6-char code        │
     │  WS  /api/room/:id/ws                    │
     │──────────────► RoomDO ◄──────────────────│
     │   SDP offer ──► relay ──► SDP offer       │
     │   ICE ──► relay ──► ICE                   │
     │   SDP answer ◄── relay ◄── SDP answer     │
     │                                          │
     │◄═══════════ WebRTC DataChannel ══════════►│
     │         (direct P2P, E2E encrypted)       │
```

## 1. Prerequisites

- A Cloudflare account (free tier is sufficient)
- `wrangler` CLI: `npm install -D wrangler` (already in devDependencies)
- Node.js 18+

## 2. Configure TURN (optional but recommended)

TURN relay is needed for peers behind symmetric NAT. Without it, most connections work (STUN-only), but some network configurations will fail.

### Option A: Cloudflare Calls TURN (recommended — same account)
```bash
npx wrangler secret put TURN_CF_URL
npx wrangler secret put TURN_CF_USERNAME
npx wrangler secret put TURN_CF_CREDENTIAL
```

### Option B: Metered TURN (free 50 GB/month)
```bash
npx wrangler secret put TURN_METERED_URL
npx wrangler secret put TURN_METERED_USERNAME
npx wrangler secret put TURN_METERED_CREDENTIAL
```

### Both (CF primary, Metered fallback)
Set all six secrets. The Worker assembles the ICE server array in order.

## 3. Local Development

```bash
# Terminal 1: Cloudflare Worker (Durable Objects + static assets)
npm run dev:worker

# Terminal 2: Vite dev server (HMR — proxies /api to the worker)
npm run dev
```

The Vite dev server proxies `/api/*` (including WebSocket upgrade) to `http://127.0.0.1:8787` where `wrangler dev` runs the Worker locally with Durable Objects.

## 4. Deploy to Cloudflare

```bash
# Build the frontend + deploy the Worker (static assets + DO signaling)
npm run deploy
```

This runs `tsc -b && vite build && wrangler deploy`. The Worker serves static assets from `dist/` with SPA fallback, and handles `/api/room`, `/api/room/:id/ws`, and `/api/ice-servers` routes.

## 5. Cloudflare Dashboard (alternative)

If you prefer Git-based deploys:
1. Go to **Workers & Pages** → **Create** → **Connect to Git**
2. Select this repository
3. Build command: `npm run build`
4. Deploy command: `npx wrangler deploy`
5. Set TURN secrets via the dashboard **Settings → Variables → Encrypt**

## Free Tier Limits

| Resource | Free Tier Allowance | AuraShare Usage |
|---|---|---|
| Durable Object requests | 100k/day | ~10 per session (WS upgrade + relay) |
| WebSocket messages | 400k/day | ~50 per session (SDP + ICE trickle) |
| Workers requests | 100k/day | Static asset + API calls |
| Static asset bandwidth | Unlimited | Served from edge cache |

One room session uses ~60 DO/WS operations. The free tier supports **~1,600 concurrent sessions per day**.

## Security

- WebRTC data is DTLS-encrypted end-to-end (no server sees file content)
- Room codes use Crockford base32 (excludes I/L/O/U) — 6 chars = ~30 bits
- Room DOs auto-evict after 30 minutes of inactivity
- TURN credentials are injected via `wrangler secret` — never committed to git
- The signaling relay is "dumb" — it forwards messages without inspecting content
