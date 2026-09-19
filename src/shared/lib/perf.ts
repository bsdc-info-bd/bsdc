/**
 * BSDC — src/shared/lib/perf.ts
 * Purpose : Performance measurement helpers for the ranking pipeline budgets and route timing
 *           (PART 12.10, PART 25).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Measurements are only taken in development or when analytics consent is granted, and
 *           they never block the main thread.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** A measurement produced by `measure`. */
export interface Measurement<T> {
  readonly value: T;
  readonly durationMs: number;
}

/**
 * Times a synchronous function with performance.now().
 * @param label measurement label
 * @param fn function to time
 * @returns the function result and the elapsed time
 */
export function measure<T>(label: string, fn: () => T): Measurement<T> {
  const start = performance.now();
  const value = fn();
  const durationMs = performance.now() - start;
  if (import.meta.env.DEV && durationMs > 16) {
    // Dev-only signal: a task over one frame (16ms) is a candidate for splitting.
    // Dev-only timing signal: a task over one frame (16ms) is a candidate for splitting.
    // eslint-disable-next-line no-console
    console.info(`[bsdc:perf] ${label} took ${durationMs.toFixed(2)}ms`);
  }
  return { value, durationMs };
}

/**
 * Runs a task during idle time, falling back to a timeout when requestIdleCallback is missing.
 * @param task work to run when the browser is idle
 * @param timeout maximum wait in milliseconds
 */
export function runWhenIdle(task: () => void, timeout = 1200): void {
  const idle = (
    globalThis as typeof globalThis & {
      requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number | undefined;
    }
  ).requestIdleCallback;
  if (typeof idle === 'function') {
    idle(task, { timeout });
    return;
  }
  globalThis.setTimeout(task, 1);
}

/**
 * Reads the Largest Contentful Paint entry once it settles.
 * @param callback receives the LCP time in milliseconds
 */
export function observeLcp(callback: (lcpMs: number) => void): void {
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) callback(last.startTime);
    });
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    /* Older browsers without LCP entries: nothing to report. */
  }
}
