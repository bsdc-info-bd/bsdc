/**
 * BSDC — src/shared/ui/PullToRefresh.tsx
 * Purpose : Pull-to-refresh for feeds, notifications, chats, orders and dashboards
 *           (PART 08.05, F-167).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The gesture only activates when the scroller is at the top, so it never fights with
 *           normal scrolling or with the browser's own overscroll.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Spinner } from './Spinner';

/** Props for the PullToRefresh component. */
export interface PullToRefreshProps {
  readonly children?: ReactNode | undefined;
  readonly onRefresh: () => Promise<void> | void;
  /** Pull distance required to trigger, in pixels. */
  readonly threshold?: number | undefined;
  readonly className?: string | undefined;
}

/**
 * Wraps content with a pull-to-refresh gesture.
 * @param props component props
 * @returns a wrapper element with a refresh indicator
 */
export function PullToRefresh({
  children,
  onRefresh,
  threshold = 72,
  className,
}: PullToRefreshProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPull(0);
    }
  }, [onRefresh]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const onTouchStart = (event: TouchEvent): void => {
      if (element.scrollTop > 0) return;
      startY.current = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event: TouchEvent): void => {
      if (startY.current === null || refreshing) return;
      const current = event.touches[0]?.clientY ?? startY.current;
      const distance = current - startY.current;
      if (distance <= 0) {
        setPull(0);
        return;
      }
      // Resistance grows with distance so the gesture feels physical, not elastic.
      setPull(Math.min(threshold * 1.6, distance * 0.5));
    };
    const onTouchEnd = (): void => {
      const shouldRefresh = pull >= threshold;
      startY.current = null;
      if (shouldRefresh) void run();
      else setPull(0);
    };

    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: true });
    element.addEventListener('touchend', onTouchEnd);
    element.addEventListener('touchcancel', onTouchEnd);
    return () => {
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [pull, refreshing, run, threshold]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex justify-center"
        style={{ height: pull, opacity: Math.min(1, pull / threshold) }}
        aria-hidden="true"
      >
        <span className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-ink-2">
          <Spinner size={16} />
        </span>
      </div>
      <div style={{ transform: `translateY(${pull}px)` }}>{children}</div>
      <span className="bsdc-sr-only" role="status" aria-live="polite">
        {refreshing ? 'Refreshing' : ''}
      </span>
    </div>
  );
}
