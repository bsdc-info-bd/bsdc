import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: every icon-only control is labelled in the active language. */
  label: string;
  icon: ReactNode;
  variant?: 'ghost' | 'solid' | 'outline';
  size?: 'sm' | 'md';
}

/** Icon-only control with a guaranteed accessible name and a 44px hit area. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'fab-tap inline-flex items-center justify-center rounded-full transition-colors duration-150 ease-app',
        size === 'sm' ? 'h-9 w-9' : 'h-11 w-11',
        variant === 'ghost' && 'text-text hover:bg-surface-2',
        variant === 'solid' && 'bg-green-700 text-white hover:bg-green-500',
        variant === 'outline' && 'border border-border text-text hover:bg-surface-2',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true" className="inline-flex">
        {icon}
      </span>
    </button>
  );
});
