import { describe, it, expect } from 'vitest';
import { validateFile, validateFileList, sanitizeFilename, MAX_FILE_SIZE } from './validation';

function createFile(name: string, size: number, type: string = 'text/plain'): File {
  return new File([new ArrayBuffer(size)], name, { type });
}

describe('validateFile', () => {
  it('accepts a valid file', () => {
    const file = createFile('test.txt', 1024);
    const result = validateFile(file);
    expect(result.success).toBe(true);
  });

  it('rejects empty files', () => {
    const file = createFile('empty.txt', 0);
    const result = validateFile(file);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('empty');
  });

  it('rejects files exceeding MAX_FILE_SIZE', () => {
    const file = createFile('huge.bin', 1, 'application/octet-stream');
    Object.defineProperty(file, 'size', { value: MAX_FILE_SIZE + 1 });
    const result = validateFile(file);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('too_large');
  });

  it('accepts files with empty type (archives without registered MIME)', () => {
    const file = createFile('backup.zip', 1024, '');
    const result = validateFile(file);
    expect(result.success).toBe(true);
  });

  it('rejects disallowed MIME types', () => {
    // `application/` is in the allow-list, so use a type outside it.
    const file = createFile('font.woff2', 1024, 'font/woff2');
    const result = validateFile(file);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('mime_not_allowed');
  });
});

describe('validateFileList', () => {
  it('separates valid and invalid files', () => {
    const files = [
      createFile('good.txt', 1024),
      createFile('empty.txt', 0),
      createFile('also-good.png', 2048, 'image/png'),
    ];
    const { valid, errors } = validateFileList(files);
    expect(valid).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.fileName).toBe('empty.txt');
  });
});

describe('sanitizeFilename', () => {
  it('strips path separators and collapses path traversal', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('._._etc_passwd');
  });

  it('strips control characters', () => {
    expect(sanitizeFilename('file\x00name')).toBe('file_name');
  });

  it('strips angle brackets and quotes', () => {
    expect(sanitizeFilename('file<name>')).toBe('file_name_');
    expect(sanitizeFilename('file"name')).toBe('file_name');
  });

  it('caps at 255 characters', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeFilename(long)).toHaveLength(255);
  });

  it('preserves safe filenames', () => {
    expect(sanitizeFilename('my-file_v1.2.txt')).toBe('my-file_v1.2.txt');
  });
});
