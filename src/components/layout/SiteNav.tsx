import { motion } from 'framer-motion';
import { useAppStore } from '../../stores/appStore';
import { fadeLeftVariants, fadeRightVariants } from '../../lib/motion';

/** Top navigation: brand (resets session) + Receive entry point. */
export function SiteNav() {
  const { actions } = useAppStore();

  return (
    <nav className="absolute top-0 left-0 right-0 p-4 md:p-8 flex justify-between items-center z-50">
      <motion.button
        type="button"
        variants={fadeLeftVariants}
        initial="hidden"
        animate="visible"
        onClick={actions.reset}
        className="flex items-center gap-2 md:gap-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal rounded-xl"
        aria-label="AuraShare — start over"
      >
        <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl overflow-hidden flex items-center justify-center shadow-lg shadow-signal/20 bg-bright/5">
          <img src="/logo.svg" alt="" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tighter text-text-primary logo-font whitespace-nowrap">
          AuraShare
        </h1>
      </motion.button>

      <motion.div
        variants={fadeRightVariants}
        initial="hidden"
        animate="visible"
        className="flex items-center gap-4 md:gap-6 z-50"
      >
        <button
          type="button"
          onClick={actions.startReceive}
          className="text-xs md:text-sm font-bold uppercase tracking-widest text-text-primary/80 hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal rounded-xl"
        >
          Receive
        </button>
      </motion.div>
    </nav>
  );
}
