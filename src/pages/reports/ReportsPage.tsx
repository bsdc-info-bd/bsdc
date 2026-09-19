/**
 * BSDC — src/pages/reports/ReportsPage.tsx
 * Purpose : Where a staff member issues a report.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The snapshot is built at the moment of generation, not when the screen opens, so the
 *   numbers in the PDF are the numbers at the instant printed on it. Every read that can fail falls
 *   back to what this device holds and says so, because a report that silently counts a subset and
 *   presents it as the whole is worse than a report that admits it is partial.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Container, Heading, Text } from '@/shared/ui';
import { useSession } from '@/features/auth';
import { ReportComposer } from '@/features/reports';
import { AdminScope } from '@/features/admin';
import type { CommunitySnapshot } from '@/entities/report/catalog';
import { countMembersByRole } from '@/entities/report/repository';
import { listJobs } from '@/entities/job/repository';
import { listEvents } from '@/entities/event/repository';
import { listQueue } from '@/entities/moderation/repository';
import { ROLES } from '@/core/config/permissions';
import type { Report } from '@/entities/moderation/model';
import type { BsdcEvent } from '@/entities/event/model';
import type { Job } from '@/entities/job/model';

/**
 * Renders the reports route.
 * @returns the page element
 */
export function ReportsPage(): React.ReactElement {
  const { t } = useTranslation('reports');
  const { profile, session, locale } = useSession();
  const lang = locale === 'bn' ? 'bn' : 'en';

  const buildSnapshot = useCallback(async (): Promise<CommunitySnapshot> => {
    const [reports, eventsPage, jobsPage, membersByRole] = await Promise.all([
      listQueue().catch(() => [] as readonly Report[]),
      listEvents().catch(() => ({ items: [] as readonly BsdcEvent[], source: 'local' as const })),
      listJobs().catch(() => ({ items: [] as readonly Job[], source: 'local' as const })),
      countMembersByRole(ROLES),
    ]);
    return {
      reports,
      events: eventsPage.items,
      jobs: jobsPage.items,
      membersByRole,
      periodStart: null,
      periodEnd: null,
    };
  }, []);

  return (
    <Container className="py-6">
      <header className="bsdc-page__head">
        <Heading level={1} size="xl" lang={lang}>
          {t('title')}
        </Heading>
        <Text as="p" tone="muted" lang={lang}>
          {t('subtitle')}
        </Text>
      </header>
      <AdminScope role={profile?.role ?? 'guest'} root={session.claims.root} locale={locale}>
        <ReportComposer
          locale={locale}
          role={profile?.role ?? 'guest'}
          root={session.claims.root}
          buildSnapshot={buildSnapshot}
        />
      </AdminScope>
    </Container>
  );
}
