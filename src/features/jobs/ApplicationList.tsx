/**
 * BSDC — src/features/jobs/ApplicationList.tsx
 * Purpose : The employer's view of who applied, and where each one stands.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Advancing a candidate writes a note the candidate can read. That is the whole design:
 *   a pipeline that only the employer can see is a pipeline where everybody waits in silence, and
 *   the silence is the part people remember about applying for work.
 *   Every row shows the person, what they said, and the current status; nothing here ranks anybody
 *   by anything other than when they applied, because a sorted list of hopefuls is not a feature a
 *   hiring manager needs us to invent.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, EmptyState, Select, Text, Textarea, showToast } from '@/shared/ui';
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from '@/core/config/opportunities';
import type { Locale } from '@/core/config/app';
import { countByStatus, type Application } from '@/entities/job/model';
import { setApplicationStatus } from '@/entities/job/repository';

/** Props for the application list. */
export interface ApplicationListProps {
  readonly jobId: string;
  readonly applications: readonly Application[];
  readonly locale: Locale;
  readonly onChange: (application: Application) => void;
}

/**
 * Renders the applications for one job.
 * @param props component props
 * @returns the list element
 */
export function ApplicationList({
  jobId,
  applications,
  locale,
  onChange,
}: ApplicationListProps): React.ReactElement {
  const { t } = useTranslation('jobs');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const [note, setNote] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const counts = countByStatus(applications);

  if (applications.length === 0) {
    return (
      <EmptyState
        illustration="empty-state"
        title={t('applications.empty.title')}
        description={t('applications.empty.description')}
        lang={lang}
      />
    );
  }

  const advance = (application: Application, status: ApplicationStatus): void => {
    setBusy(true);
    void setApplicationStatus(jobId, application.uid, status, note)
      .then((outcome) => {
        if (outcome.synced || outcome.queued) {
          onChange({ ...application, status, employerNote: note });
          setNote('');
          setTarget(null);
          showToast(locale, {
            titleBn: t('applications.updated.bn'),
            titleEn: t('applications.updated.en'),
            tone: 'success',
          });
        }
      })
      .finally(() => setBusy(false));
  };

  return (
    <section className="bsdc-applications" aria-label={t('applications.label')}>
      <dl className="bsdc-applications__counts">
        {APPLICATION_STATUSES.map((status) =>
          counts[status] > 0 ? (
            <div key={status} className="bsdc-applications__count">
              <dt lang={lang}>
                {APPLICATION_STATUS_LABELS[status][locale === 'bn' ? 'bn' : 'en']}
              </dt>
              <dd>{String(counts[status])}</dd>
            </div>
          ) : null,
        )}
      </dl>

      <ul className="bsdc-applications__list">
        {applications.map((application) => (
          <li key={application.uid} className="bsdc-applications__item">
            <Avatar
              name={application.applicantName}
              src={application.applicantPhotoUrl}
              size="sm"
              decorative
            />
            <div className="bsdc-applications__body">
              <p className="bsdc-applications__name" lang={lang}>
                {application.applicantName}
              </p>
              {application.applicantHeadline.length > 0 ? (
                <Text as="p" size="sm" tone="muted" lang={lang}>
                  {application.applicantHeadline}
                </Text>
              ) : null}
              <p className="bsdc-applications__letter" lang={lang}>
                {application.coverLetter}
              </p>
              {application.portfolioUrl.length > 0 ? (
                <a
                  href={application.portfolioUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  {t('applications.portfolio')}
                </a>
              ) : null}
              {application.employerNote.length > 0 ? (
                <p className="bsdc-applications__note" lang={lang}>
                  {application.employerNote}
                </p>
              ) : null}
            </div>
            <div className="bsdc-applications__actions">
              <Badge
                tone={
                  application.status === 'hired'
                    ? 'success'
                    : application.status === 'rejected'
                      ? 'danger'
                      : 'brand'
                }
                variant="outline"
              >
                {APPLICATION_STATUS_LABELS[application.status][locale === 'bn' ? 'bn' : 'en']}
              </Badge>
              {target === application.uid ? (
                <div className="bsdc-applications__decide">
                  <Textarea
                    label={t('applications.noteLabel')}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={400}
                  />
                  <Select<ApplicationStatus>
                    label={t('applications.statusLabel')}
                    value={application.status}
                    onValueChange={(next) => advance(application, next)}
                    options={APPLICATION_STATUSES.map((status) => ({
                      value: status,
                      label: APPLICATION_STATUS_LABELS[status][locale === 'bn' ? 'bn' : 'en'],
                    }))}
                  />
                  <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>
                    {t('applications.close')}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy}
                  onClick={() => setTarget(application.uid)}
                >
                  {t('applications.decide')}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
