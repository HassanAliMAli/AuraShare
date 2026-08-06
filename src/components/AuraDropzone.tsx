import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud } from 'lucide-react';
import { cn } from '../lib/utils';
import { usePrefersReducedMotion } from '../hooks';
import { validateFileList } from '../lib/validation';
import { BLOB_RADIUS_KEYFRAMES, pulseRingVariants, floatVariants, EASE_ORGANIC } from '../lib/motion';

interface AuraDropzoneProps {
  onFileDrop: (files: File[]) => void;
  className?: string;
}

export function AuraDropzone({ onFileDrop, className }: AuraDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prefersReduced = usePrefersReducedMotion();

  const handleFiles = (files: FileList) => {
    const { valid, errors } = validateFileList(files);
    if (errors.length > 0) {
      setValidationErrors(errors.map((e) => `${e.fileName}: ${e.error.message}`));
    }
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
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleButtonClick(); }}
      className={cn(
        "relative w-full aspect-square max-w-[400px] md:max-w-[500px] flex items-center justify-center cursor-pointer group mx-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal rounded-full",
        className
      )}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple
        aria-hidden="true"
      />

      {/* Pulsing Outer Ring */}
      <motion.div
        variants={pulseRingVariants}
        animate={prefersReduced ? {} : isDragOver ? { scale: 1.1, opacity: 0.8 } : 'animate'}
        className="absolute inset-0 rounded-full border-2 border-signal/30 blur-[2px]"
      />

      {/* Main Liquid Blob */}
      <motion.div
        animate={
          prefersReduced
            ? { scale: isDragOver ? 1.05 : 1 }
            : {
                borderRadius: isDragOver ? '40%' : BLOB_RADIUS_KEYFRAMES,
                rotate: [0, 90, 180, 360],
                scale: isDragOver ? 1.05 : 1,
              }
        }
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        className={cn(
          "w-[85%] h-[85%] bg-gradient-to-br from-signal/20 via-transfer/20 to-warn/20 backdrop-blur-2xl border border-bright/10 shadow-2xl flex flex-col items-center justify-center text-center p-8 transition-colors duration-500",
          isDragOver ? "from-signal/40 via-transfer/40 to-warn/40" : ""
        )}
      >
        <motion.div
          variants={floatVariants}
          animate={prefersReduced ? {} : 'animate'}
          className="mb-6"
        >
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-3xl bg-bright/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-xl">
            <UploadCloud className="w-8 h-8 md:w-10 md:h-10 text-text-primary/80" aria-hidden="true" />
          </div>
        </motion.div>

        <h3 className="text-xl md:text-2xl font-black text-text-primary mb-2 tracking-tighter uppercase">
          {isDragOver ? "Release to Send" : "Release your files"}
        </h3>
        <p className="text-text-secondary text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] max-w-[200px]">
          {isDragOver ? "Cosmic alignment ready" : "Drag & drop or click to browse the cosmos"}
        </p>

        {/* Hover Hint */}
        <div className="absolute bottom-12 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[10px] text-signal font-black tracking-widest uppercase animate-pulse">Select Files</span>
        </div>
      </motion.div>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-full max-w-xs space-y-1" role="alert">
          {validationErrors.map((err, i) => (
            <p key={i} className="text-[10px] text-error font-bold text-center bg-error/10 rounded-lg px-3 py-2">
              {err}
            </p>
          ))}
        </div>
      )}

      {/* Floating Particles Around Blob */}
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1.2, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE_ORGANIC }}
            className="absolute z-0 w-full h-full rounded-full border-2 border-warn/50 blur-[1px]"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
