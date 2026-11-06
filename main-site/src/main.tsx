import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import { AuthProvider } from './components/auth/AuthProvider';
import { AppCrashFallback } from './components/layout/AppCrashFallback';
import './i18n';
import './styles/index.css';
import { startPerformanceReporting } from './lib/perf/collect';
import { healMediaCachesOnce, registerServiceWorker } from './pwa';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const container = document.getElementById('root');
if (!container) {
  throw new Error('BSDC: #root container is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary FallbackComponent={AppCrashFallback}>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  </StrictMode>,
);

registerServiceWorker();

/**
 * Drop a picture cache left behind by an older worker, before React paints
 * anything.
 *
 * This runs on the page rather than inside the worker because the worker that
 * wrote the bad cache is the one being replaced, and it is waiting behind an
 * update prompt. A member who has been clearing their whole cache for months
 * should not have to press anything for pictures to work again.
 */
void healMediaCachesOnce();

// Ask the deployment what it can upload through, once, while the browser is
// idle. The first member to attach a picture should not pay for that question
// with a visible delay, and a deployment whose Functions are not live learns it
// here rather than at the moment somebody presses publish.
const warmUploadCapabilities = () => {
  void import('./lib/storage/upload')
    .then(({ probeUploadCapabilities, setUploadCapabilities }) =>
      probeUploadCapabilities().then((capabilities) => setUploadCapabilities(capabilities)),
    )
    .catch(() => undefined);
};
if (typeof requestIdleCallback === 'function') {
  requestIdleCallback(warmUploadCapabilities, { timeout: 5_000 });
} else {
  setTimeout(warmUploadCapabilities, 1_500);
}

// Field measurement. It reports on pages, never on people, and it is sent
// once per page view on the browser's own "going away" signal.
const buildSha: unknown = import.meta.env['VITE_BUILD_SHA'];
startPerformanceReporting(typeof buildSha === 'string' ? buildSha : '');
