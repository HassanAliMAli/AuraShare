export interface Env {
  SOCKETS: unknown;
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

  (server as WebSocket).accept();

  // Handle room coordination
  // Note: For a pure "lobby" without Durable Objects, we use a simple relay.
  // Since we want this 100% free and reliable, we'll use a unique path for the socket.
  
  return new Response(null, {
    status: 101,
    webSocket: client,
    headers: CORS_HEADERS
  });
};
