import { AnimatePresence } from 'framer-motion';
import { ErrorBoundary } from 'react-error-boundary';
import { AppProvider } from './stores/AppProvider';
import { useAppStore } from './stores/appStore';
import { BackgroundAura, SiteNav, SiteFooter } from './components/layout';
import {
  ShareModeTabs,
  ShareInputView,
  ReceiveCodeForm,
  SharingView,
  ReceiverFileList,
  SuccessView,
  ErrorView,
  LoaderView,
} from './components/features';

/**
 * Routes between feature views based on app status.
 */
function AppShell() {
  const { state } = useAppStore();
  const showTabs = state.status === 'idle' && !state.isReceiving;

  return (
    <div className="relative flex flex-col min-h-dvh bg-void overflow-hidden font-['Inter'] text-text-primary selection:bg-signal/30">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[10001] focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-bright focus:text-void focus:rounded-xl focus:font-bold focus:text-sm"
      >
        Skip to content
      </a>
      <BackgroundAura />
      <SiteNav />

      <main id="main-content" className="relative z-40 flex-1 flex flex-col items-center justify-center pointer-events-none px-4 md:px-8 py-24 md:py-28">
        <AnimatePresence>
          {showTabs && <ShareModeTabs />}
        </AnimatePresence>

        <div className="w-full max-w-4xl relative flex items-center justify-center pointer-events-auto">
          <AnimatePresence mode="wait">
            {state.status === 'idle' && !state.isReceiving ? (
              <ShareInputView key={state.shareMode} />
            ) : state.status === 'idle' && state.isReceiving ? (
              <ReceiveCodeForm key="receive-form" />
            ) : state.status === 'connecting' ? (
              <LoaderView key="connecting" label="Establishing Link" hint="Reaching across the cosmos" />
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

export function App() {
  return (
    <ErrorBoundary
      fallbackRender={({ resetErrorBoundary }) => (
        <div className="min-h-dvh w-full bg-void flex items-center justify-center text-text-primary">
          <div className="text-center">
            <p className="text-error font-black uppercase tracking-[0.2em] text-xs mb-4">Something went wrong</p>
            <button
              type="button"
              onClick={resetErrorBoundary}
              className="px-8 py-3 bg-bright text-void rounded-xl font-black uppercase tracking-widest text-xs hover:scale-105 transition-transform"
            >
              Try Again
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
