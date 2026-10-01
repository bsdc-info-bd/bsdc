import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'blue';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-green-700 text-white hover:bg-green-500 active:bg-green-800',
  secondary: 'bg-surface-2 text-text hover:bg-surface border border-border',
  outline: 'border border-green-700 text-green-700 hover:bg-surface-2',
  ghost: 'text-text hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90',
  blue: 'bg-blue text-white hover:opacity-90',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-base gap-2 rounded-xl',
};

/** The primary action primitive: bilingual label as children, SVG icons only. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    block = false,
    loading = false,
    iconStart,
    iconEnd,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={cn(
        'fab-tap inline-flex select-none items-center justify-center font-semibold',
        'transition-colors duration-150 ease-app',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        iconStart
      )}
      <span className="fab-truncate">{children}</span>
      {iconEnd}
    </button>
  );
});
