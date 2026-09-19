/**
 * BSDC — src/features/market/MarketGrid.tsx
 * Purpose : The public marketplace: every service a member sells, with the price they charge.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Prices are shown, never hidden behind "contact for a quote": a person comparing four
 *   developers should not have to start four conversations to find out that three of them are out
 *   of reach. Every card is a real link-shaped control that opens the full listing, and the grid is
 *   `auto-fit` with a minimum so it is one column at 250px and six at 5120px without a breakpoint
 *   guessing at a device.
 *   Past the virtualisation threshold the grid becomes a windowed list, because a marketplace with
 *   two hundred gigs must not mount two hundred covers.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import {
  Button,
  Chip,
  ChipRail,
  EmptyState,
  FeedSkeleton,
  Input,
  Select,
  Text,
  VirtualList,
} from '@/shared/ui';
import { FEED_BUDGETS } from '@/core/config/limits';
import { formatCurrency } from '@/shared/lib/number.bn';
import type { Locale } from '@/core/config/app';
import { GIG_CATEGORIES, GIG_CATEGORY_LABELS, type GigCategory } from '@/core/config/opportunities';
import type { Gig } from '@/entities/gig/model';
import { GigCard } from '@/features/freelancer';
import { MARKET_SORTS, type MarketSort, type UseMarketResult } from './useMarket';

/** Price ceilings offered as quick filters, in BDT. */
export const PRICE_CEILINGS = [2000, 5000, 15000, 50000] as const;

/** Props for the marketplace grid. */
export interface MarketGridProps {
  readonly locale: Locale;
  readonly market: UseMarketResult;
  readonly onOpen: (gig: Gig) => void;
}

/**
 * Renders the marketplace: filters, count and the gigs themselves.
 * @param props component props
 * @returns the marketplace element
 */
export function MarketGrid({ locale, market, onOpen }: MarketGridProps): React.ReactElement {
  const { t } = useTranslation('market');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const bn = locale === 'bn';

  if (market.loading) {
    return (
      <div className="bsdc-market__loading" aria-busy="true">
        <FeedSkeleton count={3} />
      </div>
    );
  }

  return (
    <div className="bsdc-market">
      <div className="bsdc-market__filters">
        <Input
          type="search"
          value={market.query}
          onChange={(event) => market.setQuery(event.target.value)}
          label={t('searchLabel')}
          placeholder={t('searchPlaceholder')}
          className="bsdc-market__search"
        />
        <Select<MarketSort>
          value={market.sort}
          onValueChange={market.setSort}
          label={t('sortLabel')}
          options={MARKET_SORTS.map((option) => ({
            value: option,
            label: t(`sort.${option}`),
          }))}
          className="bsdc-market__sort"
        />
      </div>

      <ChipRail label={t('categoryLabel')}>
        <Chip selected={market.category === null} onToggle={() => market.setCategory(null)}>
          {t('category.all')}
        </Chip>
        {GIG_CATEGORIES.map((category: GigCategory) => (
          <Chip
            key={category}
            selected={market.category === category}
            onToggle={() => market.setCategory(market.category === category ? null : category)}
          >
            {GIG_CATEGORY_LABELS[category][bn ? 'bn' : 'en']}
          </Chip>
        ))}
      </ChipRail>

      <ChipRail label={t('priceLabel')}>
        <Chip selected={market.ceiling === null} onToggle={() => market.setCeiling(null)}>
          {t('price.any')}
        </Chip>
        {PRICE_CEILINGS.map((ceiling) => (
          <Chip
            key={ceiling}
            selected={market.ceiling === ceiling}
            onToggle={() => market.setCeiling(market.ceiling === ceiling ? null : ceiling)}
          >
            {t('price.upTo', { amount: formatCurrency(ceiling, locale, false) })}
          </Chip>
        ))}
      </ChipRail>

      <div className="bsdc-market__meta">
        <Text as="p" size="sm" tone="muted" lang={lang}>
          {t('count', { count: market.gigs.length })}
        </Text>
        <Button type="button" variant="link" size="sm" onClick={market.reset}>
          {t('reset')}
        </Button>
      </div>

      {market.gigs.length === 0 ? (
        <EmptyState
          illustration="empty-state"
          title={t('emptyTitle')}
          description={t('emptyBody')}
          action={
            <Button type="button" variant="secondary" size="sm" onClick={market.reset}>
              {t('reset')}
            </Button>
          }
        />
      ) : market.gigs.length > FEED_BUDGETS.virtualizationThreshold ? (
        <VirtualList
          className="bsdc-market__list"
          items={market.gigs}
          itemHeight={300}
          height={720}
          label={t('listLabel')}
          renderItem={(gig) => <GigCard gig={gig} locale={locale} onOpen={onOpen} />}
        />
      ) : (
        <ul className="bsdc-market__grid">
          {market.gigs.map((gig) => (
            <li key={gig.id}>
              <GigCard gig={gig} locale={locale} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}

      <Text as="p" size="sm" tone="muted" lang={lang}>
        {t('sourceNote', {
          source: market.source === 'remote' ? t('sourceServer') : t('sourceDevice'),
        })}
      </Text>
    </div>
  );
}
