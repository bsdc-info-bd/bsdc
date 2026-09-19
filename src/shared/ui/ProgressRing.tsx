/**
 * BSDC — src/shared/ui/ProgressRing.tsx
 * Purpose : Circular progress for levels, quotas and quotas (F-302, F-508) plus linear progress.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The ring is an SVG with role="progressbar" and full ARIA value attributes, so it is
 *           announced correctly without any extra live region.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { cn } from '@/shared/lib/cn';
import { toBanglaNumerals } from '@/shared/lib/number.bn';

/** Props for the ProgressRing component. */
export interface ProgressRingProps {
  /** Completed fraction, 0 to 1. */
  readonly value: number;
  readonly size?: number | undefined;
  readonly thickness?: number | undefined;
  readonly label?: string | undefined;
  /** Render the percentage inside the ring. */
  readonly showValue?: boolean | undefined;
  readonly banglaNumerals?: boolean | undefined;
  readonly className?: string | undefined;
  readonly tone?: ('brand' | 'success' | 'warning' | 'danger') | undefined;
}

const TONE_COLOR: Readonly<Record<NonNullable<ProgressRingProps['tone']>, string>> = {
  brand: 'var(--bsdc-green-500)',
  success: 'var(--bsdc-success)',
  warning: 'var(--bsdc-warning)',
  danger: 'var(--bsdc-danger)',
};

/**
 * Renders a circular progress indicator.
 * @param props component props
 * @returns an SVG progress ring
 */
export function ProgressRing({
  value,
  size = 64,
  thickness = 6,
  label,
  showValue = false,
  banglaNumerals = false,
  className,
  tone = 'brand',
}: ProgressRingProps): React.ReactElement {
  const clamped = Math.min(1, Math.max(0, value));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);
  const percent = Math.round(clamped * 100);

  return (
    <div
      className={cn('bsdc-progress-ring', className)}
      style={{ width: size, height: size, ['--bsdc-ring-size' as string]: `${size}px` }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={label}
    >
      <svg
        className="bsdc-progress-ring__track"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bsdc-surface-3)"
          strokeWidth={thickness}
        />
      </svg>
      <svg
        className="bsdc-progress-ring__value"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={TONE_COLOR[tone]}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset var(--motion-base) var(--ease-standard)' }}
        />
      </svg>
      {showValue && (
        <span className="bsdc-progress-ring__label">
          {banglaNumerals ? toBanglaNumerals(`${percent}%`) : `${percent}%`}
        </span>
      )}
    </div>
  );
}

/** Props for the Progress component. */
export interface ProgressProps {
  /** Completed fraction, 0 to 1; omit for an indeterminate bar. */
  readonly value?: number | undefined;
  readonly label?: string | undefined;
  readonly tone?: ('brand' | 'success' | 'warning' | 'danger') | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders a linear progress bar.
 * @param props component props
 * @returns a progress element
 */
export function Progress({
  value,
  label,
  tone = 'brand',
  className,
}: ProgressProps): React.ReactElement {
  const indeterminate = value === undefined;
  const percent = indeterminate ? 0 : Math.min(100, Math.max(0, Math.round(value * 100)));
  return (
    <div
      className={cn('bsdc-progress', className)}
      data-tone={tone}
      data-indeterminate={indeterminate ? 'true' : 'false'}
      role="progressbar"
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : 100}
      aria-valuenow={indeterminate ? undefined : percent}
      aria-label={label}
    >
      <div
        className="bsdc-progress__indicator"
        style={{
          width: `${percent}%`,
          backgroundColor: TONE_COLOR[tone],
          transform: indeterminate ? undefined : 'none',
        }}
      />
    </div>
  );
}
