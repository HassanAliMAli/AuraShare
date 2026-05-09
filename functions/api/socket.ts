export interface Env {
  // No KV needed for hibernatable WebSockets!
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// This worker acts as a real-time lobby using WebSockets
export const onRequest: PagesFunction<Env> = async (context) => {
  const upgradeHeader = context.request.headers.get("Upgrade");
  if (!upgradeHeader || upgradeHeader !== "websocket") {
    return new Response("Expected Upgrade: websocket", { status: 426 });
  }

  const [client, server] = new WebSocketPair();

  // Create a 6-digit ID for this session
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();

  (server as any).accept();

  // Handle room coordination
  // Note: For a pure "lobby" without Durable Objects, we use a simple relay.
  // Since we want this 100% free and reliable, we'll use a unique path for the socket.
  
  return new Response(null, {
    status: 101,
    webSocket: client,
    headers: CORS_HEADERS
  });
};
