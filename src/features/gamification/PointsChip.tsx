/**
 * BSDC — src/features/gamification/PointsChip.tsx
 * Purpose : One line saying what a person's contributions are worth here.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Points are described, not sold. The chip carries a title that explains where they come
 *   from and where they go, because a number with no explanation invites a person to game it, and
 *   a number they can game is a number that stops meaning anything.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Icon, Text } from '@/shared/ui';
import type { Locale } from '@/core/config/app';

/** Props for the points chip. */
export interface PointsChipProps {
  readonly points: number;
  readonly locale: Locale;
  /** Renders the digits in Bengali numerals when true. */
  readonly banglaNumerals?: boolean | undefined;
}

/**
 * Renders a points chip.
 * @param props component props
 * @returns the chip element
 */
export function PointsChip({
  points,
  locale,
  banglaNumerals = true,
}: PointsChipProps): React.ReactElement {
  const { t } = useTranslation('gamification');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const useBnDigits = banglaNumerals && locale === 'bn';

  return (
    <span className="bsdc-points" title={t('points.explainer')} lang={lang}>
      <Icon name="sparkles" size={14} />
      <Text as="span" size="sm" weight={600} numeric={useBnDigits} lang={lang}>
        {String(points)}
      </Text>
      <Text as="span" size="xs" tone="muted" lang={lang}>
        {t('points.unit')}
      </Text>
    </span>
  );
}
