/**
 * BSDC — src/shared/hooks/useLockScroll.ts
 * Purpose : Body scroll lock for modals and sheets, without the iOS scroll-jump (PART 08.04 R-17).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The scrollbar gutter is compensated with padding so locking never shifts the layout
 *           (CLS budget, PART 25).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect } from 'react';

/**
 * Locks body scrolling while `locked` is true.
 * @param locked whether scrolling should be disabled
 */
export function useLockScroll(locked: boolean): void {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return;
    const { body, documentElement } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingInlineEnd = body.style.paddingInlineEnd;
    const gutter = window.innerWidth - documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (gutter > 0) body.style.paddingInlineEnd = `${gutter}px`;
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingInlineEnd = previousPaddingInlineEnd;
    };
  }, [locked]);
}
