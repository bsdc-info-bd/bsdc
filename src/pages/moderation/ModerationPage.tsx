/**
 * BSDC — src/pages/moderation/ModerationPage.tsx
 * Purpose : The reviewer's screen, and the reporter's own track record.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Two views behind one route, chosen by entitlement rather than by a tab anybody can
 *   click: staff see the queue, everybody else sees the reports they filed and the appeals that are
 *   open to them. The rules refuse the queue read for a non-staff account anyway, so the tab is a
 *   convenience, never the control.
 *   The screen states the response target the community is entitled to, because a moderation tool
 *   that hides its own standards is a tool its operators cannot be held to.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Container, EmptyState, Heading, Skeleton, Tabs, Text } from '@/shared/ui';
import type { ReportState } from '@/core/config/moderation';
import { useSession } from '@/features/auth';
import { ignoreReadFailure } from '@/core/errors/ignore';
import { ModerationQueue } from '@/features/moderation';
import {
  listAppeals,
  listMyReports,
  listQueue,
  watchQueue,
} from '@/entities/moderation/repository';
import type { Appeal, Report } from '@/entities/moderation/model';
import { countByState } from '@/entities/moderation/model';

/**
 * Renders the moderation route.
 * @returns the moderation page
 */
export function ModerationPage(): React.ReactElement {
  const { t } = useTranslation('moderation');
  const { session, profile, locale } = useSession();
  const [reports, setReports] = useState<readonly Report[]>([]);
  const [mine, setMine] = useState<readonly Report[]>([]);
  const [appeals, setAppeals] = useState<readonly Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<ReportState | null>(null);

  const isStaff =
    profile !== null &&
    (profile.role === 'support' ||
      profile.role === 'moderator' ||
      profile.role === 'admin' ||
      profile.role === 'root');
  const reviewerRole =
    profile?.role === 'root'
      ? 'root'
      : profile?.role === 'admin'
        ? 'admin'
        : profile?.role === 'moderator'
          ? 'moderator'
          : 'support';

  const reloadMine = useCallback((): void => {
    const uid = session.uid;
    if (uid === null || uid.length === 0) return;
    void listMyReports(uid).then(setMine).catch(ignoreReadFailure);
  }, [session.uid]);

  useEffect(() => {
    if (!isStaff) {
      setLoading(false);
      reloadMine();
      return;
    }
    void listQueue()
      .then((next) => {
        setReports(next);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
    const release = watchQueue(setReports);
    return release;
  }, [isStaff, reloadMine]);

  useEffect(() => {
    const uid = session.uid;
    if (uid === null || uid.length === 0) return;
    void listMyReports(uid).then(async (own) => {
      setMine(own);
      const decided = own.filter(
        (report) => report.state === 'actioned' || report.state === 'dismissed',
      );
      const found = await Promise.all(decided.map((report) => listAppeals(report.id)));
      setAppeals(found.flat());
    });
  }, [session.uid]);

  const lang = locale === 'bn' ? 'bn' : 'en';
  const counts = countByState(mine);

  return (
    <Container className="py-6">
      <header className="bsdc-page__head">
        <Heading level={1} size="xl" lang={lang}>
          {isStaff ? t('queue.title') : t('mine.title')}
        </Heading>
        <Text as="p" tone="muted" lang={lang}>
          {isStaff ? t('queue.subtitle') : t('mine.subtitle')}
        </Text>
      </header>

      {loading ? (
        <Skeleton height={420} />
      ) : isStaff ? (
        <ModerationQueue
          reports={reports}
          locale={locale}
          reviewerUid={session.uid ?? ''}
          reviewerRole={reviewerRole}
          activeState={state}
          onStateChange={setState}
          onDecided={() => {
            void listQueue().then(setReports).catch(ignoreReadFailure);
          }}
        />
      ) : (
        <Tabs
          label={t('mine.tabs.label')}
          defaultValue="reports"
          items={[
            {
              value: 'reports',
              label: t('mine.tabs.reports'),
              content:
                mine.length === 0 ? (
                  <EmptyState
                    illustration="empty-state"
                    title={t('mine.empty.title')}
                    description={t('mine.empty.description')}
                    lang={lang}
                  />
                ) : (
                  <ul className="bsdc-moderation__own">
                    {mine.map((report) => (
                      <li key={report.id} className="bsdc-moderation__ownItem">
                        <Text as="p" size="sm" lang={lang}>
                          {t(`category.${report.category}`)} · {t(`state.${report.state}`)}
                        </Text>
                        <Text as="p" size="xs" tone="muted" lang={lang}>
                          {report.reasonText}
                        </Text>
                      </li>
                    ))}
                  </ul>
                ),
            },
            {
              value: 'appeals',
              label: t('mine.tabs.appeals'),
              content:
                appeals.length === 0 ? (
                  <Text as="p" tone="muted" lang={lang}>
                    {t('mine.appealsEmpty')}
                  </Text>
                ) : (
                  <ul className="bsdc-moderation__own">
                    {appeals.map((appeal) => (
                      <li key={appeal.id} className="bsdc-moderation__ownItem">
                        <Text as="p" size="sm" lang={lang}>
                          {t(`appeal.status.${appeal.status}`)}
                        </Text>
                        <Text as="p" size="xs" tone="muted" lang={lang}>
                          {appeal.reasonText}
                        </Text>
                      </li>
                    ))}
                  </ul>
                ),
            },
          ]}
        />
      )}

      <Text as="p" size="xs" tone="muted" lang={lang}>
        {t('summary', {
          open: counts.open,
          actioned: counts.actioned,
          dismissed: counts.dismissed,
        })}
      </Text>
    </Container>
  );
}
