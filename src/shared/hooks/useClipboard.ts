/**
 * BSDC — src/shared/hooks/useClipboard.ts
 * Purpose : Copy-to-clipboard with a transient "copied" state for share sheets (F-150).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The copied flag resets after two seconds; the timer is cleared on unmount.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { copyText } from '@/shared/lib/clipboard';

/**
 * Copy helper with transient state.
 * @param resetMs how long the copied flag stays true
 * @returns the copied flag and a copy function
 */
export function useClipboard(resetMs = 2000): {
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
} {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      const ok = await copyText(text);
      setCopied(ok);
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), resetMs);
      return ok;
    },
    [resetMs],
  );

  return { copied, copy };
}
