/**
 * BSDC — src/pages/jobs/JobDetailPage.tsx
 * Purpose : One job, and the two different screens it becomes depending on who is reading.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The same route serves two honest purposes. A candidate sees the job and applies; the
 *   employer sees the job and the people who applied. Neither view is hidden from the other by
 *   guesswork — the switch is the account, checked against the job's own `employerUid`, and the
 *   rules refuse the read either way for anyone else.
 *   The salary is either stated or described as undisclosed. There is no third state where a range
 *   of zeroes is left sitting on the page for somebody to interpret.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, Container, EmptyState, Heading, Icon, Skeleton, Text } from '@/shared/ui';
import {
  CURRENCY_SYMBOLS,
  EMPLOYMENT_TYPE_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  SALARY_PERIOD_LABELS,
  WORKPLACE_TYPE_LABELS,
} from '@/core/config/opportunities';
import { useSession } from '@/features/auth';
import { ignoreReadFailure } from '@/core/errors/ignore';
import { ApplicationForm, ApplicationList } from '@/features/jobs';
import { listApplications, loadApplication, loadJob } from '@/entities/job/repository';
import { daysToDeadline, salaryLine, type Application, type Job } from '@/entities/job/model';

/**
 * Renders the job detail route.
 * @returns the job page
 */
export function JobDetailPage(): React.ReactElement {
  const { t } = useTranslation('jobs');
  const { jobId = '' } = useParams<{ jobId: string }>();
  const { session, profile, locale } = useSession();
  const [job, setJob] = useState<Job | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [applications, setApplications] = useState<readonly Application[]>([]);
  const [loading, setLoading] = useState(true);

  const isEmployer = job !== null && profile !== null && job.employerUid === profile.uid;

  useEffect(() => {
    setLoading(true);
    void loadJob(jobId)
      .then((next) => setJob(next ?? null))
      .finally(() => setLoading(false));
  }, [jobId]);

  useEffect(() => {
    const uid = session.uid;
    if (job === null || uid === null || uid.length === 0) return;
    void loadApplication(job.id, uid)
      .then((next) => setApplication(next ?? null))
      .catch(ignoreReadFailure);
  }, [job, session.uid]);

  useEffect(() => {
    if (job === null || !isEmployer) return;
    void listApplications(job.id).then(setApplications).catch(ignoreReadFailure);
  }, [job, isEmployer]);

  const lang = locale === 'bn' ? 'bn' : 'en';

  if (loading) {
    return (
      <Container className="py-6">
        <Skeleton height={420} />
      </Container>
    );
  }

  if (job === null) {
    return (
      <Container className="py-6">
        <EmptyState
          illustration="not-found"
          title={t('detail.missing.title')}
          description={t('detail.missing.description')}
          lang={lang}
        />
      </Container>
    );
  }

  const bn = locale === 'bn';
  const pay = salaryLine(job, CURRENCY_SYMBOLS[job.currency]);
  const days = daysToDeadline(job);

  return (
    <Container className="py-6">
      <article className="bsdc-jobDetail">
        <Heading level={1} size="xl" lang={lang}>
          {job.title}
        </Heading>
        <p className="bsdc-jobDetail__company" lang={lang}>
          <Icon name="building" size={16} />
          {job.companyName}
        </p>
        <div className="bsdc-jobDetail__badges">
          <Badge tone="neutral" variant="outline">
            {EMPLOYMENT_TYPE_LABELS[job.employmentType][bn ? 'bn' : 'en']}
          </Badge>
          <Badge tone="neutral" variant="outline">
            {WORKPLACE_TYPE_LABELS[job.workplaceType][bn ? 'bn' : 'en']}
          </Badge>
          <Badge tone="neutral" variant="outline">
            {EXPERIENCE_LEVEL_LABELS[job.experienceLevel][bn ? 'bn' : 'en']}
          </Badge>
        </div>
        <dl className="bsdc-jobDetail__facts">
          <div>
            <dt lang={lang}>{t('detail.location')}</dt>
            <dd lang={lang}>{job.location.length > 0 ? job.location : t('remoteAnywhere')}</dd>
          </div>
          <div>
            <dt lang={lang}>{t('detail.salary')}</dt>
            <dd lang={lang}>
              {pay.length > 0
                ? `${pay} ${SALARY_PERIOD_LABELS[job.salaryPeriod][bn ? 'bn' : 'en']}`
                : t('salaryUndisclosed')}
            </dd>
          </div>
          <div>
            <dt lang={lang}>{t('detail.deadline')}</dt>
            <dd lang={lang}>
              {job.deadlineAt === null
                ? t('noDeadline')
                : days === 0
                  ? t('closesToday')
                  : t('closesIn', { count: days ?? 0 })}
            </dd>
          </div>
          <div>
            <dt lang={lang}>{t('detail.applicants')}</dt>
            <dd lang={lang}>{String(job.applicationCount)}</dd>
          </div>
        </dl>

        {job.skills.length > 0 ? (
          <ul className="bsdc-jobDetail__skills">
            {job.skills.map((skill) => (
              <li key={skill}>
                <Badge tone="brand" variant="outline">
                  {skill}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}

        <Text as="p" lang={lang} className="bsdc-jobDetail__body">
          {job.description}
        </Text>

        {isEmployer ? (
          <ApplicationList
            jobId={job.id}
            applications={applications}
            locale={locale}
            onChange={(next) =>
              setApplications((current) =>
                current.map((entry) => (entry.uid === next.uid ? next : entry)),
              )
            }
          />
        ) : profile !== null ? (
          <ApplicationForm
            job={job}
            applicant={profile}
            existing={application}
            locale={locale}
            onSubmitted={setApplication}
          />
        ) : (
          <Text as="p" tone="muted" lang={lang}>
            {t('detail.signInToApply')}
          </Text>
        )}
      </article>
    </Container>
  );
}
