import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  icon?: ReactNode;
}

/** Filter chip used in rails, search filters and tag lists. */
export function Chip({ selected = false, icon, className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'fab-tap inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold',
        'transition-colors duration-150 ease-app',
        selected
          ? 'border-green-700 bg-green-700 text-white'
          : 'border-border bg-surface text-muted hover:bg-surface-2',
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
    </button>
  );
}
