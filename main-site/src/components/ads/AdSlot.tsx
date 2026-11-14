import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { MediaImage } from '@/components/media/MediaImage';
import { useAdSlot } from '@/hooks/use-ads';
import type { AdLayout, AdPlacement } from '@/lib/ads/ads-types';
import { cn } from '@/lib/cn';
import { safeExternalUrl } from '@/lib/listings/listing-schema';

export interface AdSlotProps {
  placement: AdPlacement;
  topic?: string | undefined;
  city?: string | undefined;
  className?: string;
}

function validAccent(raw?: string): string | undefined {
  const value = raw?.trim() ?? '';
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : undefined;
}

/**
 * A paid placement, always labelled as sponsored. Renders nothing when no
 * eligible campaign creative matches the slot, platform, and targeting.
 */
export function AdSlot({ placement, topic, city, className }: AdSlotProps) {
  const { t } = useTranslation();
  const { ad, ref, onClick } = useAdSlot(placement, { topic, city });

  if (ad === null) return null;
  const href = safeExternalUrl(ad.targetUrl);
  if (href === null || !href.startsWith('https://')) return null;

  const layout: AdLayout = ad.layout ?? 'card';
  const accent = validAccent(ad.accentColor);
  const accentBorderStyle: CSSProperties | undefined = accent ? { borderColor: accent } : undefined;
  const ctaStyle: CSSProperties | undefined = accent
    ? { backgroundColor: accent, color: '#ffffff' }
    : undefined;
  const mediaAlt = ad.imageAlt?.trim() || ad.headline;
  const ctaText = ad.ctaLabel.length > 0 ? ad.ctaLabel : t('ads.defaultCta');
  const hasImage = ad.imageUrl.length > 0;
  const customBadge = ad.badgeLabel?.trim() ?? '';

  return (
    <aside
      ref={ref}
      aria-label={t('ads.slotLabel')}
      style={accentBorderStyle}
      className={cn(
        'rounded-card border border-border bg-surface-2 p-3 transition-colors duration-150',
        layout === 'native' && 'bg-surface shadow-sm',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <span>{t('ads.sponsored')}</span>
        {customBadge.length > 0 ? (
          <span className="rounded bg-surface px-1.5 py-0.5 text-xs font-medium normal-case text-foreground">
            {customBadge}
          </span>
        ) : null}
      </div>

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow sponsored"
        onClick={onClick}
        className={cn(
          'mt-2 block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700',
          layout === 'compact' && hasImage && 'flex items-center gap-3',
          layout === 'banner' && hasImage && 'flex flex-col gap-3 sm:flex-row sm:items-center',
        )}
      >
        {hasImage ? (
          <MediaImage
            src={ad.imageUrl}
            variantSrc={ad.thumbUrl ?? ''}
            alt={mediaAlt}
            slotWidth={layout === 'compact' ? 80 : layout === 'banner' ? 280 : 480}
            loading="lazy"
            decoding="async"
            className={cn(
              'rounded-card object-cover',
              layout === 'compact' && 'h-16 w-16 shrink-0',
              layout === 'banner' && 'h-32 w-full shrink-0 sm:h-28 sm:w-48',
              layout === 'card' && 'mb-2 h-36 w-full',
              layout === 'native' && 'mb-3 aspect-video w-full',
            )}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug text-foreground">{ad.headline}</p>
          {ad.body.length > 0 ? (
            <p className={cn('mt-1 text-sm text-muted', layout === 'compact' && 'line-clamp-2')}>
              {ad.body}
            </p>
          ) : null}
          <span
            style={ctaStyle}
            className={cn(
              'mt-2 inline-block text-sm font-semibold',
              accent ? 'rounded-lg px-3 py-1' : 'text-green-700',
            )}
          >
            {ctaText}
          </span>
        </div>
      </a>
    </aside>
  );
}
