import { abortError } from './async';
import { MAX_FILE_SIZE, sanitizeFilename } from './validation';

// Reserve up to two copies for assembly/File creation, plus retained Blob URLs.
export const DOWNLOAD_MEMORY_BUDGET = 2 * MAX_FILE_SIZE;
const OBJECT_URL_TTL_MS = 60_000;

/** Page-wide download accounting survives session resets and route unmounts. */
export class DownloadBudget {
  private readonly urls = new Map<string, number>();
  private readonly waiters = new Set<() => void>();
  private retainedBytes = 0;

  hasCapacity(size: number): boolean {
    return this.retainedBytes + size * 2 <= DOWNLOAD_MEMORY_BUDGET;
  }

  waitForCapacity(size: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(abortError());
    if (size > MAX_FILE_SIZE) return Promise.reject(new Error('File exceeds the memory budget'));
    if (this.hasCapacity(size)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => { this.waiters.delete(check); signal.removeEventListener('abort', abort); };
      const check = () => { if (this.hasCapacity(size)) { cleanup(); resolve(); } };
      const abort = () => { cleanup(); reject(abortError()); };
      this.waiters.add(check);
      signal.addEventListener('abort', abort, { once: true });
    });
  }

  save(file: File): void {
    if (this.retainedBytes + file.size > DOWNLOAD_MEMORY_BUDGET) throw new Error('Download memory budget exceeded');
    const url = URL.createObjectURL(file);
    this.urls.set(url, file.size);
    this.retainedBytes += file.size;
    let link: HTMLAnchorElement | null = null;
    try {
      link = document.createElement('a');
      link.href = url;
      link.download = sanitizeFilename(file.name);
      document.body.appendChild(link);
      link.click();
    } catch (error) {
      this.release(url);
      throw error;
    } finally { link?.remove(); }
    // Independent of React/session lifetime: do not interrupt an initiated save.
    setTimeout(() => this.release(url), OBJECT_URL_TTL_MS);
  }

  private release(url: string): void {
    const size = this.urls.get(url);
    if (size === undefined) return;
    URL.revokeObjectURL(url);
    this.urls.delete(url);
    this.retainedBytes -= size;
    for (const check of [...this.waiters]) check();
  }
}

// Re-entering /app must account for URLs retained by a previous provider.
export const downloadBudget = new DownloadBudget();
