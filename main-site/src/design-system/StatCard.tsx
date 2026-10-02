import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  className?: string;
}

export function StatCard({ icon, label, value, hint, className }: StatCardProps) {
  return (
    <div className={cn('rounded-card border border-border bg-surface p-3', className)}>
      <div className="flex items-center gap-2 text-green-700">
        <span aria-hidden="true">{icon}</span>
        <span className="fab-truncate text-xs font-semibold uppercase tracking-wide text-muted">
          {label}
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
