import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../stores/appStore';
import { usePrefersReducedMotion } from '../../hooks';
import { tabsVariants } from '../../lib/motion';
import type { ShareMode } from '../../types';

const MODES: readonly ShareMode[] = ['text', 'files'];

/** Text/Files mode switcher shown on the idle share screen. */
export function ShareModeTabs() {
  const { state, actions } = useAppStore();
  const prefersReduced = usePrefersReducedMotion();

  return (
    <motion.div
      variants={tabsVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="pointer-events-auto bg-bright/5 backdrop-blur-xl border border-bright/10 rounded-2xl md:rounded-3xl p-1 flex gap-1 mb-8 md:mb-12 shadow-xl"
    >
      {MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => actions.setShareMode(mode)}
          className={cn(
            "relative px-6 md:px-10 py-2 md:py-3 rounded-xl md:rounded-2xl text-[10px] md:text-xs font-black uppercase tracking-[0.2em] transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal",
            state.shareMode === mode ? 'text-void' : 'text-text-ghost hover:text-text-secondary'
          )}
        >
          {state.shareMode === mode && (
            <motion.div
              layoutId="activeTab"
              className="absolute inset-0 bg-bright rounded-xl md:rounded-2xl z-0"
              transition={prefersReduced ? { duration: 0 } : { type: 'spring', bounce: 0.2, duration: 0.6 }}
            />
          )}
          <span className={cn(
            "relative z-10 transition-colors duration-300",
            state.shareMode === mode ? 'text-void' : ''
          )}>{mode}</span>
        </button>
      ))}
    </motion.div>
  );
}
