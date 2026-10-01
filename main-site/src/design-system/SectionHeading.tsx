import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SectionHeadingProps {
  title: string;
  description?: string;
  level?: 2 | 3;
  action?: ReactNode;
  className?: string;
}

export function SectionHeading({
  title,
  description,
  level = 2,
  action,
  className,
}: SectionHeadingProps) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <div className={cn('mb-3 flex flex-wrap items-end justify-between gap-2', className)}>
      <div className="min-w-0">
        <Heading className={level === 2 ? 'text-2xl' : 'text-xl'}>{title}</Heading>
        {description ? <p className="mt-1 max-w-prose text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
