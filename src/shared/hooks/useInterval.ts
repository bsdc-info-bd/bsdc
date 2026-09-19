/**
 * BSDC — src/shared/hooks/useInterval.ts
 * Purpose : Declarative interval that pauses when the tab is hidden (PART 25).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Background timers waste battery on low-end Android; pass `pauseWhenHidden: false`
 *           only for work that must continue (for example the launch countdown's own tick).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useRef } from 'react';

/**
 * Runs a callback on an interval.
 * @param callback work to run
 * @param delayMs interval in milliseconds (null pauses)
 * @param pauseWhenHidden whether to stop while the document is hidden
 */
export function useInterval(
  callback: () => void,
  delayMs: number | null,
  pauseWhenHidden = true,
): void {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (delayMs === null) return;
    let timer: number | undefined;

    const start = (): void => {
      stop();
      timer = window.setInterval(() => saved.current(), delayMs);
    };
    const stop = (): void => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibility = (): void => {
      if (!pauseWhenHidden) return;
      if (document.hidden) stop();
      else start();
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [delayMs, pauseWhenHidden]);
}
