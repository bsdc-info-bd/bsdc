import { useEffect } from 'react';
import { isChunkLoadFailure, recoverFromStaleBuild } from '@/lib/site/chunk-recovery';

/** The build this document was rendered from, used to tell one deploy from the next. */
const BUILD = String(import.meta.env['VITE_BUILD_SHA'] ?? 'dev');

/**
 * Turns "this page did not open" into "this page opened".
 *
 * A tab left open across a deploy asks for chunks that the new build has
 * already replaced, and the import fails. Vite announces exactly that on
 * `vite:preloadError` *before* the rejection reaches React, so cancelling the
 * event here keeps the error out of the router entirely: the page reloads into
 * the current build and the visitor sees the page they clicked, not an error
 * screen. See `@/lib/site/chunk-recovery` for why a reload, not a retry.
 */
export function useStaleBuildRecovery(): void {
  useEffect(() => {
    const onPreloadError = (event: Event): void => {
      if (!isChunkLoadFailure((event as Event & { payload?: unknown }).payload)) return;
      event.preventDefault();
      recoverFromStaleBuild(BUILD);
    };
    // Not every failed import comes through Vite's helper — a dynamic `import()`
    // the bundler could not wrap rejects on its own — so the same recovery runs
    // on the unhandled rejection too. A failure that is handled elsewhere does
    // not reach here at all.
    const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
      if (!isChunkLoadFailure(event.reason)) return;
      if (recoverFromStaleBuild(BUILD)) event.preventDefault();
    };
    window.addEventListener('vite:preloadError', onPreloadError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('vite:preloadError', onPreloadError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);
}
