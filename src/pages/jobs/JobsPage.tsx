/**
 * BSDC — src/pages/jobs/JobsPage.tsx
 * Purpose : The job board: what is open, filtered to what fits, and what you have applied to.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Posting requires the `creator` rank, which is how the board stays a place with jobs on
 *   it rather than a place with speculation on it. The requirement is stated on the screen rather
 *   than discovered at the moment a button refuses to work.
 *   Closed jobs are hidden by default and the count line says how many are hidden, because a board
 *   that quietly drops its history makes it impossible to tell whether the market is quiet or the
 *   page is broken.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Container, Heading, Skeleton, Tabs, Text } from '@/shared/ui';
import { can } from '@/core/config/permissions';
import { useSession } from '@/features/auth';
import { ignoreReadFailure } from '@/core/errors/ignore';
import { JobCard, JobFilters, NO_JOB_FILTERS, type JobFilterState } from '@/features/jobs';
import { listJobs, listMyApplications } from '@/entities/job/repository';
import type { Job } from '@/entities/job/model';

/**
 * Renders the jobs route.
 * @returns the jobs page
 */
export function JobsPage(): React.ReactElement {
  const { t } = useTranslation('jobs');
  const { session, profile, locale } = useSession();
  const [jobs, setJobs] = useState<readonly Job[]>([]);
  const [appliedIds, setAppliedIds] = useState<readonly string[]>([]);
  const [filters, setFilters] = useState<JobFilterState>(NO_JOB_FILTERS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listJobs({
      ...(filters.employmentType !== null ? { employmentType: filters.employmentType } : {}),
      ...(filters.workplaceType !== null ? { workplaceType: filters.workplaceType } : {}),
      ...(filters.division !== null ? { division: filters.division } : {}),
      ...(filters.experienceLevel !== null ? { experienceLevel: filters.experienceLevel } : {}),
    })
      .then((next) => setJobs(next.items))
      .catch(ignoreReadFailure)
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    const uid = session.uid;
    if (uid === null || uid.length === 0) {
      setAppliedIds([]);
      return;
    }
    void listMyApplications(uid)
      .then((applications) => setAppliedIds(applications.map((application) => application.jobId)))
      .catch(ignoreReadFailure);
  }, [session.uid]);

  const applied = useMemo(() => new Set(appliedIds), [appliedIds]);
  const lang = locale === 'bn' ? 'bn' : 'en';
  const mayPost = profile !== null && can(profile.role, 'job.post');

  return (
    <Container className="py-6">
      <header className="bsdc-page__head">
        <Heading level={1} size="xl" lang={lang}>
          {t('title')}
        </Heading>
        <Text as="p" tone="muted" lang={lang}>
          {t('subtitle')}
        </Text>
        {mayPost ? (
          <Button variant="primary" iconLeft="plus" to="/jobs?compose=1">
            {t('post')}
          </Button>
        ) : profile !== null ? (
          <Text as="p" size="sm" tone="muted" lang={lang}>
            {t('postRequiresCreator')}
          </Text>
        ) : null}
      </header>

      <JobFilters value={filters} onChange={setFilters} locale={locale} resultCount={jobs.length} />

      {loading ? (
        <Skeleton height={420} />
      ) : (
        <Tabs
          label={t('tabs.label')}
          defaultValue="board"
          items={[
            {
              value: 'board',
              label: t('tabs.board'),
              content:
                jobs.length === 0 ? (
                  <Text as="p" tone="muted" lang={lang}>
                    {t('board.empty')}
                  </Text>
                ) : (
                  <ul className="bsdc-jobs__grid">
                    {jobs.map((job) => (
                      <li key={job.id}>
                        <JobCard job={job} locale={locale} applied={applied.has(job.id)} />
                      </li>
                    ))}
                  </ul>
                ),
            },
            {
              value: 'applied',
              label: t('tabs.applied'),
              content:
                appliedIds.length === 0 ? (
                  <Text as="p" tone="muted" lang={lang}>
                    {t('tabs.appliedEmpty')}
                  </Text>
                ) : (
                  <ul className="bsdc-jobs__grid">
                    {jobs
                      .filter((job) => applied.has(job.id))
                      .map((job) => (
                        <li key={job.id}>
                          <JobCard job={job} locale={locale} applied />
                        </li>
                      ))}
                  </ul>
                ),
            },
          ]}
        />
      )}
    </Container>
  );
}
