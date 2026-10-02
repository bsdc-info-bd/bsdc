import { createReporter, type Reporter, type Vital } from './vitals';

/**
 * Wiring the reporter to the browser.
 *
 * The observers below are the platform's own — `PerformanceObserver` with
 * the buffered flag — rather than a measurement library, because a
 * performance tool that ships thirty kilobytes to measure a page is part of
 * the problem it reports on.
 */

let reporter: Reporter | null = null;

function connectionLabel(): string {
  const nav = navigator as Navigator & { connection?: { effectiveType?: string } };
  return nav.connection?.effectiveType ?? '';
}

function deviceKindFromWindow(): 'mobile' | 'tablet' | 'desktop' {
  const width = window.innerWidth;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if (width < 600) return 'mobile';
  if (width < 1024 && coarse) return 'tablet';
  return 'desktop';
}

function observe(type: string, handle: (entry: PerformanceEntry) => void): void {
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) handle(entry);
    });
    observer.observe({ type, buffered: true } as PerformanceObserverInit);
  } catch {
    // An engine without this entry type simply contributes nothing. A
    // missing measurement is a gap in a chart; a thrown error is a broken
    // page, and the page matters more.
  }
}

/**
 * Starts collecting. Called once from the entry point; safe to call again
 * (it does nothing the second time) and inert when the browser lacks the
 * APIs, which is why there is no feature-detection branch in the caller.
 */
export function startPerformanceReporting(build = ''): void {
  if (reporter !== null) return;
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;

  reporter = createReporter({
    build,
    route: () => window.location.pathname,
    device: deviceKindFromWindow,
    connection: connectionLabel,
    send: (endpoint, body) => {
      try {
        if (typeof navigator.sendBeacon === 'function') {
          return navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
        }
        void fetch(endpoint, { method: 'POST', body, keepalive: true });
        return true;
      } catch {
        return false;
      }
    },
  });

  const add = (metric: Vital, value: number): void => reporter?.add(metric, value);

  observe('largest-contentful-paint', (entry) => add('LCP', entry.startTime));
  observe('paint', (entry) => {
    if (entry.name === 'first-contentful-paint') add('FCP', entry.startTime);
  });
  observe('navigation', (entry) => {
    const navigation = entry as PerformanceNavigationTiming;
    add('TTFB', navigation.responseStart);
  });
  observe('event', (entry) => {
    const event = entry as PerformanceEntry & { duration: number; interactionId?: number };
    if (event.interactionId) add('INP', event.duration);
  });

  let shifted = 0;
  observe('layout-shift', (entry) => {
    const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
    if (!shift.hadRecentInput) {
      shifted += shift.value;
      add('CLS', shifted);
    }
  });

  window.addEventListener('error', (event) => {
    reporter?.addError(event.error instanceof Error ? event.error.name : 'Error', event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason;
    reporter?.addError(
      reason instanceof Error ? reason.name : 'UnhandledRejection',
      reason instanceof Error ? reason.message : String(reason),
    );
  });

  // "visibilitychange to hidden" is the only signal every browser agrees
  // actually fires; unload does not, on mobile.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') reporter?.flush();
  });
}
