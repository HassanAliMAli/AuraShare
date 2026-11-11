import { describe, expect, it } from 'vitest';
import { formatBytes, getFileIconKey } from '@/lib/format';

describe('lib/format — formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1, '1 B'],
    [512, '512 B'],
    [1023, '1023 B'],
    [1024, '1 KB'],
    [1536, '1.5 KB'],
    [1024 * 1024, '1 MB'],
    [1024 * 1024 * 1024, '1 GB'],
    [1024 ** 4, '1 TB'],
  ])('formats %i bytes as %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });

  it('caps the unit list at terabytes', () => {
    expect(formatBytes(1024 ** 5)).toBe('1024 TB');
  });
});

describe('lib/format — getFileIconKey', () => {
  it.each([
    ['photo.jpg', 'image/jpeg', 'image'],
    ['clip.mp4', 'video/mp4', 'video'],
    ['song.mp3', 'audio/mpeg', 'audio'],
    ['readme.md', 'text/markdown', 'text'],
  ] as const)('maps %s (%s) to %s', (name, type, expected) => {
    expect(getFileIconKey(name, type)).toBe(expected);
  });

  it('falls back to the extension for MIME-less archives', () => {
    expect(getFileIconKey('backup.zip', '')).toBe('archive');
    expect(getFileIconKey('bundle.tar.gz', '')).toBe('archive');
    expect(getFileIconKey('archive.7z', '')).toBe('archive');
    expect(getFileIconKey('UPPER.ZIP', '')).toBe('archive');
  });

  it('detects PDFs by extension regardless of MIME', () => {
    expect(getFileIconKey('doc.pdf', 'application/pdf')).toBe('pdf');
    expect(getFileIconKey('doc.PDF', '')).toBe('pdf');
  });

  it('prefers a known MIME over an unrelated extension', () => {
    expect(getFileIconKey('archive.zip', 'image/png')).toBe('image');
  });

  it('returns the generic key for unknown or extension-less names', () => {
    expect(getFileIconKey('unknown.xyz', '')).toBe('file');
    expect(getFileIconKey('LICENSE', '')).toBe('file');
  });
});
