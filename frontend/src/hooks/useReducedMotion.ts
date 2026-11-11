import { useReducedMotion } from 'framer-motion';

/**
 * Re-export so components import from our hooks barrel. Returns true when the
 * user has requested reduced motion; animations should fall back to static.
 */
export function usePrefersReducedMotion(): boolean {
  return useReducedMotion() ?? false;
}
