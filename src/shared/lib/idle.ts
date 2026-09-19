/**
 * BSDC — src/shared/lib/idle.ts
 * Purpose : Runs work after the browser has painted the frame the person is waiting for.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : PART 25 ties the product to real Core Web Vitals, and the largest single risk to LCP is
 *   work that is "technically lazy" but still starts during the first frame. Anything that is not
 *   needed to paint — the Firebase SDK, badge subscriptions, analytics — goes through here.
 *   requestIdleCallback is used when the browser offers it; otherwise the work is scheduled on a
 *   zero-delay task, which still lands after the current paint.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Callback signature shared by both scheduling paths. */
export type IdleCallback = () => void;

/**
 * Schedules work for the next idle period.
 * @param callback work to run
 * @param timeoutMs maximum wait before the work runs regardless of idleness
 * @returns a cancel function
 */
export function onIdle(callback: IdleCallback, timeoutMs = 2_000): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(() => callback(), { timeout: timeoutMs });
    return () => cancelIdleCallback(handle);
  }
  const timer = setTimeout(callback, 1);
  return () => clearTimeout(timer);
}

/**
 * Schedules work and resolves when it has run.
 * @param callback work to run
 * @param timeoutMs maximum wait before the work runs
 * @returns a promise that resolves after the work, and a cancel function
 */
export function whenIdle(callback: IdleCallback, timeoutMs = 2_000): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(
        () => {
          callback();
          resolve();
        },
        { timeout: timeoutMs },
      );
      return;
    }
    setTimeout(() => {
      callback();
      resolve();
    }, 1);
  });
}
