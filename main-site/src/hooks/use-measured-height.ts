import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * The height of a floating element, as a number, whenever it changes.
 *
 * A map that fills the viewport is drawn *behind* the chrome that floats over
 * it, so the pin has to be kept out from under that chrome — which means the
 * layout needs the number of pixels the chrome actually occupies. Measuring it
 * is the only honest way to get that number: the top bar and the bottom sheet
 * both change height with the language, the font scale, the safe-area insets
 * and, below 360 px, whether the action row stacks.
 *
 * So this watches the element with a `ResizeObserver` and answers with a
 * rounded CSS-pixel height. `ResizeObserver` reports fractional sizes, and a
 * Leaflet padding of 87.3333 px is a map that shimmers by a pixel every time
 * the sheet is nudged — hence the round.
 *
 * Environments without `ResizeObserver` (jsdom, older Safari) fall back to one
 * measurement on mount, so the caller always gets a usable number rather than
 * zero.
 */
export function useMeasuredHeight(ref: RefObject<HTMLElement | null>, active = true): number {
  const [height, setHeight] = useState(0);
  // Rounding removes the sub-pixel churn a drag gesture produces without
  // changing the value that reaches the map, so `setHeight` is not called for
  // a fractional difference it would then round away.
  const last = useRef(0);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (node === null) return;

    const publish = (next: number): void => {
      const rounded = Math.max(0, Math.round(next));
      if (rounded === last.current) return;
      last.current = rounded;
      setHeight(rounded);
    };

    publish(node.getBoundingClientRect().height);

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      // `contentRect` excludes the border, and these surfaces have none;
      // `borderBoxSize` is the number a sibling would have to clear.
      const box = entry.borderBoxSize?.[0];
      publish(box ? box.blockSize : entry.contentRect.height);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [ref, active]);

  return height;
}
