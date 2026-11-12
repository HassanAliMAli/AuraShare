/**
 * Shared Motion variants.
 *
 * Rules for this project:
 *  - Motion carries meaning (a view entering, a row expanding, a bar filling).
 *  - No infinite decorative loops, no blur filters, no scale-overs.
 *  - One easing curve, three durations, mapped to the --duration-* tokens.
 *  - `prefers-reduced-motion` is honoured globally by <MotionConfig> in App.tsx,
 *    so individual components do not need to branch on it.
 */

import type { Transition } from 'framer-motion';

/** The single easing curve. */
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const DURATION_MICRO = 0.12;
export const DURATION_STANDARD = 0.2;
export const DURATION_ENTER = 0.32;

/** Status-view entry/exit. Used by every routed feature view. */
export const viewVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION_ENTER, ease: EASE_OUT } },
  exit: { opacity: 0, y: -4, transition: { duration: DURATION_STANDARD, ease: EASE_OUT } },
};

/** Share-input entry/exit (keyed on mode switch). */
export const shareInputVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION_ENTER, ease: EASE_OUT } },
  exit: { opacity: 0, y: -4, transition: { duration: DURATION_STANDARD, ease: EASE_OUT } },
};

/** Mode switcher. */
export const tabsVariants = {
  hidden: { opacity: 0, y: -6 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION_STANDARD, ease: EASE_OUT } },
  exit: { opacity: 0, y: -6, transition: { duration: DURATION_MICRO, ease: EASE_OUT } },
};

/** Receive-form. */
export const receiveFormVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION_ENTER, ease: EASE_OUT } },
  exit: { opacity: 0, y: -4, transition: { duration: DURATION_STANDARD, ease: EASE_OUT } },
};

/** Brand fade-up (nav, footer). */
export const fadeUpVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION_STANDARD, ease: EASE_OUT } },
};

export const fadeLeftVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: DURATION_STANDARD, ease: EASE_OUT } },
};

export const fadeRightVariants = {
  hidden: { opacity: 0, x: 8 },
  visible: { opacity: 1, x: 0, transition: { duration: DURATION_STANDARD, ease: EASE_OUT } },
};

/* ─── Landing page variants ─────────────────────────────────────────────── */

/** Section reveal on scroll into view. Use with whileInView, once. */
export const sectionRevealVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION_ENTER, ease: EASE_OUT },
  },
};

/** Stagger a list of rows. Children animate with staggerItem. */
export const staggerContainer: { hidden: Record<string, never>; visible: { transition: Transition } } = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION_STANDARD, ease: EASE_OUT },
  },
};

/** Progress bar fill. The scale is the meaning — no loop. */
export const progressVariants = {
  hidden: { scaleX: 0 },
  visible: { scaleX: 1, transition: { duration: DURATION_ENTER, ease: EASE_OUT } },
};
