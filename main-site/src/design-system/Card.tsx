import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Semantic element to render — lists use `li`, feed items use `article`. */
  as?: 'div' | 'article' | 'section' | 'li';
  padded?: boolean;
  interactive?: boolean;
  children: ReactNode;
}

/** Raised surface used by feed items, panels and dashboards. */
export function Card({
  as = 'div',
  padded = true,
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  const Tag = as as ElementType;
  return (
    <Tag
      className={cn(
        'rounded-card border border-border bg-surface shadow-card',
        padded && 'p-3 sm:p-4',
        interactive && 'transition-shadow duration-150 ease-app hover:shadow-raised',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mb-2 flex items-start justify-between gap-2', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-lg font-semibold', className)} {...rest}>
      {children}
    </h3>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('text-sm text-muted', className)} {...rest}>
      {children}
    </div>
  );
}
