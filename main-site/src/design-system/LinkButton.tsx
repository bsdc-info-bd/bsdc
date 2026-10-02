import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import type { ButtonSize, ButtonVariant } from './Button';

export interface LinkButtonProps {
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  iconStart?: ReactNode;
  className?: string;
  children: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-green-700 text-white hover:bg-green-500',
  secondary: 'bg-surface-2 text-text border border-border hover:bg-surface',
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

/** A router link styled as a button — keeps real anchor semantics for SEO. */
export function LinkButton({
  to,
  variant = 'primary',
  size = 'md',
  block = false,
  iconStart,
  className,
  children,
}: LinkButtonProps) {
  return (
    <Link
      to={to}
      className={cn(
        'fab-tap inline-flex select-none items-center justify-center font-semibold no-underline',
        'transition-colors duration-150 ease-app',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
    >
      {iconStart}
      <span className="fab-truncate">{children}</span>
    </Link>
  );
}
