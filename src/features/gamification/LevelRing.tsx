/**
 * BSDC — src/features/gamification/LevelRing.tsx
 * Purpose : Where somebody stands on the ladder, and how far the next rung is.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The ring shows progress through the current level, not progress towards an imaginary
 *   maximum, and the accessible name states both the level and the percentage rather than leaving a
 *   screen-reader user with an unlabelled arc. At the top of the ladder the ring is full and the
 *   caption says so instead of promising a level the ladder does not have.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { ProgressRing, Text } from '@/shared/ui';
import { MAX_LEVEL } from '@/core/config/points';
import type { Locale } from '@/core/config/app';
import { levelPercentage, pointsToNextLevel } from '@/entities/reputation/model';
import type { Reputation } from '@/entities/reputation/model';

/** Props for the level ring. */
export interface LevelRingProps {
  readonly reputation: Reputation;
  readonly locale: Locale;
  readonly size?: number | undefined;
}

/**
 * Renders the level ring.
 * @param props component props
 * @returns the ring element
 */
export function LevelRing({ reputation, locale, size = 96 }: LevelRingProps): React.ReactElement {
  const { t } = useTranslation('gamification');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const percent = levelPercentage(reputation);
  const remaining = pointsToNextLevel(reputation);

  return (
    <div className="bsdc-level" lang={lang}>
      <ProgressRing
        value={percent / 100}
        size={size}
        tone="brand"
        showValue
        banglaNumerals={locale === 'bn'}
        label={t('level.ringLabel', { level: reputation.level, percent })}
      />
      <Text as="p" size="sm" weight={600} lang={lang}>
        {t('level.label', { level: reputation.level })}
      </Text>
      <Text as="p" size="xs" tone="muted" lang={lang}>
        {remaining === null
          ? t('level.maxed')
          : t('level.remaining', { points: remaining, next: reputation.level + 1 })}
      </Text>
      {reputation.level >= MAX_LEVEL ? null : null}
    </div>
  );
}
