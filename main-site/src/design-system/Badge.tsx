import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'green' | 'blue' | 'danger' | 'warn';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: ReactNode;
}

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-muted border-border',
  green: 'bg-surface-2 text-green-700 border-green-300/40',
  blue: 'bg-blue-soft text-blue border-blue/20',
  danger: 'bg-danger/10 text-danger border-danger/20',
  warn: 'bg-warn/10 text-warn border-warn/30',
};

export function Badge({ tone = 'neutral', icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold',
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {icon ? (
        <span aria-hidden="true" className="inline-flex">
          {icon}
        </span>
      ) : null}
      <span className="fab-truncate">{children}</span>
    </span>
  );
}
