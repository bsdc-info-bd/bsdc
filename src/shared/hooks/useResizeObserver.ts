/**
 * BSDC — src/shared/hooks/useResizeObserver.ts
 * Purpose : Element-size observation for container-query behaviour in JS (PART 08.04 R-05).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Used by virtual lists and maps that must know their own box, not the viewport.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState, type RefObject } from 'react';

/** Observed element size. */
export interface ElementSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Observes an element's content box.
 * @param ref ref to the element to observe
 * @returns the latest observed size (zeros before measurement)
 */
export function useResizeObserver(ref: RefObject<HTMLElement | null>): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
