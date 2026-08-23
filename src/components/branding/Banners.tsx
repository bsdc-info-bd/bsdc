/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { BsdcMark } from './Logo';
import { cn } from '@/lib/utils';

/**
 * Branded banner generator used across social covers, promo banners,
 * email headers and milestone celebrations.
 */
export function BrandBanner({
  width = 1200,
  height = 630,
  title,
  subtitle,
  variant = 'social',
  lang = 'en',
  className,
}: {
  width?: number;
  height?: number;
  title?: string;
  subtitle?: string;
  variant?: 'social' | 'promo' | 'email-header' | 'email-footer' | 'newsletter' | 'milestone' | 'welcome' | 'event' | 'job';
  lang?: 'en' | 'bn';
  className?: string;
}) {
  const t = title || (lang === 'bn' ? 'বাংলাদেশ সফটওয়্যার ডেভেলপমেন্ট কমিউনিটি' : 'Bangladesh Software Development Community');
  const s = subtitle || (lang === 'bn' ? 'বাংলাদেশের গর্ব — যেখানে ডেভেলপাররা একত্র হয়' : 'The Pride of Bangladesh — Where Developers Unite');
  const uid = `banner-${variant}-${lang}-${width}`;
  const scale = Math.min(1.4, width / 630);
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${t} banner`}
      className={cn('block', className)}
    >
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2={width} y2={height} gradientUnits="userSpaceOnUse">
          <stop stopColor="#042A14" />
          <stop offset="0.5" stopColor="#0A8F3F" />
          <stop offset="1" stopColor="#14B8A6" />
        </linearGradient>
        <pattern id={`${uid}-dots`} width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.6" fill="rgba(255,255,255,0.14)" />
        </pattern>
      </defs>
      <rect width={width} height={height} rx="0" fill={`url(#${uid}-bg)`} />
      <rect width={width} height={height} fill={`url(#${uid}-dots)`} />
      <g transform={`translate(${width / 2 - 36 * scale}, ${height / 2 - 96 * scale}) scale(${scale})`}>
        <rect x="4" y="4" width="64" height="64" rx="16" fill="#FFFFFF" opacity="0.98" />
        <path d="M24 18l-8 14 8 14" stroke="#0A8F3F" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M32 44V20h7a7 7 0 010 14h-7" stroke="#0A8F3F" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M32 34h8a7 7 0 010 14h-8" stroke="#14B8A6" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <text
        x={width / 2}
        y={height / 2 + 30 * scale}
        textAnchor="middle"
        fill="#FFFFFF"
        fontSize={Math.round(34 * Math.min(scale * 1.4, 1.6))}
        fontWeight="800"
        fontFamily="Inter, Hind Siliguri, sans-serif"
      >
        {t}
      </text>
      <text
        x={width / 2}
        y={height / 2 + 66 * scale}
        textAnchor="middle"
        fill="rgba(255,255,255,0.85)"
        fontSize={Math.round(17 * Math.min(scale * 1.4, 1.6))}
        fontWeight="500"
        fontFamily="Inter, Hind Siliguri, sans-serif"
      >
        {s}
      </text>
      <text x={width / 2} y={height - 22} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="13" fontFamily="Inter, sans-serif">
        www.bsdc.info.bd · Built by RRC Development
      </text>
    </svg>
  );
}

/** Standard ad-size promo banners. */
export const PROMO_BANNER_SIZES = [
  { label: 'Leaderboard', width: 728, height: 90 },
  { label: 'Medium Rectangle', width: 300, height: 250 },
  { label: 'Wide Skyscraper', width: 160, height: 600 },
  { label: 'Mobile Banner', width: 320, height: 50 },
  { label: 'Billboard', width: 970, height: 250 },
] as const;

export function SocialCoverRow({ lang }: { lang: 'en' | 'bn' }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[
        { label: 'Facebook / LinkedIn / X', width: 1200, height: 630 },
        { label: 'YouTube', width: 1540, height: 420 },
        { label: 'GitHub Profile', width: 1100, height: 400 },
      ].map((cfg) => (
        <figure key={cfg.label} className="overflow-hidden rounded-xl border border-surface-light-border dark:border-surface-dark-border">
          <BrandBanner width={cfg.width} height={cfg.height} lang={lang} />
          <figcaption className="bg-white px-3 py-2 text-xs font-semibold dark:bg-surface-dark-muted">
            {cfg.label} — {cfg.width}×{cfg.height}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export function PromoBannerSet({ lang }: { lang: 'en' | 'bn' }) {
  return (
    <div className="space-y-5">
      {PROMO_BANNER_SIZES.map((size) => (
        <figure key={size.label} className="mx-auto max-w-full" style={{ maxWidth: size.width }}>
          <div className="overflow-hidden rounded-xl border border-surface-light-border dark:border-surface-dark-border">
            <BrandBanner width={size.width} height={size.height} variant="promo" lang={lang} />
          </div>
          <figcaption className="mt-1.5 text-center text-xs font-semibold text-neutral-500">
            {size.label} — {size.width}×{size.height}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export { BsdcMark };
