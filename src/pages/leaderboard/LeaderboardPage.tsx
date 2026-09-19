/**
 * BSDC — src/pages/leaderboard/LeaderboardPage.tsx
 * Purpose : The public standing of the community, and your own place in it.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The board is public and indexable for the people who chose to appear on it; opting out
 *   is one switch on this screen and takes effect immediately rather than at the next recalculation.
 *   The viewer's own card sits above the board, because the number everybody looks for first is
 *   their own, and making them scroll to find it is the sort of small unkindness a leaderboard does
 *   not need.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Container, Heading, Skeleton, Text } from '@/shared/ui';
import type { LeaderboardWindow } from '@/core/config/points';
import { useSession } from '@/features/auth';
import { ignoreReadFailure } from '@/core/errors/ignore';
import { Leaderboard, LevelRing, PointsChip, StreakCard } from '@/features/gamification';
import {
  listLeaderboard,
  loadReputation,
  setLeaderboardOptOut,
} from '@/entities/reputation/repository';
import type { LeaderboardRow, Reputation } from '@/entities/reputation/model';

/**
 * Renders the leaderboard route.
 * @returns the leaderboard page
 */
export function LeaderboardPage(): React.ReactElement {
  const { t } = useTranslation('gamification');
  const { session, profile, locale } = useSession();
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const [rows, setRows] = useState<readonly LeaderboardRow[]>([]);
  const [window, setWindow] = useState<LeaderboardWindow>('all');
  const [loading, setLoading] = useState(true);

  const reload = useCallback((): void => {
    void listLeaderboard(window, session.uid ?? '')
      .then((next) => {
        setRows(next.rows);
        setLoading(false);
      })
      .catch(ignoreReadFailure);
  }, [window, session.uid]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const uid = session.uid;
    if (uid === null || uid.length === 0) {
      setReputation(null);
      return;
    }
    void loadReputation(uid).then(setReputation).catch(ignoreReadFailure);
  }, [session.uid]);

  const lang = locale === 'bn' ? 'bn' : 'en';

  return (
    <Container className="py-6">
      <header className="bsdc-page__head">
        <Heading level={1} size="xl" lang={lang}>
          {t('board.title')}
        </Heading>
        <Text as="p" tone="muted" lang={lang}>
          {t('board.subtitle')}
        </Text>
      </header>

      {reputation !== null ? (
        <section className="bsdc-leaderboardPage__own" aria-label={t('board.yourStanding')}>
          <LevelRing reputation={reputation} locale={locale} />
          <div className="bsdc-leaderboardPage__ownFacts">
            <PointsChip points={reputation.points} locale={locale} />
            <StreakCard reputation={reputation} locale={locale} />
          </div>
        </section>
      ) : null}

      {loading ? (
        <Skeleton height={480} />
      ) : (
        <Leaderboard
          rows={rows}
          window={window}
          onWindowChange={setWindow}
          locale={locale}
          optOut={reputation?.leaderboardOptOut ?? false}
          onOptOutChange={(optOut) => {
            const uid = session.uid;
            if (uid === null || uid.length === 0) return;
            void setLeaderboardOptOut(uid, optOut).then(() => {
              if (reputation !== null) setReputation({ ...reputation, leaderboardOptOut: optOut });
              reload();
            });
          }}
        />
      )}

      {profile === null ? (
        <Text as="p" size="sm" tone="muted" lang={lang}>
          {t('board.signInHint')}
        </Text>
      ) : null}
    </Container>
  );
}
