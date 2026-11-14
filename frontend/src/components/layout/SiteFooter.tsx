import { motion } from 'motion/react';
import { FOOTER } from '../../lib/landingCopy';
import { fadeUpVariants } from '../../lib/motion';

/**
 * Footer status strip on the app screen. Static text — no pulsing dot, no
 * badge implying a live state that does not exist.
 */
export function SiteFooter() {
  return (
    <footer className="pointer-events-none absolute inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-50 px-4 md:bottom-[calc(2rem+env(safe-area-inset-bottom))]">
      <motion.div
        variants={fadeUpVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
      >
        {FOOTER.trust.map((item) => (
          <span
            key={item}
            className="font-mono text-xs uppercase tracking-[0.14em] text-text-3"
          >
            {item}
          </span>
        ))}
      </motion.div>
    </footer>
  );
}
