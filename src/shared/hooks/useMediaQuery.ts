/**
 * BSDC — src/shared/hooks/useMediaQuery.ts
 * Purpose : Reactive media query subscription (PART 08.04).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Uses addEventListener with the Safari 13 fallback removed — the browserslist floor is
 *           Safari 15. The listener is always removed on unmount (LAW-22).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';

/**
 * Subscribes to a media query.
 * @param query CSS media query string
 * @returns true when the query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const list = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent): void => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener('change', listener);
    return () => list.removeEventListener('change', listener);
  }, [query]);

  return matches;
}
