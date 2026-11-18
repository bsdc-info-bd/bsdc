import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  /**
   * Heading level for the title. It is a section-level statement on the page
   * that shows it, so it is an `h2` unless a caller says otherwise: an `h3`
   * straight after the page's `h1` is a skipped level, which the accessibility
   * audit reports as a heading-order failure.
   */
  headingLevel?: 2 | 3;
}

/** A real, designed empty state — never a placeholder screen. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  headingLevel = 2,
}: EmptyStateProps) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-dashed',
        'border-border bg-surface px-4 py-10 text-center',
        className,
      )}
    >
      <span aria-hidden="true" className="text-green-700">
        {icon}
      </span>
      <Heading className="text-lg font-semibold">{title}</Heading>
      <p className="max-w-prose text-sm text-muted">{description}</p>
      {action}
    </div>
  );
}
