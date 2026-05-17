import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface AuraTextareaProps {
  onTextShare: (text: string) => void;
  className?: string;
}

export const AuraTextarea: React.FC<AuraTextareaProps> = ({ onTextShare, className }) => {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onTextShare(text);
    }
  };

  return (
    <div className={`relative w-full h-full flex flex-col items-center justify-center p-8 ${className}`}>
      {/* Liquid Aura Background for Text Mode */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-40">
        <svg className="w-full h-full">
          <defs>
            <filter id="text-aura-goo">
              <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
              <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
              <feComposite in="SourceGraphic" in2="goo" operator="atop" />
            </filter>
          </defs>
          <g filter="url(#text-aura-goo)">
            <motion.circle
              cx="50%"
              cy="50%"
              animate={{
                r: [100, 130, 100],
                fill: ["#6366f1", "#d946ef", "#6366f1"],
              }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
          </g>
        </svg>
      </div>

      {/* Textarea Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="z-10 w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-[40px] p-6 shadow-2xl flex flex-col gap-4"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste or type something to share..."
          className="w-full h-64 bg-transparent border-none text-white placeholder-white/20 resize-none focus:outline-none text-lg leading-relaxed font-light scrollbar-hide"
        />
        
        <div className="flex justify-between items-center px-2">
          <div className="text-[10px] uppercase tracking-widest text-white/20 font-bold">
            {text.length} characters
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="px-8 py-3 rounded-2xl bg-white text-void font-bold text-sm uppercase tracking-widest disabled:opacity-20 transition-opacity"
          >
            Share Aura
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};
