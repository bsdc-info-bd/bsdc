/**
 * BSDC — src/features/gamification/Leaderboard.tsx
 * Purpose : The public standing of the community, one window at a time.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Appearing here is opt-in, and the control is on the same screen as the board rather
 *   than buried in settings: a leaderboard somebody cannot leave is not a choice. Ties share a rank
 *   rather than being broken arbitrarily, so two people with four hundred points are both fourth and
 *   the next person is sixth — the alternative is inventing a tie-breaker and pretending it means
 *   something.
 *   The viewer's own row is highlighted even when it is off the top of the board, because the
 *   question everybody actually has is "where am I".
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, EmptyState, Switch, Tabs, Text, VirtualList } from '@/shared/ui';
import { LEADERBOARD_WINDOWS, type LeaderboardWindow } from '@/core/config/points';
import type { Locale } from '@/core/config/app';
import type { LeaderboardRow } from '@/entities/reputation/model';

/** Props for the leaderboard. */
export interface LeaderboardProps {
  readonly rows: readonly LeaderboardRow[];
  readonly window: LeaderboardWindow;
  readonly onWindowChange: (next: LeaderboardWindow) => void;
  readonly locale: Locale;
  readonly optOut: boolean;
  readonly onOptOutChange: (optOut: boolean) => void;
  readonly height?: (number | string) | undefined;
}

/**
 * Renders the leaderboard.
 * @param props component props
 * @returns the leaderboard element
 */
export function Leaderboard({
  rows,
  window,
  onWindowChange,
  locale,
  optOut,
  onOptOutChange,
  height = 640,
}: LeaderboardProps): React.ReactElement {
  const { t } = useTranslation('gamification');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const viewerRow = rows.find((row) => row.isViewer);

  return (
    <section className="bsdc-leaderboard" aria-label={t('board.label')}>
      <Tabs
        label={t('board.windowLabel')}
        value={window}
        onValueChange={(next) => onWindowChange(next as LeaderboardWindow)}
        items={LEADERBOARD_WINDOWS.map((entry) => ({
          value: entry,
          label: t(`board.window.${entry}`),
          content: null,
        }))}
      />

      <div className="bsdc-leaderboard__optOut">
        <Switch checked={optOut} onCheckedChange={onOptOutChange} label={t('board.optOut')} />
        <Text as="p" size="xs" tone="muted" lang={lang}>
          {t('board.optOutHint')}
        </Text>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          illustration="empty-state"
          title={t('board.empty.title')}
          description={t('board.empty.description')}
          lang={lang}
        />
      ) : rows.length > 100 ? (
        <VirtualList
          items={rows}
          itemHeight={64}
          height={height}
          label={t('board.label')}
          renderItem={(row) => <LeaderboardRowView row={row} locale={locale} window={window} />}
        />
      ) : (
        <ol className="bsdc-leaderboard__list">
          {rows.map((row) => (
            <li key={row.uid}>
              <LeaderboardRowView row={row} locale={locale} window={window} />
            </li>
          ))}
        </ol>
      )}

      {viewerRow !== undefined && viewerRow.rank > rows.length ? (
        <p className="bsdc-leaderboard__own" lang={lang}>
          {t('board.yourRank', { rank: viewerRow.rank })}
        </p>
      ) : null}
    </section>
  );
}

/** Props for one row. */
interface RowProps {
  readonly row: LeaderboardRow;
  readonly locale: Locale;
  readonly window: LeaderboardWindow;
}

/**
 * Renders one leaderboard row.
 * @param props component props
 * @returns the row element
 */
function LeaderboardRowView({ row, locale, window }: RowProps): React.ReactElement {
  const { t } = useTranslation('gamification');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const name =
    locale === 'bn' && row.displayNameBn.length > 0 ? row.displayNameBn : row.displayName;

  return (
    <article className="bsdc-leaderboard__row" data-viewer={row.isViewer ? 'true' : 'false'}>
      <span className="bsdc-leaderboard__rank" lang={lang}>
        {String(row.rank)}
      </span>
      <Avatar
        name={name}
        src={row.photoUrl.length > 0 ? row.photoUrl : null}
        size="sm"
        decorative
      />
      <span className="bsdc-leaderboard__name" lang={lang}>
        {name}
        <Text as="span" size="xs" tone="muted" lang="en">
          @{row.username}
        </Text>
      </span>
      <span className="bsdc-leaderboard__level">
        <Badge tone="brand" variant="outline">
          {t('board.level', { level: row.level })}
        </Badge>
      </span>
      <span className="bsdc-leaderboard__points" lang={lang}>
        {window === 'all'
          ? row.points.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')
          : String(row.points)}
      </span>
    </article>
  );
}
