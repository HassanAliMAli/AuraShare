import { describe, expect, it } from 'vitest';
import {
  MAX_FILE_SIZE,
  sanitizeFilename,
  validateFile,
  validateFileList,
} from '@/lib/validation';
import { createFile } from '../shared/fixtures';

describe('lib/validation — validateFile', () => {
  it('accepts a normal file and returns it unchanged', () => {
    const file = createFile('notes.txt', 1024);
    const result = validateFile(file);
    expect(result).toEqual({ success: true, data: file });
  });

  it('rejects an empty file', () => {
    const result = validateFile(createFile('empty.txt', 0));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('empty');
  });

  it('accepts a file exactly at the size limit', () => {
    const result = validateFile(createFile('boundary.bin', MAX_FILE_SIZE, 'application/octet-stream'));
    expect(result.success).toBe(true);
  });

  it('rejects a file one byte over the limit with context', () => {
    const result = validateFile(
      createFile('huge.bin', MAX_FILE_SIZE + 1, 'application/octet-stream'),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('too_large');
      expect(result.error.maxSize).toBe(MAX_FILE_SIZE);
      expect(result.error.actualSize).toBe(MAX_FILE_SIZE + 1);
      expect(result.error.message).toContain('256 MiB');
    }
  });

  it('accepts files with no MIME type', () => {
    expect(validateFile(createFile('archive.zip', 32, '')).success).toBe(true);
  });

  it.each(['image/png', 'video/mp4', 'audio/mpeg', 'application/pdf', 'text/plain'])(
    'accepts the allowed prefix %s',
    (type) => {
      expect(validateFile(createFile('allowed.dat', 32, type)).success).toBe(true);
    },
  );

  it.each(['font/woff2', 'model/gltf-binary', 'multipart/form-data'])(
    'rejects the disallowed type %s',
    (type) => {
      const result = validateFile(createFile('blocked.dat', 32, type));
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('mime_not_allowed');
    },
  );
});

describe('lib/validation — validateFileList', () => {
  it('separates valid files from invalid ones', () => {
    const good = createFile('good.txt', 10);
    const empty = createFile('empty.txt', 0);
    const bad = createFile('bad.woff2', 10, 'font/woff2');

    const result = validateFileList([good, empty, bad]);

    expect(result.valid).toEqual([good]);
    expect(result.errors.map((entry) => entry.fileName)).toEqual(['empty.txt', 'bad.woff2']);
  });

  it('accepts a FileList-like collection', () => {
    const file = createFile('one.txt', 10);
    const list = Object.create(FileList.prototype) as FileList;
    Object.defineProperties(list, {
      0: { value: file, enumerable: true },
      length: { value: 1 },
    });

    expect(validateFileList(list).valid).toEqual([file]);
  });

  it('returns empty buckets for an empty list', () => {
    expect(validateFileList([])).toEqual({ valid: [], errors: [] });
  });
});

describe('lib/validation — sanitizeFilename', () => {
  it('strips path separators and collapses traversal segments', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('._._etc_passwd');
    expect(sanitizeFilename('..\\..\\windows\\system32')).toBe('._._windows_system32');
  });

  it('strips control and reserved characters', () => {
    expect(sanitizeFilename('file\x00name')).toBe('file_name');
    expect(sanitizeFilename('file<name>')).toBe('file_name_');
    expect(sanitizeFilename('a:b*c?d"e|f')).toBe('a_b_c_d_e_f');
  });

  it('caps the result at 255 characters', () => {
    expect(sanitizeFilename('a'.repeat(300))).toHaveLength(255);
  });

  it('preserves already-safe filenames', () => {
    expect(sanitizeFilename('my-file_v1.2.txt')).toBe('my-file_v1.2.txt');
    expect(sanitizeFilename('')).toBe('');
  });

  it('collapses repeated dots but keeps a normal extension', () => {
    expect(sanitizeFilename('report..pdf')).toBe('report.pdf');
  });
});
