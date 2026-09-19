/**
 * BSDC — src/shared/ui/InfiniteScrollSentinel.tsx
 * Purpose : Cursor-pagination sentinel with end-of-list and error states (F-165).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Uses IntersectionObserver, disconnects on unmount, and never fires while a page is
 *           already loading or when the end has been reached (PART 11.03 pagination rules).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Spinner } from './Spinner';

/** Props for the InfiniteScrollSentinel component. */
export interface InfiniteScrollSentinelProps {
  readonly onLoadMore: () => void;
  readonly hasMore: boolean;
  readonly loading: boolean;
  readonly error?: string | undefined;
  readonly endMessage?: ReactNode | undefined;
  readonly retryLabel?: string | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders the infinite-scroll sentinel and its states.
 * @param props component props
 * @returns a sentinel element
 */
export function InfiniteScrollSentinel({
  onLoadMore,
  hasMore,
  loading,
  error,
  endMessage,
  retryLabel = 'Try again',
  className,
}: InfiniteScrollSentinelProps): React.ReactElement {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(onLoadMore);
  loadMoreRef.current = onLoadMore;

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || !hasMore || loading || error !== undefined) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting === true) loadMoreRef.current();
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, loading, error]);

  return (
    <div className={cn('w-full', className)}>
      <div ref={sentinelRef} className="bsdc-feed__sentinel" aria-hidden="true" />
      {loading && (
        <div className="flex justify-center py-6" role="status" aria-live="polite">
          <Spinner size={22} label="Loading more" />
        </div>
      )}
      {error !== undefined && (
        <div className="flex flex-col items-center gap-2 py-6" role="alert">
          <p className="text-sm text-[var(--bsdc-danger)]">{error}</p>
          <button
            type="button"
            className="bsdc-button"
            data-variant="secondary"
            data-size="sm"
            onClick={onLoadMore}
          >
            {retryLabel}
          </button>
        </div>
      )}
      {!hasMore && !loading && endMessage !== undefined && (
        <p className="bsdc-feed__end">{endMessage}</p>
      )}
    </div>
  );
}
