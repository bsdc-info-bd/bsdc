import { useState } from 'react';
import { cn } from '@/lib/cn';

export interface AvatarProps {
  /** Image URL. When absent or broken, initials are rendered instead. */
  src?: string | undefined;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
  className?: string;
}

const SIZES = {
  xs: 'h-6 w-6 text-2xs',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
} as const;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => [...part][0] ?? '').join('');
}

export function Avatar({ src, name, size = 'md', online, className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = typeof src === 'string' && src.length > 0 && !failed;

  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {showImage ? (
        <img
          src={src}
          alt={name}
          width={96}
          height={96}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={cn('rounded-full border border-border object-cover', SIZES[size])}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex items-center justify-center rounded-full border border-border',
            'bg-surface-2 font-semibold uppercase text-green-700',
            SIZES[size],
          )}
        >
          {initialsOf(name)}
        </span>
      )}
      {showImage ? null : <span className="fab-sr-only">{name}</span>}
      {online === true ? (
        <span
          className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-bg bg-online"
          aria-hidden="true"
        />
      ) : null}
    </span>
  );
}
