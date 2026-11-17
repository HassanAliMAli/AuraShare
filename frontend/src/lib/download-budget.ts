import { abortError } from './async';
import { MAX_FILE_SIZE, sanitizeFilename } from './validation';

// Reserve up to two copies for assembly/File creation, plus retained Blob URLs.
export const DOWNLOAD_MEMORY_BUDGET = 2 * MAX_FILE_SIZE;
const OBJECT_URL_TTL_MS = 60_000;

/** A received file held in memory until the user asks to save it. */
export type PreparedDownload = {
  url: string;
  name: string;
  size: number;
};

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

  /**
   * Hold a received file without starting a download.
   *
   * A programmatic `a.click()` outside a user gesture is routinely ignored or
   * silently blocked, which used to leave the receiver believing a file had
   * been saved when nothing reached the disk. Callers must keep this handle
   * and spend it from a real click.
   */
  prepare(file: File): PreparedDownload {
    if (this.retainedBytes + file.size > DOWNLOAD_MEMORY_BUDGET) {
      throw new Error('Download memory budget exceeded');
    }
    const url = URL.createObjectURL(file);
    this.urls.set(url, file.size);
    this.retainedBytes += file.size;
    return { url, name: sanitizeFilename(file.name), size: file.size };
  }

  /** Start a prepared save. Call from the user's click/keyboard handler. */
  save(download: PreparedDownload): void {
    const size = this.urls.get(download.url);
    if (size === undefined) throw new Error('Download is no longer available');
    let link: HTMLAnchorElement | null = null;
    try {
      link = document.createElement('a');
      link.href = download.url;
      link.download = download.name;
      document.body.appendChild(link);
      link.click();
    } catch (error) {
      this.release(download.url);
      throw error;
    } finally { link?.remove(); }
    // Independent of React/session lifetime: do not interrupt an initiated save.
    setTimeout(() => this.release(download.url), OBJECT_URL_TTL_MS);
  }

  /** Drop an unsaved file when its session ends. */
  discard(download: PreparedDownload): void {
    this.release(download.url);
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
