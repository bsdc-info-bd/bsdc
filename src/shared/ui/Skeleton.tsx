/**
 * BSDC — src/shared/ui/Skeleton.tsx
 * Purpose : Loading placeholders that reserve the final layout (F-168, CLS budget).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every skeleton is aria-hidden; the surrounding region carries aria-busy so assistive
 *           technology announces loading once, not once per placeholder.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { cn } from '@/shared/lib/cn';

/** Props for the Skeleton component. */
export interface SkeletonProps {
  readonly variant?: ('text' | 'rect' | 'circle') | undefined;
  readonly width?: (number | string) | undefined;
  readonly height?: (number | string) | undefined;
  readonly lines?: number | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders a single skeleton block or a group of text lines.
 * @param props component props
 * @returns a skeleton element
 */
export function Skeleton({
  variant = 'rect',
  width,
  height = 16,
  lines = 1,
  className,
}: SkeletonProps): React.ReactElement {
  if (variant === 'text' && lines > 1) {
    return (
      <span className={cn('bsdc-skeleton-line-group', className)} aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => (
          <span key={index} className="bsdc-skeleton" data-variant="text" style={{ width }} />
        ))}
      </span>
    );
  }
  return (
    <span
      className={cn('bsdc-skeleton', className)}
      data-variant={variant}
      style={{ width, height: variant === 'circle' ? width : height }}
      aria-hidden="true"
    />
  );
}

/** Props for the FeedSkeleton component. */
export interface FeedSkeletonProps {
  readonly count?: number | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders a feed-shaped loading skeleton that matches the final card layout.
 * @param props component props
 * @returns a skeleton list
 */
export function FeedSkeleton({ count = 3, className }: FeedSkeletonProps): React.ReactElement {
  return (
    <div className={cn('bsdc-feed-skeleton', className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="bsdc-feed-skeleton__item">
          <div className="bsdc-feed-skeleton__header">
            <Skeleton variant="circle" width={40} />
            <div className="flex-1">
              <Skeleton variant="text" width="42%" height={12} />
              <Skeleton variant="text" width="26%" height={10} />
            </div>
          </div>
          <Skeleton variant="text" lines={3} />
        </div>
      ))}
    </div>
  );
}
