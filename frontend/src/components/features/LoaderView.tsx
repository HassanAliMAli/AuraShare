import { motion } from 'motion/react';
import { viewVariants } from '../../lib/motion';
import { Button } from '../ui/Button';

interface LoaderViewProps {
  label: string;
  onCancel?: () => void;
  cancelLabel?: string;
}

/** Loader for transient states (connecting, downloading). */
export function LoaderView({ label, onCancel, cancelLabel = 'Cancel' }: LoaderViewProps) {
  return (
    <motion.div
      variants={viewVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="z-40 flex w-full flex-col items-center px-4"
    >
      <div className="text-center" aria-live="polite">
        <div
          className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-accent"
          aria-hidden="true"
        />
        <div className="mt-5 font-mono text-xs uppercase tracking-[0.18em] text-text-2">
          {label}
        </div>
      </div>
      {onCancel && (
        <Button variant="muted" onClick={onCancel} className="mt-6">
          {cancelLabel}
        </Button>
      )}
    </motion.div>
  );
}
