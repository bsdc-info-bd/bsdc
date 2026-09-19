/**
 * BSDC — src/features/gamification/StreakCard.tsx
 * Purpose : The daily-streak card, and the honest sentence about what a streak is worth.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A streak is measured in Bangladeshi days, because a day is a local idea and a person
 *   who visits at eleven at night and again after midnight has not missed anything. The card never
 *   uses guilt language: a broken streak is reported plainly, with the count it reached, rather than
 *   as a loss. Streaks are meant to be a reason to come back, not a thing to be afraid of losing.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Card, Icon, Progress, Text } from '@/shared/ui';
import type { Locale } from '@/core/config/app';
import { daysToNextStreakBonus, streakBonus } from '@/entities/reputation/model';
import type { Reputation } from '@/entities/reputation/model';

/** Props for the streak card. */
export interface StreakCardProps {
  readonly reputation: Reputation;
  readonly locale: Locale;
}

/**
 * Renders the streak card.
 * @param props component props
 * @returns the card element
 */
export function StreakCard({ reputation, locale }: StreakCardProps): React.ReactElement {
  const { t } = useTranslation('gamification');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const nextMilestone = daysToNextStreakBonus(reputation.streakDays);
  const bonus = streakBonus(reputation.streakDays);

  return (
    <Card as="section" className="bsdc-streak" padding="md">
      <div className="bsdc-streak__head">
        <Icon name="flame" size={20} />
        <Text as="p" size="lg" weight={700} lang={lang}>
          {t('streak.days', { count: reputation.streakDays })}
        </Text>
      </div>
      {nextMilestone === null ? (
        <Text as="p" size="sm" tone="muted" lang={lang}>
          {t('streak.maxed')}
        </Text>
      ) : (
        <>
          <Progress
            value={reputation.streakDays / (reputation.streakDays + nextMilestone)}
            label={t('streak.progressLabel', { days: nextMilestone })}
          />
          <Text as="p" size="sm" tone="muted" lang={lang}>
            {t('streak.nextBonus', { days: nextMilestone })}
          </Text>
        </>
      )}
      {bonus > 0 ? (
        <Text as="p" size="sm" lang={lang}>
          {t('streak.bonusAwarded', { points: bonus })}
        </Text>
      ) : null}
      <Text as="p" size="xs" tone="muted" lang={lang}>
        {t('streak.explainer')}
      </Text>
    </Card>
  );
}
