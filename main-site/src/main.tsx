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
import { isConfigured } from './lib/env';
import { startPerformanceReporting } from './lib/perf/collect';
import { registerServiceWorker } from './pwa';

/**
 * The connection to the database is opened before React asks for anything.
 *
 * Two of the first three requests a visitor makes go to the Supabase project:
 * the session, then the first page of the feed, then the counters beside it.
 * Each one otherwise pays for a DNS lookup and a TLS handshake to a hostname the
 * page has never spoken to, and a handshake is most of a second on a mobile
 * network. Starting it here, from a module that loads with the bundle rather than
 * from a component that appears after the first paint, means the handshake is
 * already finished by the time a query needs it.
 *
 * `crossorigin` because the requests carry an `apikey` header and an auth bearer
 * token: a preconnect without it opens a connection the fetch cannot reuse, which
 * is a handshake spent for nothing.
 */
function preconnectDatabase(): void {
  if (typeof document === 'undefined' || !isConfigured.supabase) return;
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!url) return;
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return;
  }
  for (const attributes of [{ rel: 'preconnect', crossorigin: '' }, { rel: 'dns-prefetch' }]) {
    // A second copy of a hint is a wasted element, and this file is imported by
    // tests as well as by the entry point.
    if (document.head.querySelector(`link[rel="${attributes.rel}"][href="${origin}"]`)) continue;
    const link = document.createElement('link');
    link.rel = attributes.rel;
    link.href = origin;
    if (attributes.crossorigin !== undefined) link.crossOrigin = '';
    document.head.append(link);
  }
}

preconnectDatabase();

/**
 * Whether this browser can decode and encode modern picture formats.
 *
 * Sets `data-image-format` on `<html>` before the first paint so feature-aware
 * styles can avoid layout shift.
 */
function markImageCapability(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const probe = document.createElement('canvas');
  const context = probe.getContext?.('2d');
  if (context === null || context === undefined) return;
  const candidates: [string, string][] = [
    ['avif', 'image/avif'],
    ['webp', 'image/webp'],
  ];
  for (const [name, mime] of candidates) {
    if (probe.toDataURL(mime).startsWith(`data:${mime}`)) root.dataset.imageFormat = name;
  }
}

markImageCapability();

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

// `registerServiceWorker` heals the picture cache itself, once per build, before
// it registers anything. Calling `healMediaCachesOnce` here as well raced it:
// two calls passed the marker check together and both deleted, which is how a
// cache that was still being written went missing.
registerServiceWorker();

// Ask the deployment what it can upload through, once, while the browser is
// idle — so the first member to attach a picture does not pay for the question.
//
// It is only a question. The answer is recorded for the diagnostics screen and
// is never used to decide whether an upload may be attempted; that decision
// belongs to the endpoint, which is the only thing that can see the key. See
// `uploadMedia` in lib/storage/upload.ts.
const warmUpload = () => {
  void import('./lib/storage/upload')
    .then(({ warmUploadCapabilities }) => warmUploadCapabilities())
    .catch(() => undefined);
};
if (typeof requestIdleCallback === 'function') {
  requestIdleCallback(warmUpload, { timeout: 5_000 });
} else {
  setTimeout(warmUpload, 1_500);
}

// Field measurement. It reports on pages, never on people, and it is sent
// once per page view on the browser's own "going away" signal.
const buildSha: unknown = import.meta.env['VITE_BUILD_SHA'];
startPerformanceReporting(typeof buildSha === 'string' ? buildSha : '');
