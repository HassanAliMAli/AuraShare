import type { FileDescriptor } from '../types';
import { Crc32 } from './protocol';
import { MAX_DIRECT_FILE_SIZE } from './validation';

const BLOCK_BYTES = 1024 * 1024;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const STORE = 'partial';

type Picker = (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;
export type PartialFile = {
  id: string;
  file: FileDescriptor;
  offset: number;
  crc: number;
  digest: string;
  fingerprint?: string;
  expires: number;
};

function picker(): Picker | undefined {
  return (window as Window & { showSaveFilePicker?: Picker }).showSaveFilePicker;
}

export function supportsDirectSave(): boolean {
  return window.isSecureContext && typeof picker() === 'function' &&
    typeof globalThis.FileSystemFileHandle?.prototype.createWritable === 'function';
}

export function matchesPartial(partial: PartialFile, file: FileDescriptor): boolean {
  return partial.file.name === file.name && partial.file.size === file.size && partial.file.type === file.type;
}

export function saveError(error: unknown): string {
  switch (error instanceof DOMException ? error.name : '') {
    case 'AbortError': return 'Save cancelled.';
    case 'SecurityError':
    case 'NotAllowedError': return 'Permission to save or access local storage was denied.';
    case 'QuotaExceededError': return 'Disk or browser storage is full. Free space and try again.';
    case 'NoModificationAllowedError': return 'The file is already open for writing. Close it or choose another destination.';
    default:
      if (error instanceof DOMException) return 'Could not write the file or update its local checkpoint. Check permissions and available disk space.';
      return error instanceof Error ? error.message : 'Could not write the file.';
  }
}

const EMPTY_DIGEST = '0'.repeat(64);

async function hashBlock(previous: string, block: Uint8Array): Promise<string> {
  const bytes = new Uint8Array(32 + block.byteLength);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(previous.slice(i * 2, i * 2 + 2), 16);
  bytes.set(block, 32);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const isDigest = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

export async function fingerprintFile(
  file: Blob, offset: number, prefix: string | undefined, expected: string | undefined, signal: AbortSignal,
): Promise<{ fingerprint: string; crc: Crc32 }> {
  const crc = new Crc32();
  let fingerprint = EMPTY_DIGEST;
  for (let start = 0; start < file.size; start += BLOCK_BYTES) {
    signal.throwIfAborted();
    const block = new Uint8Array(await file.slice(start, start + BLOCK_BYTES).arrayBuffer());
    fingerprint = await hashBlock(fingerprint, block);
    if (start < offset) crc.update(block);
    if (start + BLOCK_BYTES === offset && fingerprint !== prefix) {
      throw new Error('The selected file does not match the saved prefix. Choose Start over or reselect the original file.');
    }
  }
  if (expected && fingerprint !== expected) {
    throw new Error('The selected file differs from the original. Choose Start over or reselect the original file.');
  }
  return { fingerprint, crc };
}

export function validPrefix(offset: unknown, digest: unknown): offset is number {
  return typeof offset === 'number' && Number.isSafeInteger(offset) && offset > 0 &&
    offset <= MAX_DIRECT_FILE_SIZE && offset % BLOCK_BYTES === 0 && isDigest(digest);
}

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('aurashare-receive', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transact<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined);
    const request = run(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(request.error ?? transaction.error);
  });
}

function clearPartial(db: IDBDatabase): Promise<undefined> {
  return transact(db, 'readwrite', (store) => store.clear());
}

async function readPartial(db: IDBDatabase): Promise<PartialFile | null> {
  const record: PartialFile | undefined = await transact(db, 'readonly', (store) => store.get('metadata'));
  if (record === undefined) return null;
  if (!record || !validPrefix(record.offset, record.digest) || !isDigest(record.fingerprint) || !record.file ||
      !Number.isSafeInteger(record.file.size) || record.file.size < record.offset ||
      record.file.size > MAX_DIRECT_FILE_SIZE || typeof record.file.name !== 'string' ||
      typeof record.file.type !== 'string' || !/^[a-f0-9]{32}$/.test(record.id) ||
      !Number.isInteger(record.crc) || record.crc < 0 || record.crc > 0xffffffff ||
      !Number.isFinite(record.expires) || record.expires <= Date.now()) {
    await clearPartial(db);
    return null;
  }
  return record;
}

async function withStore<T>(work: (db: IDBDatabase) => Promise<T>, wait = false): Promise<T> {
  return navigator.locks.request('aurashare-receive', { ifAvailable: !wait }, async (lock) => {
    if (!lock) throw new Error('A direct save is already active in another tab.');
    const db = await openStore();
    try { return await work(db); } finally { db.close(); }
  });
}

function supportsCheckpoints(): boolean {
  return typeof indexedDB !== 'undefined' && Boolean(navigator.locks);
}

export async function savedPartial(): Promise<PartialFile | null> {
  return supportsCheckpoints() ? withStore(readPartial, true) : null;
}

export async function discardSavedPartial(id: string): Promise<void> {
  await withStore(async (db) => {
    if ((await readPartial(db))?.id === id) await clearPartial(db);
  });
}

export class DirectSave {
  private readonly block = new Uint8Array(BLOCK_BYTES);
  private used = 0;
  private pending: Promise<void> = Promise.resolve();
  private readonly crc = new Crc32();

