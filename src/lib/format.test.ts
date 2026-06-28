import { describe, it, expect } from 'vitest';
import { formatBytes, getFileIconKey } from './format';

describe('formatBytes', () => {
  it('returns "0 B" for zero', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });

  it('caps at terabytes', () => {
    expect(formatBytes(1024 ** 4)).toBe('1 TB');
    // 1024^5 is 1024 TB since we cap at the TB unit (no PB in the array).
    expect(formatBytes(1024 ** 5)).toBe('1024 TB');
  });
});

describe('getFileIconKey', () => {
  it('returns "image" for image MIME types', () => {
    expect(getFileIconKey('photo.jpg', 'image/jpeg')).toBe('image');
    expect(getFileIconKey('photo.png', 'image/png')).toBe('image');
  });

  it('returns "video" for video MIME types', () => {
    expect(getFileIconKey('clip.mp4', 'video/mp4')).toBe('video');
  });

  it('returns "audio" for audio MIME types', () => {
    expect(getFileIconKey('song.mp3', 'audio/mpeg')).toBe('audio');
  });

  it('returns "text" for text MIME types', () => {
    expect(getFileIconKey('readme.md', 'text/markdown')).toBe('text');
  });

  it('returns "archive" for archive extensions', () => {
    expect(getFileIconKey('backup.zip', '')).toBe('archive');
    expect(getFileIconKey('data.tar.gz', '')).toBe('archive');
    expect(getFileIconKey('archive.7z', '')).toBe('archive');
  });

  it('returns "pdf" for .pdf extension', () => {
    expect(getFileIconKey('doc.pdf', 'application/pdf')).toBe('pdf');
  });

  it('returns "file" as fallback', () => {
    expect(getFileIconKey('unknown.xyz', '')).toBe('file');
  });
});
