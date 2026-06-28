import { motion } from 'framer-motion';
import { fadeUpVariants } from '../../lib/motion';

/** Footer status strip: P2P / E2E / capacity badges. */
export function SiteFooter() {
  return (
    <footer className="absolute bottom-6 md:bottom-12 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
      <motion.div
        variants={fadeUpVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-wrap items-center justify-center gap-4 md:gap-8 text-[8px] md:text-[10px] uppercase tracking-[0.2em] md:tracking-[0.4em] text-text-ghost font-black text-center"
      >
        <div className="flex items-center gap-2">
          <div className="w-1 md:w-1.5 h-1 md:h-1.5 rounded-full bg-transfer animate-pulse" />
          P2P DIRECT
        </div>
        <div className="hidden xs:block opacity-50">•</div>
        <div>E2E ENCRYPTED</div>
        <div className="hidden xs:block opacity-50">•</div>
        <div className="whitespace-nowrap">INFINITE CAPACITY</div>
      </motion.div>
    </footer>
  );
}