  private readonly output: FileSystemWritableFileStream;
  private readonly record: PartialFile;
  private readonly db?: IDBDatabase;
  private readonly unlock?: () => void;

  private constructor(output: FileSystemWritableFileStream, record: PartialFile, db?: IDBDatabase, unlock?: () => void) {
    this.output = output;
    this.record = record;
    this.db = db;
    this.unlock = unlock;
  }

  get offset(): number { return this.record.offset; }
  get digest(): string { return this.record.digest; }
  get fingerprint(): string | undefined { return this.record.fingerprint; }
  setFingerprint(fingerprint: string): void { this.record.fingerprint = fingerprint; }
  get checksum(): number { return this.crc.value; }

  static async open(file: FileDescriptor, id: string, resumeId?: string, replaceId?: string, directOnly = false, signal?: AbortSignal): Promise<DirectSave> {
    const choose = picker();
    if (!supportsDirectSave() || !choose) throw new Error('Direct saving requires a supported browser and a secure connection.');
    // Invoke synchronously while the button still has transient user activation.
    const handle = await choose.call(window, { suggestedName: file.name });
    signal?.throwIfAborted();
    const record: PartialFile = { id, file, offset: 0, crc: 0, digest: EMPTY_DIGEST, expires: 0 };
    if (directOnly || !supportsCheckpoints()) {
      if (resumeId) throw new Error('Checkpoint storage is unavailable.');
      return new DirectSave(await handle.createWritable({ mode: 'exclusive' } as FileSystemCreateWritableOptions), record);
    }
    return new Promise((resolve, reject) => {
      void withStore(async (db) => {
        const partial = await readPartial(db);
        if (resumeId && (!partial || partial.id !== resumeId || !matchesPartial(partial, file))) {
          throw new Error('The saved partial no longer matches this file. Choose Start over.');
        }
        if (partial && partial.id !== resumeId && partial.id !== replaceId) {
          throw new Error('Resume or discard the saved partial, or save without keeping a checkpoint.');
        }
        const output = await handle.createWritable({ mode: 'exclusive' } as FileSystemCreateWritableOptions);
        await new Promise<void>((unlock) => {
          const save = new DirectSave(output, resumeId && partial ? partial : record, db, unlock);
          void (async () => {
            if (resumeId) await save.restore(signal);
            else if (partial) await clearPartial(db);
            signal?.throwIfAborted();
            resolve(save);
          })().catch(async (error: unknown) => {
            await save.abort();
            reject(error);
          });
        });
      }).catch(reject);
    });
  }

  private async restore(signal?: AbortSignal): Promise<void> {
    let digest = EMPTY_DIGEST;
    for (let offset = 0; offset < this.offset; offset += BLOCK_BYTES) {
      signal?.throwIfAborted();
      const block: unknown = await transact(this.db!, 'readonly', (store) => store.get(offset));
      if (!(block instanceof ArrayBuffer) || block.byteLength !== BLOCK_BYTES) throw new Error('The saved partial is damaged. Choose Start over.');
      const bytes = new Uint8Array(block);
      digest = await hashBlock(digest, bytes);
      this.crc.update(bytes);
      await this.output.write(block);
    }
    if (digest !== this.digest || this.crc.value !== this.record.crc) throw new Error('The saved partial is damaged. Choose Start over.');
  }

  write(payload: ArrayBuffer): Promise<void> {
    this.pending = this.writeChunk(payload);
    return this.pending;
  }

  private async writeChunk(payload: ArrayBuffer): Promise<void> {
    await this.output.write(payload);
    const bytes = new Uint8Array(payload);
    const head = Math.min(bytes.length, BLOCK_BYTES - this.used);
    this.block.set(bytes.subarray(0, head), this.used);
    this.used += head;
    if (this.used < BLOCK_BYTES) return;

    const previous = this.record.offset;
    const offset = previous + BLOCK_BYTES;
    const digest = await hashBlock(this.digest, this.block);
    this.crc.update(this.block);
    const checkpoint = { ...this.record, offset, digest, crc: this.crc.value, expires: Date.now() + RETENTION_MS };
    if (this.db) await transact(this.db, 'readwrite', (store) => {
      store.put(this.block.buffer, previous);
      return store.put(checkpoint, 'metadata');
    });
    Object.assign(this.record, checkpoint);
    this.block.set(bytes.subarray(head), 0);
    this.used = bytes.length - head;
  }

  async finish(): Promise<string | undefined> {
    const fingerprint = this.used
      ? await hashBlock(this.digest, this.block.subarray(0, this.used))
      : this.digest;
    if (fingerprint !== this.fingerprint) {
      await this.abort(true);
      throw new Error('Received data does not match the announced file fingerprint.');
    }
    await this.output.close();
    try { if (this.db) await clearPartial(this.db); }
    catch { return 'File saved. The local checkpoint could not be removed. Use Discard partial to remove it.'; }
    finally { this.unlock?.(); }
  }

  async abort(drop = false): Promise<void> {
    try {
      const aborted = this.output.abort().catch(() => undefined);
      await this.pending.catch(() => undefined);
      await aborted;
      if (drop && this.db) await clearPartial(this.db);
    } finally { this.unlock?.(); }
  }
}
