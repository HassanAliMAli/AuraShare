import { useEffect, useRef } from 'react';

const LANDING_TITLE = 'AuraShare — Send files between your devices. Instantly.';
const TITLES: Record<string, string> = { '/': LANDING_TITLE, '/app': 'Transfer — AuraShare' };

/** Wait for lazy routes to commit before focusing; never focus on initial load. */
export function useRouteAccessibility(route: string) {
  const previous = useRef(route);
  useEffect(() => {
    document.title = TITLES[route] ?? LANDING_TITLE;
    if (previous.current === route) return;
    previous.current = route;
    const focusMain = () => {
      const main = document.getElementById('main-content');
      if (!main) return false;
      main.focus();
      return true;
    };
    if (focusMain()) return;
    const observer = new MutationObserver(() => {
      if (focusMain()) observer.disconnect();
    });
    observer.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [route]);
}
