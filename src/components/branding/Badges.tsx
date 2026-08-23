/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { cn } from '@/lib/utils';
import type { BadgeVariant } from './badgeData';

export function BsdcBadge({
  variant,
  size = 64,
  className,
}: {
  variant: BadgeVariant;
  size?: number;
  className?: string;
}) {
  const Icon = variant.icon;
  return (
    <span
      className={cn('inline-flex flex-col items-center gap-1.5', className)}
      role="img"
      aria-label={`${variant.label} badge — ${variant.description}`}
    >
      <span
        className="flex items-center justify-center rounded-full ring-4 ring-white shadow-md dark:ring-surface-dark"
        style={{ width: size, height: size, background: `${variant.color}18`, color: variant.color }}
      >
        <Icon style={{ width: size * 0.45, height: size * 0.45 }} aria-hidden />
      </span>
      <span className="text-center">
        <span className="block text-xs font-bold">{variant.label}</span>
        <span className="block max-w-28 text-[10px] leading-tight text-neutral-500 dark:text-neutral-400">{variant.description}</span>
      </span>
    </span>
  );
}

export function BadgeWall({ variants, size }: { variants: BadgeVariant[]; size?: number }) {
  return (
    <div className="flex flex-wrap gap-5">
      {variants.map((v) => (
        <BsdcBadge key={v.id} variant={v} size={size} />
      ))}
    </div>
  );
}


