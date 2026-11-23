import { cn } from '@/lib/cn';

export interface LogoProps {
  /** `full` shows the wordmark, `mark` is the shield only. */
  variant?: 'full' | 'mark';
  className?: string;
  title?: string;
}

/**
 * The official BSDC logo, inlined as SVG so it renders instantly and scales from
 * favicon size to large displays. The shield is painted from the same tokens the
 * rest of the interface uses, which is what "follows the current theme" means
 * here: in light mode they resolve to the brand's own greens, and in dark mode
 * the ramp inverts under the mark exactly as it does under everything else.
 * The check takes --bsdc-on-primary, so it stays legible on the shield in both.
 */
export function Logo({ variant = 'full', className, title = 'BSDC' }: LogoProps) {
  if (variant === 'mark') {
    return (
      <svg
        viewBox="0 0 64 64"
        role="img"
        aria-label={title}
        className={cn('h-8 w-8', className)}
        focusable="false"
      >
        <defs>
          <linearGradient id="bsdcMarkGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--bsdc-green-700)' }} />
            <stop offset="1" style={{ stopColor: 'var(--bsdc-green-800)' }} />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="url(#bsdcMarkGrad)" />
        <path
          d="M32 12 16 20v14c0 11 7.5 17 16 19 8.5-2 16-8 16-19V20L32 12z"
          fill="none"
          style={{ stroke: 'var(--bsdc-green-200)' }}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M25 32l5 5 9-10"
          fill="none"
          style={{ stroke: 'var(--bsdc-on-primary)' }}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 320 80"
      role="img"
      aria-label={title}
      className={cn('h-8 w-auto', className)}
      focusable="false"
    >
      <defs>
        <linearGradient id="bsdcLogoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--bsdc-green-700)' }} />
          <stop offset="1" style={{ stopColor: 'var(--bsdc-green-800)' }} />
        </linearGradient>
      </defs>
      <g transform="translate(8 8)">
        <rect width="64" height="64" rx="16" fill="url(#bsdcLogoGrad)" />
        <path
          d="M32 12 16 20v14c0 11 7.5 17 16 19 8.5-2 16-8 16-19V20L32 12z"
          fill="none"
          style={{ stroke: 'var(--bsdc-green-200)' }}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M25 32l5 5 9-10"
          fill="none"
          style={{ stroke: 'var(--bsdc-on-primary)' }}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <text
        x="90"
        y="44"
        fontFamily="Inter, 'Segoe UI', Arial, sans-serif"
        fontSize="34"
        fontWeight="800"
        letterSpacing="-1"
        className="fill-green-800"
      >
        BSDC
      </text>
      <text
        x="90"
        y="64"
        fontFamily="Inter, 'Segoe UI', Arial, sans-serif"
        fontSize="12"
        fontWeight="600"
        letterSpacing="0.5"
        className="fill-green-700"
      >
        SOFTWARE DEVELOPMENT COMMUNITY
      </text>
    </svg>
  );
}
