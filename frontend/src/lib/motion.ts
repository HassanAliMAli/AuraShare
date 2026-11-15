/**
 * Shared Motion variants.
 *
 * Rules for this project:
 *  - Motion carries meaning (a view entering, a row expanding, a bar filling).
 *  - No infinite decorative loops, no blur filters, no scale-overs.
 *  - Two easing curves, three durations, derived from the CSS tokens.
 *  - `prefers-reduced-motion` is honoured globally by <MotionConfig> in App.tsx,
 *    so individual components do not need to branch on it.
 */

import type { Transition } from 'motion/react';

import tokenCss from '../styles/tokens.css?raw';

function token(name: string): string {
  const value = tokenCss.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1];
  if (!value) throw new Error(`Missing motion token: ${name}`);
  return value.trim();
}
function duration(name: string): number {
  const value = token(`duration-${name}`);
  if (!/^\d+(?:\.\d+)?ms$/.test(value)) throw new Error(`Invalid duration: ${name}`);
  return Number.parseFloat(value) / 1000;
}
function easing(name: string): [number, number, number, number] {
  const parts = token(`ease-${name}`).match(/^cubic-bezier\(([^)]+)\)$/)?.[1]?.split(',').map(Number);
  const [a, b, c, d] = parts ?? [];
  if (parts?.length !== 4 || a === undefined || b === undefined || c === undefined || d === undefined ||
    ![a, b, c, d].every(Number.isFinite)) throw new Error(`Invalid easing: ${name}`);
  return [a, b, c, d];
}

export const EASE_OUT = easing('out');
export const EASE_STANDARD = easing('standard');
export const DURATION_MICRO = duration('micro');
export const DURATION_STANDARD = duration('standard');
export const DURATION_ENTER = duration('enter');

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
