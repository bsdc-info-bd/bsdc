/**
 * BSDC — src/shared/hooks/useVisibility.ts
 * Purpose : Document visibility for pausing realtime listeners and timers (PART 25).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Realtime listeners resume with a catch-up read on focus, which is why this hook also
 *           reports the timestamp of the last focus change.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';

/**
 * Tracks document visibility.
 * @returns whether the document is currently visible, and the last change timestamp
 */
export function useVisibility(): { visible: boolean; lastChangedAt: number } {
  const [state, setState] = useState<{ visible: boolean; lastChangedAt: number }>(() => ({
    visible: typeof document === 'undefined' ? true : !document.hidden,
    lastChangedAt: Date.now(),
  }));

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handler = (): void => setState({ visible: !document.hidden, lastChangedAt: Date.now() });
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  return state;
}
