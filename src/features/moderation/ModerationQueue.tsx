/**
 * BSDC — src/features/moderation/ModerationQueue.tsx
 * Purpose : The reviewer's working screen: what is waiting, and what is past due.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The queue is ordered by the machine's own rules — pending first, overdue first within
 *   that, then severity, then oldest — and the counters above it always say how much is left so a
 *   reviewer knows whether they are looking at the whole problem or one corner of it.
 *   A reviewer never sees their own decision to appeal: that filter is applied here as a courtesy,
 *   and enforced again in the Cloud Function that decides.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Chip, ChipRail, EmptyState, Text, VirtualList } from '@/shared/ui';
import { FEED_BUDGETS } from '@/core/config/limits';
import { REPORT_STATES, type ReportState } from '@/core/config/moderation';
import type { Locale } from '@/core/config/app';
import { countByState, sortQueue, type Report } from '@/entities/moderation/model';
import { ReportCard } from './ReportCard';

/** Props for the moderation queue. */
export interface ModerationQueueProps {
  readonly reports: readonly Report[];
  readonly locale: Locale;
  readonly reviewerUid: string;
  readonly reviewerRole: 'support' | 'moderator' | 'admin' | 'root';
  readonly activeState: ReportState | null;
  readonly onStateChange: (state: ReportState | null) => void;
  readonly onDecided: (report: Report) => void;
  readonly height?: (number | string) | undefined;
}

/**
 * Renders the moderation queue.
 * @param props component props
 * @returns the queue element
 */
export function ModerationQueue({
  reports,
  locale,
  reviewerUid,
  reviewerRole,
  activeState,
  onStateChange,
  onDecided,
  height = 720,
}: ModerationQueueProps): React.ReactElement {
  const { t } = useTranslation('moderation');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const counts = countByState(reports);

  const filtered = reports.filter((report) => activeState === null || report.state === activeState);
  const ordered = sortQueue(filtered);

  if (reports.length === 0) {
    return (
      <EmptyState
        illustration="empty-state"
        title={t('queue.empty.title')}
        description={t('queue.empty.description')}
        lang={lang}
      />
    );
  }

  return (
    <section className="bsdc-queue" aria-label={t('queue.label')}>
      <dl className="bsdc-queue__counts">
        {REPORT_STATES.map((state) => (
          <div key={state} className="bsdc-queue__count">
            <dt lang={lang}>{t(`state.${state}`)}</dt>
            <dd>{String(counts[state])}</dd>
          </div>
        ))}
      </dl>

      <ChipRail label={t('queue.filterLabel')}>
        <Chip selected={activeState === null} onToggle={() => onStateChange(null)}>
          {t('queue.all')}
        </Chip>
        {REPORT_STATES.map((state) => (
          <Chip
            key={state}
            selected={activeState === state}
            onToggle={() => onStateChange(activeState === state ? null : state)}
          >
            {t(`state.${state}`)}
          </Chip>
        ))}
      </ChipRail>

      {ordered.length === 0 ? (
        <Text as="p" size="sm" tone="muted" lang={lang}>
          {t('queue.noneInState')}
        </Text>
      ) : ordered.length > FEED_BUDGETS.virtualizationThreshold ? (
        <VirtualList
          items={ordered}
          itemHeight={280}
          height={height}
          label={t('queue.label')}
          renderItem={(report) => (
            <ReportCard
              report={report}
              locale={locale}
              reviewerUid={reviewerUid}
              reviewerRole={reviewerRole}
              onDecided={onDecided}
            />
          )}
        />
      ) : (
        <ul className="bsdc-queue__list">
          {ordered.map((report) => (
            <li key={report.id}>
              <ReportCard
                report={report}
                locale={locale}
                reviewerUid={reviewerUid}
                reviewerRole={reviewerRole}
                onDecided={onDecided}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
