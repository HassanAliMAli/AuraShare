/**
 * Zero-dependency mini router — pushState + popstate.
 * The landing page lives at `/`, the app at `/app`.
 */

const listeners = new Set<() => void>();

let currentPath: string =
  typeof window !== 'undefined' ? (window.location.pathname ?? '/') : '/';

function emit(): void {
  for (const fn of listeners) fn();
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    currentPath = window.location.pathname;
    emit();
  });
}

export function navigate(path: string): void {
  if (typeof window === 'undefined' || currentPath === path) return;
  window.history.pushState({}, '', path);
  currentPath = path;
  emit();
}

export function getRoute(): string {
  return currentPath;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
