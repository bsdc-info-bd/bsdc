import { useEffect, useState } from 'react';
import {
  attemptStaleBuildRecovery,
  currentBuild,
  isChunkLoadFailure,
  recoveryFailureMessage,
  type RecoveryOutcome,
} from '../data/chunk-recovery';

/**
 * Turns "this console did not open" into "this console opened".
 *
 * A console left open across a deploy asks for chunks the new build has already
 * replaced, and the import fails. Vite announces exactly that on
 * `vite:preloadError` *before* the rejection reaches React, so cancelling the
 * event here keeps the error out of the tree entirely: the console reloads into
 * the current build and the operator sees the tab they clicked.
 *
 * When recovery is not possible — offline, or the budget is spent — the hook
 * returns a message instead of pretending. A console that says "you are
 * offline" is usable; one that says "something went wrong" is not.
 */
export function useStaleBuildRecovery(scope: string): {
  readonly build: string;
  readonly failure: string | null;
  readonly dismiss: () => void;
} {
  const [failure, setFailure] = useState<string | null>(null);
  const build = currentBuild(import.meta.env as unknown as Record<string, unknown>);

  useEffect(() => {
    const handle = (candidate: unknown, prevent: () => void): void => {
      if (!isChunkLoadFailure(candidate)) return;
      const outcome: RecoveryOutcome = attemptStaleBuildRecovery(scope, build);
      if (outcome.recovered) {
        // The page is about to be replaced; suppress the rejection so React
        // does not paint an error screen for the milliseconds that remain.
        prevent();
        return;
      }
      const message = recoveryFailureMessage(outcome);
      if (message.length > 0) setFailure(message);
    };

    const onPreloadError = (event: Event): void => {
      handle((event as Event & { payload?: unknown }).payload, () => event.preventDefault());
    };
    // Not every failed import comes through Vite's helper — a dynamic `import()`
    // the bundler could not wrap rejects on its own — so the same recovery runs
    // on the unhandled rejection too. A failure handled elsewhere never reaches
    // here at all.
    const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
      handle(event.reason, () => event.preventDefault());
    };

    window.addEventListener('vite:preloadError', onPreloadError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('vite:preloadError', onPreloadError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [scope, build]);

  return { build, failure, dismiss: () => setFailure(null) };
}
