/**
 * Pure formatting helpers — no React imports.
 */

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), BYTE_UNITS.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${BYTE_UNITS[i]}`;
}

const ARCHIVE_EXTS = ['zip', 'rar', '7z', 'tar', 'gz'] as const;

/** Icon key used by the <FileIcon> component to pick the right lucide glyph. */
export type FileIconKey = 'image' | 'video' | 'audio' | 'text' | 'archive' | 'pdf' | 'file';

export function getFileIconKey(name: string, type: string): FileIconKey {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('text/')) return 'text';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ARCHIVE_EXTS.includes(ext as (typeof ARCHIVE_EXTS)[number])) return 'archive';
  if (ext === 'pdf') return 'pdf';
  return 'file';
}
