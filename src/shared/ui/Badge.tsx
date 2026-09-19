/**
 * BSDC — src/shared/ui/Badge.tsx
 * Purpose : Status, count and role badges. Role is conveyed by colour plus text, never emoji
 *           (PART 04 LAW-01).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Counts clamp visually at 99+ but the accessible label keeps the true number, so a
 *           screen reader never reads "99+" when the real figure matters.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { toBanglaNumerals } from '@/shared/lib/number.bn';

export type BadgeTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'brand'
  | 'verified'
  | 'admin'
  | 'moderator'
  | 'vendor'
  | 'money';

/** Props for the Badge component. */
export interface BadgeProps {
  readonly children?: ReactNode | undefined;
  readonly tone?: BadgeTone | undefined;
  readonly variant?: ('solid' | 'dot' | 'count' | 'outline') | undefined;
  readonly count?: number | undefined;
  readonly className?: string | undefined;
  /** Render digits in Bengali numerals. */
  readonly banglaNumerals?: boolean | undefined;
}

/**
 * Renders a badge.
 * @param props component props
 * @returns a badge element
 */
export function Badge({
  children,
  tone = 'neutral',
  variant = 'solid',
  count,
  className,
  banglaNumerals = false,
}: BadgeProps): React.ReactElement {
  const format = (value: number): string =>
    banglaNumerals ? toBanglaNumerals(value) : String(value);

  if (variant === 'count' && count !== undefined) {
    const clamped = count > 99 ? '99+' : format(count);
    return (
      <span
        className={cn('bsdc-badge', className)}
        data-tone={tone}
        data-variant="count"
        aria-label={format(count)}
      >
        {clamped}
      </span>
    );
  }

  return (
    <span className={cn('bsdc-badge', className)} data-tone={tone} data-variant={variant}>
      {variant === 'dot' && <span className="bsdc-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
