/** Cancellable delays used by network, transfer, and renewal operations. */
export function abortError(): DOMException { return new DOMException('Session closed', 'AbortError'); }
export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const finish = () => { signal.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(abortError()); };
    signal.addEventListener('abort', abort, { once: true });
  });
}
