import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';

interface AuraDropzoneProps {
  onFileDrop: (files: FileList) => void;
  className?: string;
}

export const AuraDropzone: React.FC<AuraDropzoneProps> = ({ onFileDrop, className }) => {
  const [isDragOver, setIsDragOver] = useState(false);

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
      onFileDrop(e.dataTransfer.files);
    }
  };

  return (
    <div
      className={cn(
        "relative flex items-center justify-center w-full h-full min-h-[400px]",
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Liquid Aura Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <svg className="w-full h-full opacity-60">
          <defs>
            <filter id="aura-goo">
              <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
              <feColorMatrix 
                in="blur" 
                mode="matrix" 
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" 
                result="goo" 
              />
              <feComposite in="SourceGraphic" in2="goo" operator="atop" />
            </filter>
          </defs>
          <g filter="url(#aura-goo)">
            <motion.circle
              cx="50%"
              cy="50%"
              animate={{
                r: isDragOver ? [120, 160, 140] : [90, 110, 90],
                fill: isDragOver ? ["#f97316", "#d946ef", "#f97316"] : ["#6366f1", "#8b5cf6", "#6366f1"],
              }}
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            <motion.circle
              cx="48%"
              cy="46%"
              animate={{
                cx: isDragOver ? ["45%", "55%", "45%"] : ["48%", "52%", "48%"],
                cy: isDragOver ? ["42%", "38%", "42%"] : ["46%", "44%", "46%"],
                r: isDragOver ? 100 : 70,
              }}
              transition={{
                duration: 7,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              fill="#ec4899"
              opacity="0.8"
            />
            <motion.circle
              cx="52%"
              cy="54%"
              animate={{
                cx: isDragOver ? ["55%", "45%", "55%"] : ["52%", "48%", "52%"],
                cy: isDragOver ? ["58%", "62%", "58%"] : ["54%", "56%", "54%"],
                r: isDragOver ? 90 : 60,
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              fill="#06b6d4"
              opacity="0.8"
            />
          </g>
        </svg>
      </div>

      {/* Main Interactive Blob */}
      <motion.div
        layout
        animate={{
          scale: isDragOver ? 1.2 : 1,
          rotate: isDragOver ? 5 : 0,
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "z-10 cursor-pointer p-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl transition-all duration-500",
          isDragOver ? "border-orange-500 bg-orange-500/10 shadow-orange-500/20" : "hover:border-white/40"
        )}
      >
        <div className="flex flex-col items-center text-center max-w-xs">
          <motion.div
            animate={{
              y: isDragOver ? [0, -10, 0] : 0
            }}
            transition={{ duration: 2, repeat: Infinity }}
            className="mb-6"
          >
            <i className={cn(
              "fa-solid text-5xl transition-colors duration-500",
              isDragOver ? "fa-cloud-arrow-up text-orange-400" : "fa-wand-magic-sparkles text-white/80"
            )} />
          </motion.div>
          <h2 className="text-2xl font-semibold tracking-tight text-white mb-2">
            {isDragOver ? "Drop into the Aura" : "Release your files"}
          </h2>
          <p className="text-white/60 text-sm leading-relaxed">
            Drag here or click to let them float to anyone, anywhere.
          </p>
        </div>
      </motion.div>

      {/* Ripple Effect on Drag Over */}
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 2, opacity: 0.2 }}
            exit={{ scale: 2.5, opacity: 0 }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute z-0 w-64 h-64 rounded-full border-2 border-orange-500/50"
          />
        )}
      </AnimatePresence>
    </div>
  );
};
