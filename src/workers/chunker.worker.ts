/**
 * Web Worker: file slicing + SHA-256 hashing off the main thread.
 * Receives a File, slices it into chunks, and posts each chunk back with its
 * SHA-256 hash. The main thread forwards chunks over the RTC data channel.
 */

/// <reference lib="webworker" />

const CHUNK_SIZE = 64 * 1024;

self.onmessage = async (e: MessageEvent<{ file: File; fileIndex: number }>) => {
  const { file, fileIndex } = e.data;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  for (let offset = 0, chunkNum = 0; offset < file.size; offset += CHUNK_SIZE, chunkNum++) {
    const slice = file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size));
    const buffer = await slice.arrayBuffer();

    // Hash the chunk for integrity verification on the receiver side.
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    const progress = Math.min(((chunkNum + 1) / totalChunks) * 100, 99);

    (self as unknown as Worker).postMessage(
      {
        type: 'chunk',
        fileIndex,
        chunkNum,
        totalChunks,
        buffer,
        hash: hashHex,
        progress,
      },
      [buffer],
    );
  }

  (self as unknown as Worker).postMessage({ type: 'done', fileIndex });
};
