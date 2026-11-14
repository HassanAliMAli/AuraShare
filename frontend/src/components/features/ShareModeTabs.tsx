import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../stores/appStore';
import { tabsVariants } from '../../lib/motion';
import type { ShareMode } from '../../types';

const MODES: readonly ShareMode[] = ['text', 'files'];

/** Text/Files mode switcher shown on the idle share screen. */
export function ShareModeTabs() {
  const { state, actions } = useAppStore();

  return (
    <motion.div
      variants={tabsVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="tablist"
      aria-label="Share mode"
      className="mb-8 inline-flex items-center gap-1 border-b border-border md:mb-10"
    >
      {MODES.map((mode) => {
        const active = state.shareMode === mode;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            id={`share-tab-${mode}`}
            aria-selected={active}
            aria-controls={`share-panel-${mode}`}
            onClick={() => actions.setShareMode(mode)}
            className={cn(
              'relative px-5 py-2.5 text-sm font-medium capitalize transition-colors duration-(--duration-micro)',
              active ? 'text-text' : 'text-text-3 hover:text-text-2',
            )}
          >
            {mode}
            {active && (
              <motion.span
                layoutId="activeTab"
                className="absolute inset-x-0 -bottom-px h-0.5 bg-accent"
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
          </button>
        );
      })}
    </motion.div>
  );
}
