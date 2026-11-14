import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useRoute } from '@/hooks/useRoute';
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
