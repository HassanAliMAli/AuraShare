import { useSyncExternalStore } from 'react';
import { getRoute, subscribe } from '../lib/router';

/** Returns the current URL path, re-rendering on route changes. */
export function useRoute(): string {
  return useSyncExternalStore(subscribe, getRoute, getRoute);
}
