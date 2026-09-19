/**
 * BSDC — src/shared/hooks/useDebounce.ts
 * Purpose : Debounced values for search and autosave (PART 25: debounced search at 250ms).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The timer is cleared on every change and on unmount, so a fast typist triggers one
 *           request, not one per keystroke.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';

/**
 * Debounces a value.
 * @param value source value
 * @param delayMs delay in milliseconds
 * @returns the value after it has stopped changing for the delay
 */
export function useDebounce<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
