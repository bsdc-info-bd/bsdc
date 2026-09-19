/**
 * BSDC — src/shared/hooks/useBreakpoint.ts
 * Purpose : Active breakpoint and navigation model from the single breakpoint source (ADR-009).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Layout decisions in JS read this hook; layout decisions in CSS read the same numbers
 *           through src/styles/responsive/*.css. The two can never disagree.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  NAVIGATION_MODEL,
  resolveBreakpoint,
  type BreakpointName,
} from '@/core/config/breakpoints';

/** Navigation model appropriate for the current width. */
export type NavigationModel = 'bottom' | 'rail' | 'three-column' | 'top';

/**
 * Tracks the viewport width and derives the breakpoint and navigation model.
 * @returns the active breakpoint, its pixel value and the navigation model
 */
export function useBreakpoint(): {
  breakpoint: BreakpointName;
  width: number;
  navigationModel: NavigationModel;
} {
  const read = useCallback((): { breakpoint: BreakpointName; width: number } => {
    const width = typeof window === 'undefined' ? 1280 : window.innerWidth;
    return { breakpoint: resolveBreakpoint(width), width };
  }, []);

  const [state, setState] = useState(read);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let frame = 0;
    const onResize = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setState(read()));
    };
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize);
    setState(read());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [read]);

  const model: NavigationModel =
    state.width >= NAVIGATION_MODEL.threeColumnMin
      ? 'three-column'
      : state.width >= NAVIGATION_MODEL.railNavMin
        ? 'rail'
        : state.width <= NAVIGATION_MODEL.bottomNavMax
          ? 'bottom'
          : 'top';

  return { breakpoint: state.breakpoint, width: state.width, navigationModel: model };
}
