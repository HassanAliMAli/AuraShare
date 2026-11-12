import { useState, useRef } from 'react';
import { UploadCloud } from 'lucide-react';
import { cn } from '../lib/utils';
import { validateFileList } from '../lib/validation';

interface AuraDropzoneProps {
  onFileDrop: (files: File[]) => void;
  className?: string;
}

/**
 * A dashed drop target. Flat, static, and honest about what it accepts —
 * no morphing blob, no rotation loop, no glow.
 */
export function AuraDropzone({ onFileDrop, className }: AuraDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList) => {
    const { valid, errors } = validateFileList(files);
    setValidationErrors(errors.map((e) => `${e.fileName}: ${e.error.message}`));
    if (valid.length > 0) {
      onFileDrop(valid);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleButtonClick}
      role="button"
      tabIndex={0}
      aria-label="Drop files to share, or activate to browse"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleButtonClick();
      }}
      className={cn(
        'flex w-full flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-10 text-center transition-colors duration-[--duration-micro]',
        isDragOver
          ? 'border-accent bg-accent/5'
          : 'border-border-strong hover:border-accent/60',
        className,
      )}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple
        aria-hidden="true"
        tabIndex={-1}
      />

      <span className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-raised">
        <UploadCloud className="h-5 w-5 text-text-2" aria-hidden="true" />
      </span>

      <div>
        <h3 className="text-md font-medium text-text">
          {isDragOver ? 'Release to send' : 'Drop files here'}
        </h3>
        <p className="mt-1.5 text-sm text-text-2">
          or click to browse — up to 2 GiB per file
        </p>
      </div>

      {validationErrors.length > 0 && (
        <div className="mt-2 w-full space-y-1" role="alert">
          {validationErrors.map((err) => (
            <p
              key={err}
              className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-left text-xs text-error"
            >
              {err}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
