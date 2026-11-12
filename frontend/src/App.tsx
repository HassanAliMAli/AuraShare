import { lazy, Suspense } from 'react';
import { MotionConfig } from 'framer-motion';
import { useRoute } from './hooks';
import { LandingPage } from './components/landing';

/**
 * The full P2P app (WebRTC + signaling) — lazy-loaded so the landing page
 * bundle stays small and never pulls the transfer stack.
 */
const AuraApp = lazy(() =>
  import('./components/app/AuraApp').then((module) => ({ default: module.AuraApp }))
);

/** Minimal branded loader for the app chunk (no feature imports here). */
function PageLoader() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-canvas"
      role="status"
      aria-label="Loading"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
    </div>
  );
}

/**
 * Root router: `/` serves the marketing landing page, `/app` serves the
 * transfer app. Anything else falls back to the landing page.
 *
 * `MotionConfig reducedMotion="user"` is set here so the operating-system
 * preference is honoured across every view, on every route.
 */
export function App() {
  const route = useRoute();

  return (
    <MotionConfig reducedMotion="user">
      {route === '/app' ? (
        <Suspense fallback={<PageLoader />}>
          <AuraApp />
        </Suspense>
      ) : (
        <LandingPage />
      )}
    </MotionConfig>
  );
}
