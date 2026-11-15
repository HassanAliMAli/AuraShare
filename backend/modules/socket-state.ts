/** All attachment writers merge current state; network awaits must never restore old counters. */
export function readSocketState(socket: WebSocket): Record<string, unknown> {
  const data: unknown = socket.deserializeAttachment();
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
}

export function patchSocketState(socket: WebSocket, patch: Record<string, unknown>): void {
  const next = { ...readSocketState(socket), ...patch };
  // Leave headroom below the runtime's 2,048-byte structured-clone attachment limit.
  if (new TextEncoder().encode(JSON.stringify(next)).byteLength > 1800) {
    throw new Error('Socket state exceeds its budget');
  }
  socket.serializeAttachment(next);
}
