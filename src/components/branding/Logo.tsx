/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { cn } from '@/lib/utils';

/** BSDC icon mark — a rounded shield containing a stylized "B" formed by code brackets. */
export function BsdcMark({ size = 40, className, monochrome }: { size?: number; className?: string; monochrome?: 'white' | 'black' }) {
  const id = `bsdc-mark-grad-${monochrome || 'color'}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" role="img" aria-label="BSDC logo" className={className}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          {monochrome === 'white' ? (
            <>
              <stop stopColor="#FFFFFF" />
              <stop offset="1" stopColor="#FFFFFF" />
            </>
          ) : monochrome === 'black' ? (
            <>
              <stop stopColor="#000000" />
              <stop offset="1" stopColor="#000000" />
            </>
          ) : (
            <>
              <stop stopColor="#0A8F3F" />
              <stop offset="0.55" stopColor="#10B981" />
              <stop offset="1" stopColor="#14B8A6" />
            </>
          )}
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="16" fill={`url(#${id})`} />
      <path
        d="M24 18l-8 14 8 14"
        stroke="#fff"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />
      <path d="M32 44V20h7a7 7 0 010 14h-7" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M32 34h8a7 7 0 010 14h-8" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Horizontal primary logo (light-mode text colors auto-adapt via currentColor). */
export function BsdcLogo({
  height = 36,
  withTagline,
  stacked,
  className,
  variant = 'auto',
}: {
  height?: number;
  withTagline?: boolean;
  stacked?: boolean;
  className?: string;
  variant?: 'auto' | 'white' | 'black';
}) {
  const textColor = variant === 'white' ? '#FFFFFF' : variant === 'black' ? '#000000' : undefined;
  const subColor = variant === 'white' ? 'rgba(255,255,255,0.8)' : variant === 'black' ? 'rgba(0,0,0,0.65)' : undefined;
  return (
    <span
      className={cn('inline-flex items-center gap-2.5', stacked && 'flex-col text-center', className)}
      style={{ color: textColor }}
      role="img"
      aria-label="Bangladesh Software Development Community"
    >
      <BsdcMark size={height} monochrome={variant === 'white' ? 'white' : variant === 'black' ? 'black' : undefined} className={variant === 'auto' ? 'dark:brightness-110' : undefined} />
      <span className={cn('flex flex-col leading-none', stacked && 'items-center')}>
        <span
          className="font-extrabold tracking-tight"
          style={{ fontSize: height * 0.42, color: textColor ?? 'currentColor' }}
        >
          BSDC
        </span>
        <span className="hidden sm:block" style={{ fontSize: Math.max(8, height * 0.185), color: subColor ?? 'currentColor', opacity: subColor ? 1 : 0.65, fontWeight: 500 }}>
          {withTagline ? 'The Pride of Bangladesh — Where Developers Unite' : 'Bangladesh Software Development Community'}
        </span>
      </span>
    </span>
  );
}

/** Animated logo for loading screens / hero sections. */
export function BsdcAnimatedLogo({ size = 72, className }: { size?: number; className?: string }) {
  return (
    <span className={cn('relative inline-flex', className)} role="img" aria-label="BSDC animated logo">
      <span className="bsdc-animate-ring-pulse absolute inset-0 rounded-2xl" aria-hidden />
      <BsdcMark size={size} className="bsdc-animate-float" />
    </span>
  );
}

/** RRC Development parent organization mark. */
export function RrcLogo({ height = 28, className }: { height?: number; className?: string }) {
  return (
    <svg
      height={height}
      viewBox="0 0 180 40"
      fill="none"
      role="img"
      aria-label="RRC Development"
      className={className}
    >
      <rect x="2" y="4" width="32" height="32" rx="9" fill="#0F0F0F" />
      <text x="18" y="26" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800" fontFamily="Inter, sans-serif">R</text>
      <text x="44" y="25" fill="currentColor" fontSize="16" fontWeight="800" fontFamily="Inter, sans-serif">RRC Development</text>
      <path d="M44 31h118" stroke="#0A8F3F" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

