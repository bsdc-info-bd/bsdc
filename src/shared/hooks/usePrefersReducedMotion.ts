/**
 * BSDC — src/shared/hooks/usePrefersReducedMotion.ts
 * Purpose : Reactive reduced-motion preference (PART 08.03, LAW-14).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Components read this to collapse JS animations; CSS handles the rest through
 *           src/styles/responsive/reduced-motion.css.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useMediaQuery } from './useMediaQuery';

/**
 * Reads the motion preference.
 * @returns true when the user asked for reduced motion
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
