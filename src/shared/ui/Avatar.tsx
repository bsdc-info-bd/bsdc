/**
 * BSDC — src/shared/ui/Avatar.tsx
 * Purpose : Avatar with initials fallback, presence dot, role ring and group layout
 *           (PART 08.09, F-029, F-370).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Width and height are always explicit so an avatar never contributes to CLS (LAW-21).
 *           The image element is only rendered once a source exists, so no broken-image icon can
 *           ever appear: the fallback initials show instead.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { initials, hasBangla } from '@/shared/lib/text';
import { tintFromString } from '@/shared/lib/color';

export type AvatarSize = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type PresenceState = 'online' | 'away' | 'offline';
export type AvatarRingKind =
  'verified' | 'creator' | 'vendor' | 'admin' | 'moderator' | 'story' | 'story-seen';

const PIXELS: Readonly<Record<AvatarSize, number>> = {
  '2xs': 20,
  xs: 28,
  sm: 36,
  md: 44,
  lg: 64,
  xl: 96,
  '2xl': 128,
};

/** Props for the Avatar component. */
export interface AvatarProps {
  readonly name: string;
  readonly src?: (string | null) | undefined;
  readonly size?: AvatarSize | undefined;
  readonly shape?: ('circle' | 'rounded' | 'square') | undefined;
  readonly ring?: AvatarRingKind | undefined;
  readonly presence?: PresenceState | undefined;
  readonly className?: string | undefined;
  /** Decorative when the name is already announced nearby. */
  readonly decorative?: boolean | undefined;
}

/**
 * Renders a user avatar.
 * @param props component props
 * @returns an avatar element
 */
export function Avatar({
  name,
  src,
  size = 'md',
  shape = 'circle',
  ring,
  presence,
  className,
  decorative = false,
}: AvatarProps): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const box = PIXELS[size];
  const showImage = typeof src === 'string' && src.length > 0 && !failed;
  const bangla = hasBangla(name);

  return (
    <span
      className={cn('bsdc-avatar', className)}
      data-size={size}
      data-shape={shape === 'circle' ? undefined : shape}
      data-ring={ring !== undefined ? 'true' : undefined}
      data-ring-kind={ring}
      style={{
        width: box,
        height: box,
        backgroundColor: showImage ? undefined : tintFromString(name),
      }}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      lang={bangla ? 'bn' : undefined}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          width={box}
          height={box}
          loading="lazy"
          decoding="async"
          className="bsdc-avatar__image"
          onError={(): void => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
      {presence !== undefined && (
        <span
          className="bsdc-presence-dot"
          data-state={presence}
          aria-hidden="true"
          title={presence}
        />
      )}
    </span>
  );
}

/** Props for the AvatarGroup component. */
export interface AvatarGroupProps {
  readonly children: ReactNode;
  readonly max?: number | undefined;
  readonly size?: AvatarSize | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders an overlapping avatar group with a +N indicator.
 * @param props component props
 * @returns a group element
 */
export function AvatarGroup({
  children,
  max = 4,
  size = 'sm',
  className,
}: AvatarGroupProps): React.ReactElement {
  const items = Array.isArray(children) ? children : [children];
  const shown = items.slice(0, max);
  const overflow = items.length - shown.length;
  return (
    <span
      className={cn('bsdc-avatar-group', className)}
      style={{ ['--bsdc-avatar-size' as string]: `${PIXELS[size]}px` }}
    >
      {shown}
      {overflow > 0 && (
        <span className="bsdc-avatar-group__more" aria-label={`+${overflow}`}>
          +{overflow}
        </span>
      )}
    </span>
  );
}
