/**
 * File security validation + sanitization.
 * Pure functions — no React imports.
 */

/** Maximum number of files announced in one share. */
export const MAX_FILES_PER_TRANSFER = 32;

/**
 * Hard ceiling for a single file.
 * The receiver assembles files in memory, so the limit is deliberately
 * conservative — a 256 MiB file peaks at roughly twice that in RAM.
 */
export const MAX_FILE_SIZE = 256 * 1024 * 1024; // 256 MiB
export const MAX_FILE_SIZE_LABEL = `${MAX_FILE_SIZE / (1024 * 1024)} MiB`;

export const MAX_DIRECT_FILE_SIZE = 2 * 1024 * 1024 * 1024;
export const MAX_DIRECT_FILE_SIZE_LABEL = '2 GiB';

const ALLOWED_MIME_PREFIXES = [
  'image/',
  'video/',
  'audio/',
  'application/',
  'text/',
] as const;

export type ValidationError = {
  code: 'too_large' | 'mime_not_allowed' | 'empty' | 'too_many' | 'invalid_metadata';
  message: string;
  maxSize?: number;
  actualSize?: number;
};

export type Result<T, E = ValidationError> =
  | { success: true; data: T }
  | { success: false; error: E };

/** Validate a single file against size + MIME rules. */
export function validateFile(file: File): Result<File, ValidationError> {
  if (!file.name || file.name.length > 255 || file.type.length > 255) {
    return { success: false, error: { code: 'invalid_metadata', message: 'File name or type exceeds the 255-character limit' } };
  }
  if (file.size === 0) {
    return { success: false, error: { code: 'empty', message: 'File is empty' } };
  }
  if (file.size > MAX_DIRECT_FILE_SIZE) {
    return {
      success: false,
      error: {
        code: 'too_large',
        message: `File exceeds ${MAX_DIRECT_FILE_SIZE_LABEL} limit`,
        maxSize: MAX_DIRECT_FILE_SIZE,
        actualSize: file.size,
      },
    };
  }
  // Allow files with empty type (common for archives without registered MIME).
  if (file.type && !ALLOWED_MIME_PREFIXES.some((p) => file.type.startsWith(p))) {
    return {
      success: false,
      error: { code: 'mime_not_allowed', message: `Type "${file.type}" is not allowed` },
    };
  }
  return { success: true, data: file };
}

/** Validate a FileList; returns the valid files + the errors for reporting. */
export function validateFileList(files: FileList | File[]): {
  valid: File[];
  errors: { fileName: string; error: ValidationError }[];
} {
  const fileArray = files instanceof FileList ? Array.from(files) : files;
  if (fileArray.length > MAX_FILES_PER_TRANSFER) {
    return { valid: [], errors: [{ fileName: 'Selection', error: { code: 'too_many',
      message: `Select up to ${MAX_FILES_PER_TRANSFER} files at a time (${fileArray.length} selected)` } }] };
  }
  const valid: File[] = [];
  const errors: { fileName: string; error: ValidationError }[] = [];

  for (const file of fileArray) {
    const result = validateFile(file);
    if (result.success) {
      valid.push(result.data);
    } else {
      errors.push({ fileName: file.name, error: result.error });
    }
  }

  return { valid, errors };
}

/**
 * Sanitize a filename for safe download.
 * Strips path separators, control chars, and non-safe characters.
 * Caps at 255 chars.
 */
export function sanitizeFilename(name: string): string {
  const sanitized = name
    // eslint-disable-next-line no-control-regex -- stripping control chars is the security purpose here
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.\.+/g, '.')
    .substring(0, 255);
  return sanitized;
}
