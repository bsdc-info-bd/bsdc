/**
 * BSDC — src/features/gamification/BadgeShelf.tsx
 * Purpose : The badges somebody has earned, and the ones still within reach.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Locked badges are shown with their requirement rather than hidden. A shelf with three
 *   things on it and no hint of what else exists is a dead end; a shelf that says "fifty posts"
 *   turns into a reason to write. Each badge carries its criterion in both languages, because a
 *   goal you cannot read is not a goal.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Badge, Icon, Text } from '@/shared/ui';
import { BADGES, type BadgeDefinition, type BadgeTier } from '@/core/config/points';
import type { Locale } from '@/core/config/app';

/** Tone used to paint each tier. */
const TIER_TONE: Readonly<Record<BadgeTier, 'neutral' | 'brand' | 'warning' | 'success'>> = {
  bronze: 'neutral',
  silver: 'brand',
  gold: 'warning',
  platinum: 'success',
};

/** Props for the badge shelf. */
export interface BadgeShelfProps {
  /** Badge ids the person has earned. */
  readonly earnedIds: readonly string[];
  readonly locale: Locale;
  /** Counters used to show how far a locked badge is away. */
  readonly counters: Readonly<Record<BadgeDefinition['metric'], number>>;
}

/**
 * Renders the badge shelf.
 * @param props component props
 * @returns the shelf element
 */
export function BadgeShelf({ earnedIds, locale, counters }: BadgeShelfProps): React.ReactElement {
  const { t } = useTranslation('gamification');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const bn = locale === 'bn';
  const earned = new Set(earnedIds);

  return (
    <ul className="bsdc-badges" aria-label={t('badges.label')}>
      {BADGES.map((badge) => {
        const held = earned.has(badge.id);
        const progress = counters[badge.metric];
        return (
          <li
            key={badge.id}
            className="bsdc-badges__item"
            data-held={held ? 'true' : 'false'}
            data-tier={badge.tier}
          >
            <span className="bsdc-badges__icon" aria-hidden="true">
              <Icon name={held ? 'trophy' : 'target'} size={20} />
            </span>
            <span className="bsdc-badges__text">
              <Text as="span" size="sm" weight={600} lang={lang}>
                {bn ? badge.labelBn : badge.labelEn}
              </Text>
              <Text as="span" size="xs" tone="muted" lang={lang}>
                {bn ? badge.descriptionBn : badge.descriptionEn}
              </Text>
              {!held ? (
                <Text as="span" size="xs" tone="muted" lang={lang}>
                  {t('badges.progress', { have: progress, need: badge.threshold })}
                </Text>
              ) : null}
            </span>
            <Badge tone={TIER_TONE[badge.tier]} variant="outline">
              {t(`badges.tier.${badge.tier}`)}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
