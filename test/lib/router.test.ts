import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRoute, navigate, subscribe } from '@/lib/router';
import { resetRoute } from '../shared/fixtures';

describe('lib/router', () => {
  beforeEach(() => {
    resetRoute('/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts on the current pathname', () => {
    expect(getRoute()).toBe('/');
  });

  it('navigates and pushes history', () => {
    const push = vi.spyOn(window.history, 'pushState');
    navigate('/app');
    expect(getRoute()).toBe('/app');
    expect(push).toHaveBeenCalledWith({}, '', '/app');
  });

  it('ignores navigation to the current path', () => {
    navigate('/app');
    const push = vi.spyOn(window.history, 'pushState');
    navigate('/app');
    expect(push).not.toHaveBeenCalled();
  });

  it('notifies every subscriber and stops after unsubscribe', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribe(first);
    const unsubscribeSecond = subscribe(second);

    navigate('/app');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    navigate('/');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);

    unsubscribeSecond();
    navigate('/app');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('reacts to the browser back/forward popstate event', () => {
    navigate('/app');
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(getRoute()).toBe('/');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
