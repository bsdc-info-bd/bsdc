/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useState } from 'react';
import { cn, initialsOf } from '@/lib/utils';
import { avatarUrl } from '@/lib/upload';

export interface AvatarProps {
  src?: string;
  name: string;
  size?: number;
  online?: boolean | null;
  ring?: boolean;
  className?: string;
  alt?: string;
}

export function Avatar({ src, name, size = 40, online, ring, className, alt }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const showImage = src && !broken;
  const style = { width: size, height: size };
  return (
    <span className={cn('relative inline-flex shrink-0', className)} style={style}>
      {showImage ? (
        <img
          src={avatarUrl(src, Math.min(256, Math.max(48, size * 2)))}
          alt={alt || `${name} profile photo`}
          loading="lazy"
          width={size}
          height={size}
          onError={() => setBroken(true)}
          className={cn(
            'rounded-full object-cover',
            ring && 'ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-offset-surface-dark',
          )}
          style={style}
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            'flex h-full w-full items-center justify-center rounded-full bg-brand-gradient font-semibold text-white',
            ring && 'ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-offset-surface-dark',
          )}
          style={{ fontSize: Math.max(10, size * 0.38) }}
        >
          {initialsOf(name) || 'B'}
        </span>
      )}
      {online !== undefined && online !== null ? (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 block rounded-full border-2 border-white dark:border-surface-dark',
            online ? 'bg-green-500' : 'bg-neutral-400',
          )}
          style={{ width: Math.max(8, size * 0.28), height: Math.max(8, size * 0.28) }}
          role="status"
          aria-label={online ? 'online' : 'offline'}
        />
      ) : null}
    </span>
  );
}
