/**
 * BSDC — src/features/freelancer/GigCard.tsx
 * Purpose : One service someone sells, with the price they actually charge.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The card shows the entry price of the cheapest package, not "from" with no number — a
 *   marketplace that hides prices until you ask is a marketplace that wastes both sides' time.
 *   An unrated gig says it is new rather than showing five empty stars, because zero reviews and a
 *   bad review are very different things and the card should not blur them together.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Card, Icon, Text } from '@/shared/ui';
import { GIG_CATEGORY_LABELS } from '@/core/config/opportunities';
import type { Locale } from '@/core/config/app';
import { averageRating, startingPrice, type Gig } from '@/entities/gig/model';

/** Props for the gig card. */
export interface GigCardProps {
  readonly gig: Gig;
  readonly locale: Locale;
  readonly onOpen: (gig: Gig) => void;
}

/**
 * Renders a gig card.
 * @param props component props
 * @returns the card element
 */
export function GigCard({ gig, locale, onOpen }: GigCardProps): React.ReactElement {
  const { t } = useTranslation('freelancer');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const bn = locale === 'bn';
  const rating = averageRating(gig);
  const price = startingPrice(gig);

  return (
    <Card as="article" className="bsdc-gigCard" onPress={() => onOpen(gig)}>
      {gig.coverUrl.length > 0 ? (
        <img
          className="bsdc-gigCard__cover"
          src={gig.coverUrl}
          alt=""
          width={480}
          height={270}
          loading="lazy"
          decoding="async"
        />
      ) : null}
      <div className="bsdc-gigCard__body">
        <div className="bsdc-gigCard__seller">
          <Avatar name={gig.freelancerName} src={gig.freelancerPhotoUrl} size="sm" decorative />
          <span lang={lang}>{gig.freelancerName}</span>
        </div>
        <h3 className="bsdc-gigCard__title" lang={lang}>
          {gig.title}
        </h3>
        <Badge tone="neutral" variant="outline">
          {GIG_CATEGORY_LABELS[gig.category][bn ? 'bn' : 'en']}
        </Badge>
        <div className="bsdc-gigCard__foot">
          <span className="bsdc-gigCard__rating">
            <Icon name="star" size={14} />
            {rating > 0 ? (
              <span lang={lang}>{rating.toFixed(1)}</span>
            ) : (
              <Text as="span" size="sm" tone="muted" lang={lang}>
                {t('card.new')}
              </Text>
            )}
            {gig.ratingCount > 0 ? (
              <Text as="span" size="sm" tone="muted" lang={lang}>
                ({String(gig.ratingCount)})
              </Text>
            ) : null}
          </span>
          <span className="bsdc-gigCard__price" lang={lang}>
            {t('card.from', { price: price.toLocaleString(bn ? 'bn-BD' : 'en-US') })}
          </span>
        </div>
      </div>
    </Card>
  );
}
