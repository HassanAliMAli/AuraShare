interface Env {
  ROOMS: KVNamespace;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Verify KV Binding
  if (!env.ROOMS) {
    return new Response(JSON.stringify({ 
      error: "KV Binding Missing", 
      message: "Please bind a KV namespace named 'ROOMS' in your Cloudflare Pages settings." 
    }), { 
      status: 500, 
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
    });
  }

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // POST /api/room -> Create room
  if (request.method === "POST" && path === "/api/room") {
    try {
      const body: any = await request.json();
      const offer = body.offer;
      
      if (!offer) {
        return new Response("Missing offer", { status: 400, headers: CORS_HEADERS });
      }

      const roomId = generateRoomId();
      await env.ROOMS.put(`room:${roomId}:offer`, JSON.stringify(offer), { expirationTtl: 600 });
      
      return new Response(JSON.stringify({ roomId }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response("Invalid JSON", { status: 400, headers: CORS_HEADERS });
    }
  }

  // GET /api/room/:id -> Get offer
  const roomMatch = path.match(/^\/api\/room\/([A-Z0-9]+)$/);
  if (request.method === "GET" && roomMatch) {
    const roomId = roomMatch[1];
    const offer = await env.ROOMS.get(`room:${roomId}:offer`);
    
    if (!offer) {
      return new Response("Room not found or expired", { status: 404, headers: CORS_HEADERS });
    }
    
    return new Response(JSON.stringify({ offer: JSON.parse(offer) }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  // POST /api/room/:id/answer -> Post answer
  const answerMatch = path.match(/^\/api\/room\/([A-Z0-9]+)\/answer$/);
  if (request.method === "POST" && answerMatch) {
    try {
      const roomId = answerMatch[1];
      const body: any = await request.json();
      const answer = body.answer;
      
      if (!answer) {
        return new Response("Missing answer", { status: 400, headers: CORS_HEADERS });
      }

      const offerExists = await env.ROOMS.get(`room:${roomId}:offer`);
      if (!offerExists) {
        return new Response("Room not found", { status: 404, headers: CORS_HEADERS });
      }

      await env.ROOMS.put(`room:${roomId}:answer`, JSON.stringify(answer), { expirationTtl: 600 });
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response("Invalid JSON", { status: 400, headers: CORS_HEADERS });
    }
  }

  // GET /api/room/:id/answer -> Poll for answer
  if (request.method === "GET" && answerMatch) {
    const roomId = answerMatch[1];
    const answer = await env.ROOMS.get(`room:${roomId}:answer`);
    
    if (!answer) {
      return new Response(JSON.stringify({ answer: null }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }
    
    return new Response(JSON.stringify({ answer: JSON.parse(answer) }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  return new Response("Not found", { status: 404, headers: CORS_HEADERS });
};
