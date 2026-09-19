/**
 * BSDC — src/features/freelancer/GigList.tsx
 * Purpose : The freelancer directory, with the categories that matter to this community.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Sorted by rating first and recency second, because a hub that ranks by who joined
 *   first rewards tenure over quality. A gig with no reviews is not punished for it — it is placed
 *   after the rated ones but shown as new rather than hidden, since everybody starts somewhere.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Chip, ChipRail, EmptyState, Text, VirtualList } from '@/shared/ui';
import { FEED_BUDGETS } from '@/core/config/limits';
import type { Locale } from '@/core/config/app';
import { GIG_CATEGORIES, GIG_CATEGORY_LABELS, type GigCategory } from '@/core/config/opportunities';
import { averageRating, type Gig } from '@/entities/gig/model';
import { GigCard } from './GigCard';

/** Props for the gig list. */
export interface GigListProps {
  readonly gigs: readonly Gig[];
  readonly locale: Locale;
  readonly activeCategory: GigCategory | null;
  readonly onCategoryChange: (category: GigCategory | null) => void;
  readonly onOpen: (gig: Gig) => void;
  readonly height?: (number | string) | undefined;
}

/**
 * Renders the freelancer directory.
 * @param props component props
 * @returns the list element
 */
export function GigList({
  gigs,
  locale,
  activeCategory,
  onCategoryChange,
  onOpen,
  height = 720,
}: GigListProps): React.ReactElement {
  const { t } = useTranslation('freelancer');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const bn = locale === 'bn';

  const ordered = [...gigs].sort((left, right) => {
    const leftRating = averageRating(left);
    const rightRating = averageRating(right);
    if (leftRating !== rightRating) return rightRating - leftRating;
    if (left.completedOrders !== right.completedOrders) {
      return right.completedOrders - left.completedOrders;
    }
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });

  if (ordered.length === 0) {
    return (
      <EmptyState
        illustration="empty-state"
        title={t('list.empty.title')}
        description={t('list.empty.description')}
        lang={lang}
      />
    );
  }

  return (
    <div className="bsdc-gigList">
      <ChipRail label={t('list.filterLabel')}>
        <Chip selected={activeCategory === null} onToggle={() => onCategoryChange(null)}>
          {t('list.all')}
        </Chip>
        {GIG_CATEGORIES.map((category) => (
          <Chip
            key={category}
            selected={activeCategory === category}
            onToggle={() => onCategoryChange(activeCategory === category ? null : category)}
          >
            {GIG_CATEGORY_LABELS[category][bn ? 'bn' : 'en']}
          </Chip>
        ))}
      </ChipRail>
      <Text as="p" size="sm" tone="muted" lang={lang}>
        {t('list.count', { count: ordered.length })}
      </Text>
      {ordered.length > FEED_BUDGETS.virtualizationThreshold ? (
        <VirtualList
          items={ordered}
          itemHeight={300}
          height={height}
          label={t('list.label')}
          renderItem={(gig) => <GigCard gig={gig} locale={locale} onOpen={onOpen} />}
        />
      ) : (
        <ul className="bsdc-gigList__grid">
          {ordered.map((gig) => (
            <li key={gig.id}>
              <GigCard gig={gig} locale={locale} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
