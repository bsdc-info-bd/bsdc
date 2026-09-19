/**
 * BSDC — src/features/market/GigDetailSheet.tsx
 * Purpose : One listing, opened: what it is, what it costs, who sells it, and how to buy it.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every package is spelled out with its price, delivery time and revision count. A
 *   marketplace that lets a buyer discover the revision policy after paying is a marketplace that
 *   manufactures disputes.
 *   Ordering is gated by identity, not by a disabled button: a signed-out visitor is shown the
 *   sign-in surface inside the sheet, so the listing they were reading is still there afterwards.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, Sheet, Text } from '@/shared/ui';
import { formatCurrency } from '@/shared/lib/number.bn';
import type { Locale } from '@/core/config/app';
import { GIG_CATEGORY_LABELS } from '@/core/config/opportunities';
import { averageRating, type Gig, type GigOrder } from '@/entities/gig/model';
import { OrderDialog } from '@/features/freelancer';
import { SignInCard } from '@/features/auth';
import { SaveButton, useSavedItems } from '@/features/saved';
import { formatDate } from '@/shared/lib/date';

/** Props for the gig sheet. */
export interface GigDetailSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly gig: Gig | null;
  readonly locale: Locale;
  /** Signed-in account id, or null for a visitor. */
  readonly uid: string | null;
  readonly buyerName: string;
  readonly onOrdered: (order: GigOrder) => void;
}

/**
 * Renders one listing in a side sheet.
 * @param props component props
 * @returns the sheet element
 */
export function GigDetailSheet({
  open,
  onOpenChange,
  gig,
  locale,
  uid,
  buyerName,
  onOrdered,
}: GigDetailSheetProps): React.ReactElement | null {
  const { t } = useTranslation('market');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const [ordering, setOrdering] = useState(false);
  const saved = useSavedItems(uid);

  if (gig === null) return null;

  const rating = averageRating(gig);
  const savedNow = saved.isSaved('gig', gig.id);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={gig.title}
      description={t('sheetDescription', { seller: gig.freelancerName })}
    >
      <div className="bsdc-gigSheet">
        <div className="bsdc-gigSheet__seller">
          <Avatar name={gig.freelancerName} src={gig.freelancerPhotoUrl} size="md" decorative />
          <div>
            <p className="bsdc-gigSheet__name" lang={lang}>
              {gig.freelancerName}
            </p>
            <Text as="p" size="sm" tone="muted" lang={lang}>
              {t('memberSince', { date: formatDate(gig.createdAt, locale) })}
            </Text>
          </div>
          <SaveButton
            uid={uid}
            locale={locale}
            kind="gig"
            entityId={gig.id}
            title={gig.title}
            titleLang={locale}
            subtitle={gig.freelancerName}
            href={`/market?gig=${gig.id}`}
            saved={savedNow}
            onToggle={(input) => {
              void saved.toggle(input);
            }}
            variant="outline"
            withLabel
          />
        </div>

        <div className="bsdc-gigSheet__facts">
          <Badge tone="neutral" variant="outline">
            {GIG_CATEGORY_LABELS[gig.category][locale === 'bn' ? 'bn' : 'en']}
          </Badge>
          {rating > 0 ? (
            <Badge tone="success" variant="outline">
              {t('rating', { value: rating.toFixed(1), count: gig.ratingCount })}
            </Badge>
          ) : (
            <Badge tone="neutral" variant="outline">
              {t('newListing')}
            </Badge>
          )}
          <Badge tone="neutral" variant="outline">
            {t('delivered', { count: gig.completedOrders })}
          </Badge>
        </div>

        <p className="bsdc-gigSheet__body" lang={lang}>
          {gig.description}
        </p>

        {gig.skills.length > 0 ? (
          <ul className="bsdc-gigSheet__skills" aria-label={t('skillsLabel')}>
            {gig.skills.map((skill) => (
              <li key={skill} lang={lang}>
                {skill}
              </li>
            ))}
          </ul>
        ) : null}

        <h3 className="bsdc-gigSheet__packagesTitle" lang={lang}>
          {t('packagesTitle')}
        </h3>
        <ul className="bsdc-gigSheet__packages">
          {gig.packages.map((pack) => (
            <li key={pack.name} className="bsdc-gigSheet__package">
              <div className="bsdc-gigSheet__packageHead">
                <span lang={lang}>{pack.name}</span>
                <strong lang={lang}>{formatCurrency(pack.priceBdt, locale)}</strong>
              </div>
              <p className="bsdc-gigSheet__packageBody" lang={lang}>
                {pack.description}
              </p>
              <Text as="p" size="sm" tone="muted" lang={lang}>
                {t('packageTerms', { days: pack.deliveryDays, revisions: pack.revisions })}
              </Text>
            </li>
          ))}
        </ul>

        <div className="bsdc-gigSheet__order">
          {uid === null ? (
            <SignInCard reason="default" />
          ) : (
            <>
              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={gig.packages.length === 0}
                onClick={() => setOrdering(true)}
              >
                {t('order')}
              </Button>
              <OrderDialog
                open={ordering}
                onOpenChange={setOrdering}
                gig={gig}
                buyerUid={uid}
                buyerName={buyerName}
                locale={locale}
                onPlaced={(order) => {
                  setOrdering(false);
                  onOrdered(order);
                }}
              />
            </>
          )}
        </div>

        <Text as="p" size="sm" tone="muted" lang={lang}>
          {t('escrowNote')}
        </Text>
      </div>
    </Sheet>
  );
}
