interface Env {
  ROOMS: KVNamespace;
}

type RoomData = {
  offer?: string | null;
  answer?: string | null;
  offererConnected?: boolean;
  answererConnected?: boolean;
  created?: number;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:openrelay.metered.ca:80' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelay', credential: 'openrelay' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelay', credential: 'openrelay' }
];

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  // GET ice servers config
  if (request.method === "GET" && path === "/api/ice-servers") {
    return new Response(JSON.stringify({ iceServers: ICE_SERVERS }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  // Create a new share room (sender calls this)
  if (request.method === "POST" && path === "/api/room") {
    const { type } = await request.json() as { type?: string };
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const key = `room:${roomId}`;
    const existing = await env.ROOMS.get(key, 'json');

    if (existing && type === 'sender') {
      return new Response(JSON.stringify({ roomId, status: 'exists' }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    await env.ROOMS.put(key, JSON.stringify({
      created: Date.now(),
      offer: null,
      answer: null,
      offererConnected: false,
      answererConnected: false,
    }), { expirationTtl: 300 });

    return new Response(JSON.stringify({ roomId }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  // Sender: store WebRTC offer
  if (request.method === "POST" && path.startsWith("/api/room/") && path.endsWith("/offer")) {
    const roomId = path.split("/")[3];
    const { offer } = await request.json() as { offer: string };
    const key = `room:${roomId}`;
    const room = await env.ROOMS.get(key, 'json') as { offer?: string; answer?: string; offererConnected?: boolean; answererConnected?: boolean; created?: number } | null;

    if (!room) return new Response("Room not found", { status: 404, headers: CORS_HEADERS });

    room.offer = offer;
    room.offererConnected = true;
    room.created = Date.now();
    await env.ROOMS.put(key, JSON.stringify(room), { expirationTtl: 300 });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  // Receiver: fetch WebRTC offer
  if (request.method === "GET" && path.match(/\/api\/room\/([A-Z0-9]+)\/offer$/)) {
    const roomId = path.split("/")[3];
    const key = `room:${roomId}`;
    const room = await env.ROOMS.get(key, 'json') as RoomData | null;

    if (!room) return new Response("Room not found", { status: 404, headers: CORS_HEADERS });

    return new Response(JSON.stringify({ offer: room.offer }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  // Receiver: store WebRTC answer
  if (request.method === "POST" && path.match(/\/api\/room\/([A-Z0-9]+)\/answer$/)) {
    const roomId = path.split("/")[3];
    const { answer } = await request.json() as { answer: string };
    const key = `room:${roomId}`;
    const room = await env.ROOMS.get(key, 'json') as RoomData | null;

    if (!room) return new Response("Room not found", { status: 404, headers: CORS_HEADERS });

    room.answer = answer;
    room.answererConnected = true;
    room.created = Date.now();
    await env.ROOMS.put(key, JSON.stringify(room), { expirationTtl: 300 });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  // Sender: fetch WebRTC answer
  if (request.method === "GET" && path.match(/\/api\/room\/([A-Z0-9]+)\/answer$/)) {
    const roomId = path.split("/")[3];
    const key = `room:${roomId}`;
    const room = await env.ROOMS.get(key, 'json') as RoomData | null;

    if (!room) return new Response("Room not found", { status: 404, headers: CORS_HEADERS });

    return new Response(JSON.stringify({ answer: room.answer }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  // Status check
  if (request.method === "GET" && path.match(/\/api\/room\/([A-Z0-9]+)$/)) {
    const roomId = path.split("/")[3];
    const key = `room:${roomId}`;
    const room = await env.ROOMS.get(key, 'json') as RoomData | null;

    if (!room) return new Response("Room not found", { status: 404, headers: CORS_HEADERS });

    return new Response(JSON.stringify({
      hasOffer: !!room.offer,
      hasAnswer: !!room.answer,
      offererConnected: room.offererConnected,
      answererConnected: room.answererConnected,
    }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  // DELETE room
  if (request.method === "DELETE" && path.match(/\/api\/room\/([A-Z0-9]+)$/)) {
    const roomId = path.split("/")[3];
    await env.ROOMS.delete(`room:${roomId}`);
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  return new Response("Not found", { status: 404, headers: CORS_HEADERS });
};
