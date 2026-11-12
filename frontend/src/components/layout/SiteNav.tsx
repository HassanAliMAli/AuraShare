import { motion } from 'framer-motion';
import { useAppStore } from '../../stores/appStore';
import { fadeLeftVariants, fadeRightVariants } from '../../lib/motion';

/**
 * Top navigation on the app screen: brand (resets the session) and the
 * Receive entry point. The wordmark is a span, not a heading — the page owns
 * the single <h1>.
 */
export function SiteNav() {
  const { actions } = useAppStore();

  return (
    <nav className="absolute inset-x-0 top-0 z-50 px-4 pt-[calc(1rem+env(safe-area-inset-top))] md:px-8 md:pt-[calc(2rem+env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <motion.button
          type="button"
          variants={fadeLeftVariants}
          initial="hidden"
          animate="visible"
          onClick={actions.reset}
          // The negative margin keeps the visual position while the padding
          // gives the control a 44px tap target — WCAG 2.2 sets 24px as the
          // minimum, but a phone thumb wants the Apple HIG's 44pt.
          className="flex items-center gap-2.5 py-2 -my-2"
          aria-label="AuraShare — start over"
        >
          <img src="/logo.svg" alt="" className="h-7 w-7" />
          <span className="font-display text-md font-semibold tracking-tight text-text [font-stretch:108%]">
            AuraShare
          </span>
        </motion.button>

        <motion.div
          variants={fadeRightVariants}
          initial="hidden"
          animate="visible"
          className="flex items-center gap-6"
        >
          <button
            type="button"
            onClick={actions.startReceive}
            className="py-3 -my-3 text-sm text-text-2 transition-colors hover:text-accent"
          >
            Receive
          </button>
        </motion.div>
      </div>
    </nav>
  );
}
