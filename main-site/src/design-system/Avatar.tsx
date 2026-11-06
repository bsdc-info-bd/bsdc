import { useState } from 'react';

import { cn } from '@/lib/cn';
import { MediaImage } from '@/components/media/MediaImage';

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

/** The widest an avatar is ever drawn, so the pixel ratio stays honest. */
const PIXELS = 96;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => [...part][0] ?? '').join('');
}

/**
 * A member's picture, or their initials.
 *
 * ## Why this uses `MediaImage` and not an `<img>`
 *
 * An avatar is the most-repeated picture on the platform — every row of every
 * list has one — so it is the first thing a member notices when pictures stop
 * loading, and it was the one image path that never recovered from a single
 * failure: the plain `<img>` below set `failed` on the first `onError` and
 * latched it forever, so a picture that failed once while the phone was on a
 * train stayed initials for the rest of the session, even after the connection
 * came back.
 *
 * `MediaImage` walks the recovery ladder instead: a transient failure retries,
 * an expired signature is re-resolved, a poisoned cache entry is busted, and the
 * site's own proxy is the last rung before the initials. It also verifies the
 * paint, which the `<img>` could not do — an HTML error page served with
 * `200 image/jpeg` fires no `onError` and draws nothing.
 *
 * The initials are not a degraded state here; they are a designed one. A member
 * without a picture sees them from the first render, and the `src` change below
 * is what stops a *broken* picture from being permanent.
 */
export function Avatar({ src, name, size = 'md', online, className }: AvatarProps) {
  // When the address changes, the picture is a different picture: a member who
  // uploads a replacement, or a list tile that is recycled for another row. The
  // old code kept `failed` across both, so the new address was never tried.
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const address = typeof src === 'string' && src.length > 0 ? src : null;
  const showImage = address !== null && failedFor !== address;

  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {showImage ? (
        <MediaImage
          src={address}
          alt={name}
          width={PIXELS}
          height={PIXELS}
          slotWidth={PIXELS}
          loading="lazy"
          onFailure={() => setFailedFor(address)}
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
