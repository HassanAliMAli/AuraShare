// SSE Relay for Cloudflare Pages Functions
// Provides real-time "push" signaling between two devices

interface Env {
  ROOMS: KVNamespace;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  // 1. Establish the Real-time SSE Tunnel (GET) with ultra-fast polling
  if (request.method === "GET" && path.startsWith("/api/tunnel/")) {
    const tunnelId = path.split("/").pop();

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode("retry: 100\n\n"));

        let attempts = 0;
        while (attempts < 300) {
          const msg = await env.ROOMS.get(`tunnel:${tunnelId}`, 'json');
          if (msg) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
            await env.ROOMS.delete(`tunnel:${tunnelId}`);
          }
          await new Promise(r => setTimeout(r, 20));
          attempts++;
        }
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  // 2. Push Data into the Tunnel (POST)
  if (request.method === "POST" && path.startsWith("/api/push/")) {
    const tunnelId = path.split("/").pop();
    const data = await request.json();

    await env.ROOMS.put(`tunnel:${tunnelId}`, JSON.stringify(data), { expirationTtl: 60 });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  // 3. Room Management
  if (request.method === "POST" && path === "/api/room") {
    const { offer } = await request.json() as any;
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    await env.ROOMS.put(`room:${roomId}:offer`, JSON.stringify(offer), { expirationTtl: 600 });
    return new Response(JSON.stringify({ roomId }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  if (request.method === "GET" && path.match(/\/api\/room\/([A-Z0-9]+)$/)) {
    const roomId = path.split("/").pop();
    const offer = await env.ROOMS.get(`room:${roomId}:offer`);
    if (!offer) return new Response("Not found", { status: 404, headers: CORS_HEADERS });
    return new Response(offer, {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  return new Response("Not found", { status: 404, headers: CORS_HEADERS });
};
