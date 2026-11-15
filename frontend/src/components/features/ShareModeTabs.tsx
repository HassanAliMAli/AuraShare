import { useRef, type KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../stores/appStore';
import { tabsVariants, DURATION_STANDARD, EASE_OUT } from '../../lib/motion';
import type { ShareMode } from '../../types';

const MODES: readonly ShareMode[] = ['text', 'files'];

/** Text/Files mode switcher shown on the idle share screen. */
export function ShareModeTabs() {
  const { state, actions } = useAppStore();

  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    switch (event.key) {
      case 'ArrowRight': next = (index + 1) % MODES.length; break;
      case 'ArrowLeft': next = (index + MODES.length - 1) % MODES.length; break;
      case 'Home': next = 0; break;
      case 'End': next = MODES.length - 1; break;
      default: return;
    }
    event.preventDefault();
    const mode = MODES[next];
    if (!mode) return;
    actions.setShareMode(mode);
    tabs.current[next]?.focus();
  };

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
      {MODES.map((mode, index) => {
        const active = state.shareMode === mode;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            id={`share-tab-${mode}`}
            ref={(node) => { tabs.current[index] = node; }}
            tabIndex={active ? 0 : -1}
            onKeyDown={(event) => handleKeyDown(event, index)}
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
                transition={{ duration: DURATION_STANDARD, ease: EASE_OUT }}
              />
            )}
          </button>
        );
      })}
    </motion.div>
  );
}
