import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

/** A real, designed empty state — never a placeholder screen. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
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
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-prose text-sm text-muted">{description}</p>
      {action}
    </div>
  );
}
