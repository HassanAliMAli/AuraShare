import { describe, it, expect, beforeEach } from 'vitest';
import { getRoute, navigate, subscribe } from './router';

describe('router', () => {
  beforeEach(() => {
    // Always start each test at the landing route.
    if (getRoute() !== '/') navigate('/');
  });

  it('initializes to the current pathname', () => {
    expect(getRoute()).toBe('/');
  });

  it('navigate updates the route', () => {
    navigate('/app');
    expect(getRoute()).toBe('/app');
  });

  it('navigate ignores the current path', () => {
    navigate('/app');
    const before = window.history.length;
    navigate('/app');
    expect(window.history.length).toBe(before);
  });

  it('subscribe notifies listeners on navigation and unsubscribes', () => {
    const seen: string[] = [];
    const unsubscribe = subscribe(() => seen.push(getRoute()));

    navigate('/app');
    navigate('/');
    expect(seen).toEqual(['/app', '/']);

    unsubscribe();
    navigate('/app');
    expect(seen).toEqual(['/app', '/']);
  });
});
