import { act, renderHook } from '@testing-library/react';
import { hasReducedMotionListener, prefersReducedMotion } from 'motion-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoute } from '@/hooks/useRoute';
import { usePrefersReducedMotion } from '@/hooks/useReducedMotion';
import { navigate } from '@/lib/router';
import { resetRoute } from '../shared/fixtures';

describe('hooks/useRoute', () => {
  beforeEach(() => resetRoute('/'));

  it('returns the current route', () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current).toBe('/');
  });

  it('re-renders when the router navigates', () => {
    const { result } = renderHook(() => useRoute());
    act(() => navigate('/app'));
    expect(result.current).toBe('/app');
  });

  it('stops subscribing on unmount', () => {
    const { result, unmount } = renderHook(() => useRoute());
    unmount();
    act(() => navigate('/app'));
    expect(result.current).toBe('/');
  });
});

describe('hooks/usePrefersReducedMotion', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  function stubMatchMedia(matches: boolean): void {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    // framer-motion caches the preference at module level; reset it so each
    // test observes the freshly stubbed matchMedia implementation.
    hasReducedMotionListener.current = false;
    prefersReducedMotion.current = null;
  }

  it('returns false when the user has no motion preference', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it('returns true when reduced motion is requested', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });
});
