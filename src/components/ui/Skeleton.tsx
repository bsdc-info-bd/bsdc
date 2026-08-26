/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400', className)} role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

export function FullPageLoader() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4" role="status" aria-label="Loading">
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 rounded-full border-4 border-brand-100 dark:border-brand-900" />
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-brand-600" />
      </div>
      <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">BSDC</p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('bsdc-skeleton', className)} aria-hidden />;
}

export function FeedSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading feed" role="status">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bsdc-surface p-4">
          <div className="mb-3 flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="mb-2 h-4 w-full" />
          <Skeleton className="mb-4 h-4 w-3/4" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}
