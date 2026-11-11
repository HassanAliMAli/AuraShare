import { motion } from 'framer-motion';
import { viewVariants } from '../../lib/motion';

interface LoaderViewProps {
  label: string;
  hint?: string;
}

/** Branded loader for transient states (connecting, downloading). */
export function LoaderView({ label, hint }: LoaderViewProps) {
  return (
    <motion.div
      variants={viewVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="z-40 flex flex-col items-center w-full px-4"
    >
      <div className="text-center relative z-50 w-full max-w-lg" aria-live="polite">
        <div className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-6 md:mb-8 rounded-full border-2 border-signal/40 border-t-transparent animate-spin" aria-hidden="true" />
        <div className="text-text-primary font-black uppercase tracking-[0.3em] text-[10px] md:text-xs">
          {label}
        </div>
        {hint && (
          <div className="text-text-secondary mt-3 uppercase tracking-[0.2em] text-[9px] md:text-[10px] font-bold">
            {hint}
          </div>
        )}
      </div>
    </motion.div>
  );
}
