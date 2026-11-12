import { AnimatePresence } from 'framer-motion';
import { ErrorBoundary } from 'react-error-boundary';
import { AppProvider } from '../../stores/AppProvider';
import { useAppStore } from '../../stores/appStore';
import { SiteNav, SiteFooter } from '../layout';
import {
  ShareModeTabs,
  ShareInputView,
  ReceiveCodeForm,
  SharingView,
  ReceiverFileList,
  SuccessView,
  ErrorView,
  LoaderView,
} from '../features';

/** Routes between feature views based on app status. */
function AppShell() {
  const { state } = useAppStore();
  const showTabs = state.status === 'idle' && !state.isReceiving;

  return (
    <div className="relative flex min-h-dvh flex-col bg-canvas text-text">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[10001] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-ink"
      >
        Skip to content
      </a>
      <SiteNav />

      <main
        id="main-content"
        className="relative z-40 flex flex-1 flex-col items-center justify-center px-4 py-24 md:px-8 md:py-28"
      >
        <h1 className="sr-only">AuraShare — peer-to-peer file transfer</h1>

        <AnimatePresence>
          {showTabs && <ShareModeTabs />}
        </AnimatePresence>

        <div className="relative flex w-full max-w-4xl items-center justify-center">
          <AnimatePresence mode="wait">
            {state.status === 'idle' && !state.isReceiving ? (
              <ShareInputView />
            ) : state.status === 'idle' && state.isReceiving ? (
              <ReceiveCodeForm key="receive-form" />
            ) : state.status === 'connecting' ? (
              <LoaderView key="connecting" label="Establishing a direct connection" />
            ) : state.status === 'sharing' ? (
              <SharingView key="sharing" />
            ) : state.status === 'connected' ? (
              <ReceiverFileList key="connected" />
            ) : state.status === 'success' ? (
              <SuccessView key="success" />
            ) : state.status === 'error' ? (
              <ErrorView key="error" />
            ) : null}
          </AnimatePresence>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

/**
 * The full AuraShare P2P app. Lazy-loaded from the router so the landing
 * page never pulls the WebRTC/signaling stack into its bundle.
 */
export function AuraApp() {
  return (
    <ErrorBoundary
      fallbackRender={({ resetErrorBoundary }) => (
        <div className="flex min-h-dvh w-full items-center justify-center bg-canvas text-text">
          <div className="text-center">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-error">
              Something went wrong
            </p>
            <button
              type="button"
              onClick={resetErrorBoundary}
              className="mt-4 rounded-md border border-border-strong px-6 py-2.5 text-sm font-medium text-text transition-colors hover:border-accent hover:text-accent"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    >
      <AppProvider>
        <AppShell />
      </AppProvider>
    </ErrorBoundary>
  );
}
