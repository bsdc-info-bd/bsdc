/**
 * BSDC — src/shared/hooks/useIsomorphicLayoutEffect.ts
 * Purpose : useLayoutEffect that is safe during server-side prerender (PART 10.02).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The prerender pipeline renders components in Node; calling useLayoutEffect there
 *           produces a React warning, which counts as a console error (PART 23.1).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useLayoutEffect } from 'react';

/** useLayoutEffect in the browser, useEffect during prerender. */
export const useIsomorphicLayoutEffect: typeof useEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;
