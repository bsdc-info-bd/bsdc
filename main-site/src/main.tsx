import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import { AuthProvider } from './components/auth/AuthProvider';
import { AppCrashFallback } from './components/layout/AppCrashFallback';
import { initI18n } from './i18n';
import './styles/index.css';
import { isConfigured } from './lib/env';
import { startPerformanceReporting } from './lib/perf/collect';
import { registerPushServiceWorker } from './lib/push/register-worker';
import { registerQueryClient } from './lib/query-client';

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
      networkMode: 'always',
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
registerQueryClient(queryClient);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('BSDC: #root container is missing from index.html');
}
const container: HTMLElement = rootElement;

/**
 * The first render waits for the visitor's language bundle.
 *
 * The bundle is one chunk, fetched in parallel with this one, so the wait is
 * short — and the prerendered HTML is already on the screen while it happens,
 * which is why the wait is invisible. Rendering earlier would put raw
 * `home.heading` keys in front of the visitor instead.
 */
function mount(): void {
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
}

void initI18n()
  .catch(() => undefined)
  .then(mount);

// Registers the push-only worker and removes any legacy offline/image caches —
// once the page has loaded and the browser is idle. Nothing on the page waits
// for it, and a registration is main-thread work at exactly the moment the
// first paint is trying to happen.
function registerPushWhenIdle(): void {
  const run = () => registerPushServiceWorker();
  const schedule = () => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 4_000 });
    else setTimeout(run, 1_500);
  };
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
}

registerPushWhenIdle();

// The upload capability probe used to be warmed here, on every page view, "so
// the first member to attach a picture does not pay for the question". It was
// all cost and no benefit: the answer never gated an upload (the endpoint is
// the only thing that can see the key, and `uploadMedia` sends the file and
// reads the refusal), so every reader — including the many who will never
// attach anything — paid for one request to /api/media/providers on mobile data
// that they did not need.
//
// It now runs where it is useful: at the moment an upload starts, and on the
// diagnostics screen, which asks on its own. A page that uploads nothing asks
// nothing.

// Field measurement. It reports on pages, never on people, and it is sent
// once per page view on the browser's own "going away" signal.
const buildSha: unknown = import.meta.env['VITE_BUILD_SHA'];
startPerformanceReporting(typeof buildSha === 'string' ? buildSha : '');
