import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  rounded?: 'sm' | 'md' | 'full';
}

/** Content placeholder. Never used as a substitute for real data. */
export function Skeleton({ rounded = 'md', className, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'fab-skeleton',
        rounded === 'sm' && 'rounded',
        rounded === 'md' && 'rounded-lg',
        rounded === 'full' && 'rounded-full',
        className,
      )}
      {...rest}
    />
  );
}

/** Route-level loading state announced to assistive technology. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={label} className="fab-container py-6">
      <div className="fab-stack">
        <Skeleton className="h-8 w-2/3 max-w-sm" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
