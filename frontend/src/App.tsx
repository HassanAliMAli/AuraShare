import { lazy, Suspense } from 'react';
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
    <div className="min-h-dvh bg-void flex items-center justify-center" role="status" aria-label="Loading">
      <div className="w-16 h-16 rounded-full border-2 border-signal/40 border-t-transparent animate-spin" />
    </div>
  );
}

/**
 * Root router: `/` serves the marketing landing page, `/app` serves the
 * transfer app. Anything else falls back to the landing page.
 */
export function App() {
  const route = useRoute();

  if (route === '/app') {
    return (
      <Suspense fallback={<PageLoader />}>
        <AuraApp />
      </Suspense>
    );
  }

  return <LandingPage />;
}
