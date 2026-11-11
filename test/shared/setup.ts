import '@testing-library/jest-dom/vitest';
import { MotionGlobalConfig } from 'framer-motion';

// Render animations instantly in tests — deterministic variant states.
MotionGlobalConfig.skipAnimations = true;

// motion-dom runs a persistent frame loop that re-schedules itself via
// window.requestAnimationFrame. In jsdom that keeps the event loop alive
// forever, so vitest force-exits with code 1 after the run. Stubbing rAF
// breaks the chain deterministically (jsdom has no real frame clock, and
// tests only query DOM content, never animation state).
window.requestAnimationFrame = () => 0;
window.cancelAnimationFrame = () => {};

// jsdom lacks matchMedia — framer-motion's useReducedMotion depends on it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom lacks IntersectionObserver — framer-motion's whileInView needs it.
class IntersectionObserverMock implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  readonly scrollMargin: string = '';

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver;
