/**
 * Shared Framer Motion variants + animation constants.
 * Defined outside components so variant objects are not recreated per render
 * (AGENTS.md §4.2). The golden easing curve is the default for UI transitions.
 */

import type { Transition } from 'framer-motion';

export const EASE_ORGANIC: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const EASE_EXIT: [number, number, number, number] = [0.4, 0, 1, 1];

/** Blob border-radius keyframes — mirrors the --radius-blob design token. */
export const BLOB_RADIUS_KEYFRAMES: string[] = [
  '60% 40% 30% 70% / 60% 30% 70% 40%',
  '30% 60% 70% 40% / 30% 70% 40% 60%',
  '50% 60% 30% 60% / 40% 40% 60% 30%',
  '60% 40% 30% 70% / 60% 30% 70% 40%',
];

/** Status-view entry/exit (blur + scale). Used by every routed feature view. */
export const viewVariants = {
  hidden: { opacity: 0, scale: 0.9, filter: 'blur(10px)' },
  visible: { opacity: 1, scale: 1, filter: 'blur(0px)', transition: { duration: 0.4, ease: EASE_ORGANIC } },
  exit: { opacity: 0, scale: 1.1, transition: { duration: 0.2, ease: EASE_EXIT } },
};

/** Share-input entry/exit (blur + slight scale, keyed on mode switch). */
export const shareInputVariants = {
  hidden: { opacity: 0, scale: 0.95, filter: 'blur(10px)' },
  visible: { opacity: 1, scale: 1, filter: 'blur(0px)', transition: { duration: 0.4, ease: EASE_ORGANIC } },
  exit: { opacity: 0, scale: 1.05, filter: 'blur(10px)', transition: { duration: 0.2, ease: EASE_EXIT } },
};

/** Tabs slide-in from top. */
export const tabsVariants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_ORGANIC } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.2, ease: EASE_EXIT } },
};

/** Receive-form slide-in from bottom. */
export const receiveFormVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_ORGANIC } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.2, ease: EASE_EXIT } },
};

/** Brand fade-up (nav, footer). */
export const fadeUpVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_ORGANIC } },
};

export const fadeLeftVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: EASE_ORGANIC } },
};

export const fadeRightVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: EASE_ORGANIC } },
};

/** Pulsing outer ring on the dropzone (loop). */
const loopTransition: Transition = { duration: 4, repeat: Infinity, ease: 'easeInOut' };
export const pulseRingVariants = {
  animate: {
    scale: [1, 1.05, 1],
    opacity: [0.2, 0.4, 0.2],
    transition: loopTransition,
  },
};

/** Gentle vertical float (loop). */
const floatTransition: Transition = { duration: 4, repeat: Infinity, ease: 'easeInOut' };
export const floatVariants = {
  animate: { y: [0, -10, 0], transition: floatTransition },
};
