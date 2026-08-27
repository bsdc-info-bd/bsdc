import { cn } from '@/lib/utils';

/**
 * BSDC mark: two code brackets (green/blue — the brand palette) joined by
 * a community node. Custom SVG per brief §1 — no emoji, no icon-font
 * dependency for brand assets.
 */
export function BsdcLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-hidden="true" className={cn('shrink-0', className)}>
      <rect width="64" height="64" rx="14" fill="#0D1526" />
      <path
        d="M26 20 14 32l12 12"
        fill="none"
        stroke="#12B76A"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M38 20l12 12-12 12"
        fill="none"
        stroke="#4F6BEC"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="32" r="3.5" fill="#F8FAFC" />
    </svg>
  );
}
