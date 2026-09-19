/**
 * BSDC — src/shared/hooks/useMounted.ts
 * Purpose : Mounted flag used to gate browser-only rendering after prerender (PART 10.02).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Prevents hydration mismatches for anything that depends on the client clock, storage
 *           or matchMedia.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';

/**
 * True once the component has mounted in the browser.
 * @returns mounted flag
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
