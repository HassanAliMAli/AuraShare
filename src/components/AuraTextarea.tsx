import { useState } from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '../hooks';
import { shareInputVariants } from '../lib/motion';

interface AuraTextareaProps {
  onTextShare: (text: string) => void;
  className?: string;
}

export function AuraTextarea({ onTextShare, className }: AuraTextareaProps) {
  const [text, setText] = useState('');
  const prefersReduced = usePrefersReducedMotion();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onTextShare(text);
    }
  };

  return (
    <div className={`relative w-full h-full flex flex-col items-center justify-center p-8 ${className}`}>
      {/* Liquid Aura Background for Text Mode */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-40" aria-hidden="true">
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
              animate={
                prefersReduced
                  ? { r: 100 }
                  : { r: [100, 130, 100], fill: ['#6c7cf8', '#22d3a8', '#6c7cf8'] }
              }
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            />
          </g>
        </svg>
      </div>

      {/* Textarea Container */}
      <motion.div
        variants={shareInputVariants}
        initial="hidden"
        animate="visible"
        className="z-10 w-full bg-bright/5 backdrop-blur-xl border border-bright/10 rounded-[40px] p-6 shadow-2xl flex flex-col gap-4"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste or type something to share..."
          aria-label="Text to share"
          className="w-full h-64 bg-transparent border-none text-text-primary placeholder-text-ghost resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-signal rounded-2xl text-lg leading-relaxed font-light scrollbar-hide"
        />

        <div className="flex justify-between items-center px-2">
          <div className="text-[10px] uppercase tracking-widest text-text-ghost font-bold">
            {text.length} characters
          </div>
          <motion.button
            type="submit"
            whileHover={prefersReduced ? undefined : { scale: 1.02 }}
            whileTap={prefersReduced ? undefined : { scale: 0.98 }}
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="px-8 py-3 rounded-2xl bg-bright text-void font-bold text-sm uppercase tracking-widest disabled:opacity-20 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            Share Aura
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
