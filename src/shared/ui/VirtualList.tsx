/**
 * BSDC — src/shared/ui/VirtualList.tsx
 * Purpose : Windowed list for anything over 100 rows (PART 04 LAW-20, PART 25).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Only the visible window plus a small overscan is mounted, which keeps long feeds,
 *           admin tables and chat histories smooth on low-end Android.
 *           Rows are positioned with transform (never top) to avoid layout thrash.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { useResizeObserver } from '@/shared/hooks';

/** Props for the VirtualList component. */
export interface VirtualListProps<T> {
  readonly items: readonly T[];
  /** Row height in pixels. Uniform rows keep the maths O(1). */
  readonly itemHeight: number;
  readonly height: number | string;
  /** Number of rows rendered outside the viewport on each side. */
  readonly overscan?: number | undefined;
  readonly renderItem: (item: T, index: number) => ReactNode;
  readonly className?: string | undefined;
  readonly label?: string | undefined;
}

/**
 * Renders a virtualised list.
 * @param props component props
 * @returns a scrollable list element
 */
export function VirtualList<T>({
  items,
  itemHeight,
  height,
  overscan = 4,
  renderItem,
  className,
  label,
}: VirtualListProps<T>): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const { height: measuredHeight } = useResizeObserver(containerRef);

  const viewport = typeof height === 'number' ? height : measuredHeight;

  const onScroll = useCallback((event: React.UIEvent<HTMLDivElement>): void => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  useEffect(() => {
    setScrollTop(containerRef.current?.scrollTop ?? 0);
  }, [items.length]);

  const range = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(viewport / itemHeight) + overscan * 2;
    const end = Math.min(items.length, start + visibleCount);
    return { start, end };
  }, [scrollTop, itemHeight, viewport, overscan, items.length]);

  const rows = useMemo(() => {
    const output: ReactNode[] = [];
    for (let index = range.start; index < range.end; index += 1) {
      const item = items[index];
      if (item === undefined) continue;
      output.push(
        <div
          key={index}
          className="bsdc-virtual-list__item"
          style={{ height: itemHeight, transform: `translateY(${index * itemHeight}px)` }}
        >
          {renderItem(item, index)}
        </div>,
      );
    }
    return output;
  }, [items, range.start, range.end, itemHeight, renderItem]);

  return (
    <div
      ref={containerRef}
      className={cn('bsdc-virtual-list', className)}
      style={{ height }}
      onScroll={onScroll}
      role="list"
      aria-label={label}
      tabIndex={0}
    >
      <div className="bsdc-virtual-list__sizer" style={{ height: items.length * itemHeight }}>
        {rows}
      </div>
    </div>
  );
}
