import { useTranslation } from 'react-i18next';
import { MediaImage } from '@/components/media/MediaImage';
import { useAdSlot } from '@/hooks/use-ads';
import type { AdPlacement } from '@/lib/ads/ads-types';
import { cn } from '@/lib/cn';
import { safeExternalUrl } from '@/lib/listings/listing-schema';

export interface AdSlotProps {
  placement: AdPlacement;
  className?: string;
}

/**
 * A paid placement, always labelled as one. The slot renders nothing at all
 * when there is no eligible ad — an empty box pretending to be content is
 * worse than no box.
 */
export function AdSlot({ placement, className }: AdSlotProps) {
  const { t } = useTranslation();
  const { ad, ref, onClick } = useAdSlot(placement);

  if (ad === null) return null;
  const href = safeExternalUrl(ad.targetUrl);
  if (href === null) return null;

  return (
    <aside
      ref={ref}
      aria-label={t('ads.slotLabel')}
      className={cn('rounded-card border border-border bg-surface-2 p-3', className)}
    >
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted">
        {t('ads.sponsored')}
      </p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow sponsored"
        onClick={onClick}
        className="mt-2 block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700"
      >
        {ad.imageUrl.length > 0 ? (
          <MediaImage
            src={ad.imageUrl}
            alt=""
            slotWidth={384}
            loading="lazy"
            decoding="async"
            className="mb-2 h-32 w-full rounded-card object-cover"
          />
        ) : null}
        <p className="font-semibold leading-snug">{ad.headline}</p>
        {ad.body.length > 0 ? <p className="mt-1 text-sm text-muted">{ad.body}</p> : null}
        <span className="mt-2 inline-block text-sm font-semibold text-green-700">
          {ad.ctaLabel.length > 0 ? ad.ctaLabel : t('ads.defaultCta')}
        </span>
      </a>
    </aside>
  );
}
