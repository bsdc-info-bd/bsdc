/**
 * BSDC — src/shared/hooks/index.ts
 * Purpose : Public surface of the hooks library (ADR-004: narrow public APIs per module).
 * Owner   : RRC Development / BSDC Platform Team
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
export { useAnnounce } from './useAnnounce';
export { useBreakpoint, type NavigationModel } from './useBreakpoint';
export { useClipboard } from './useClipboard';
export { useControllableState } from './useControllableState';
export { useCountdown, type CountdownState } from './useCountdown';
export { useDebounce } from './useDebounce';
export { useEventListener } from './useEventListener';
export { useInterval } from './useInterval';
export { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';
export { useLocalStorageState } from './useLocalStorageState';
export { useLockScroll } from './useLockScroll';
export { useMediaQuery } from './useMediaQuery';
export { useMounted } from './useMounted';
export { useOnline } from './useOnline';
export { usePrefersReducedMotion } from './usePrefersReducedMotion';
export { useResizeObserver, type ElementSize } from './useResizeObserver';
export { useVisibility } from './useVisibility';
