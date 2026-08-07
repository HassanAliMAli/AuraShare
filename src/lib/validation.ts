/**
 * File security validation + sanitization (AGENTS.md §12).
 * Pure functions — no React imports.
 */

export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GiB

const ALLOWED_MIME_PREFIXES = [
  'image/',
  'video/',
  'audio/',
  'application/',
  'text/',
] as const;

export type ValidationError = {
  code: 'too_large' | 'mime_not_allowed' | 'empty';
  message: string;
  maxSize?: number;
  actualSize?: number;
};

export type Result<T, E = ValidationError> =
  | { success: true; data: T }
  | { success: false; error: E };

/** Validate a single file against size + MIME rules. */
export function validateFile(file: File): Result<File, ValidationError> {
  if (file.size === 0) {
    return { success: false, error: { code: 'empty', message: 'File is empty' } };
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      success: false,
      error: {
        code: 'too_large',
        message: `File exceeds ${formatMaxSize()} limit`,
        maxSize: MAX_FILE_SIZE,
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
 * Sanitize a filename for safe download (AGENTS.md §12).
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

function formatMaxSize(): string {
  const gb = MAX_FILE_SIZE / (1024 * 1024 * 1024);
  return `${gb} GiB`;
}
