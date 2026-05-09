import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';

interface AuraDropzoneProps {
  onFileDrop: (files: FileList) => void;
  className?: string;
}

export const AuraDropzone: React.FC<AuraDropzoneProps> = ({ onFileDrop, className }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileDrop(e.target.files);
    }
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleButtonClick}
      className={cn(
        "relative w-full aspect-square max-w-[400px] md:max-w-[500px] flex items-center justify-center cursor-pointer group mx-auto",
        className
      )}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        multiple
      />

      {/* Pulsing Outer Ring */}
      <motion.div 
        animate={{
          scale: isDragOver ? 1.1 : [1, 1.05, 1],
          opacity: isDragOver ? 0.8 : [0.2, 0.4, 0.2],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0 rounded-full border-2 border-indigo-500/30 blur-[2px]"
      />

      {/* Main Liquid Blob */}
      <motion.div
        animate={{
          borderRadius: isDragOver ? "40%" : ["60% 40% 30% 70%", "30% 60% 70% 40%", "50% 60% 30% 60%", "60% 40% 30% 70%"],
          rotate: [0, 90, 180, 360],
          scale: isDragOver ? 1.05 : 1
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "linear"
        }}
        className={cn(
          "w-[85%] h-[85%] bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-orange-500/20 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col items-center justify-center text-center p-8 transition-colors duration-500",
          isDragOver ? "from-indigo-500/40 via-purple-500/40 to-orange-500/40" : ""
        )}
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 4, repeat: Infinity }}
          className="mb-6"
        >
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-3xl bg-white/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-xl">
             <i className="fa-solid fa-cloud-arrow-up text-3xl md:text-4xl text-white/80" />
          </div>
        </motion.div>

        <h3 className="text-xl md:text-2xl font-black text-white mb-2 tracking-tighter uppercase">
          {isDragOver ? "Release to Send" : "Release your files"}
        </h3>
        <p className="text-white/40 text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] max-w-[200px]">
          {isDragOver ? "Cosmic alignment ready" : "Drag & drop or click to browse the cosmos"}
        </p>

        {/* Hover Hint */}
        <div className="absolute bottom-12 opacity-0 group-hover:opacity-100 transition-opacity">
           <span className="text-[10px] text-indigo-400 font-black tracking-widest uppercase animate-pulse">Select Files</span>
        </div>
      </motion.div>

      {/* Floating Particles Around Blob */}
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1.2, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute z-0 w-full h-full rounded-full border-2 border-orange-500/50 blur-[1px]"
          />
        )}
      </AnimatePresence>
    </div>
  );
};
