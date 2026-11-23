import { Briefcase, MapPin } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ShareLinkButton } from '@/components/share/ShareLinkButton';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  LinkButton,
  ListHero,
  PageSkeleton,
  SelectField,
  TextField,
} from '@/design-system';
import { useJobBoard } from '@/hooks/use-opportunities';
import {
  formatSalaryRange,
  isApplied,
  type JobListing,
  type WorkMode,
} from '@/lib/opportunities/opportunity-types';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import { ROUTES, SITE, jobPath } from '@/lib/site';
import { JobApplicationForm } from '@/components/jobs/JobApplicationForm';
import { useJobApplicationPrefill } from '@/components/jobs/use-job-application-prefill';
import type { JobApplicationSubmission } from '@/lib/opportunities/job-application';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

const WORK_MODES: WorkMode[] = ['onsite', 'remote', 'hybrid'];

/** The job board: filters, listings and an application dialog. */
export default function JobsPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const board = useJobBoard();
  const applicationPrefill = useJobApplicationPrefill();
  const [applyingTo, setApplyingTo] = useState<JobListing | null>(null);

  async function submitApplication(application: JobApplicationSubmission) {
    if (applyingTo === null) return;
    await board.apply(applyingTo.id, application);
  }

  function closeApplication() {
    setApplyingTo(null);
  }

  return (
    <>
      <Seo
        title={t('jobs.metaTitle')}
        description={t('jobs.metaDescription')}
        path={ROUTES.jobs}
        jsonLd={[
          {
            '@type': 'CollectionPage',
            name: t('jobs.title'),
            description: t('jobs.metaDescription'),
            url: `${SITE.url}${ROUTES.jobs}`,
            mainEntity: {
              '@type': 'ItemList',
              itemListElement: board.jobs.slice(0, 20).map((job, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                url: `${SITE.url}${jobPath(job.slug)}`,
                name: `${job.title} — ${job.company}`,
              })),
            },
          },
        ]}
      />

      <div className="fab-container py-6 sm:py-10">
        <ListHero
          title={t('jobs.title')}
          description={t('jobs.description')}
          icon={<Briefcase size={22} />}
          actions={
            <LinkButton
              to={`${ROUTES.create}?kind=job`}
              variant="secondary"
              size="sm"
              iconStart={<Briefcase size={14} />}
            >
              {t('create.submit.job')}
            </LinkButton>
          }
          footer={
            <p className="inline-flex items-center gap-2 rounded-full bg-on-hero/15 px-3 py-1 text-xs font-medium ring-1 ring-white/20">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-green-200" />
              {t('jobs.openCount', { total: formatNumber(board.jobs.length, language) })}
            </p>
          }
        />

        <Card className="mt-4 rounded-2xl p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              label={t('jobs.search')}
              value={board.filters.query}
              onChange={(event) => {
                board.setFilters({ ...board.filters, query: event.target.value });
              }}
            />
            <SelectField
              label={t('jobs.workMode')}
              value={board.filters.workMode ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                board.setFilters({
                  ...board.filters,
                  workMode: value === '' ? null : (value as WorkMode),
                });
              }}
              options={[
                { value: '', label: t('jobs.anyMode') },
                ...WORK_MODES.map((mode) => ({
                  value: mode,
                  label: t(`jobs.modes.${mode}`),
                })),
              ]}
            />
            <SelectField
              label={t('jobs.skill')}
              value={board.filters.skill ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                board.setFilters({ ...board.filters, skill: value === '' ? null : value });
              }}
              options={[
                { value: '', label: t('jobs.anySkill') },
                ...board.facets.map((skill) => ({ value: skill, label: skill })),
              ]}
            />
          </div>
        </Card>

        {board.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {board.isError ? (
          <Alert tone="danger" title={t('jobs.failed')} className="mt-4">
            <button
              type="button"
              onClick={() => void board.refetch()}
              className="font-semibold underline"
            >
              {t('common.retry')}
            </button>
          </Alert>
        ) : null}

        {!board.isLoading && !board.isError && board.jobs.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Briefcase size={22} />}
              title={t('jobs.emptyTitle')}
              description={t('jobs.emptyBody')}
              action={
                <LinkButton to={`${ROUTES.create}?kind=job`} variant="primary" size="sm">
                  {t('create.submit.job')}
                </LinkButton>
              }
            />
          </div>
        ) : null}

        <ul className="mt-4 flex flex-col gap-3">
          {board.jobs.map((job) => {
            const salary = formatSalaryRange(job.salaryMin, job.salaryMax, job.currency, language);
            const applied = isApplied(job.myStatus);
            return (
              <Card as="li" key={job.id}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold">
                      <Link to={jobPath(job.slug)} className="hover:underline">
                        {job.title}
                      </Link>
                    </h2>
                    <p className="mt-1 text-sm text-muted">{job.company}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={13} aria-hidden="true" />
                        {job.workMode === 'remote' ? t('jobs.modes.remote') : job.city}
                      </span>
                      <Badge tone="neutral">{t(`jobs.types.${job.jobType}`)}</Badge>
                      <Badge tone="neutral">{t(`jobs.levels.${job.level}`)}</Badge>
                      {salary !== null ? (
                        <span>
                          {salary} / {t(`jobs.periods.${job.period}`)}
                        </span>
                      ) : null}
                      {job.publishedAt !== null ? (
                        <span>{formatRelativeTime(new Date(job.publishedAt), language)}</span>
                      ) : null}
                      <span>
                        {t('jobs.applicantCount', {
                          total: formatNumber(job.applications, language),
                        })}
                      </span>
                    </p>
                    {job.skills.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-1">
                        {job.skills.slice(0, 8).map((skill) => (
                          <li key={skill}>
                            <Chip
                              selected={board.filters.skill === skill}
                              onClick={() => {
                                board.setFilters({
                                  ...board.filters,
                                  skill: board.filters.skill === skill ? null : skill,
                                });
                              }}
                            >
                              {skill}
                            </Chip>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  {applied ? (
                    <Badge tone="green">{t(`jobs.statuses.${job.myStatus ?? 'submitted'}`)}</Badge>
                  ) : isSignedIn ? (
                    <Button
                      className="shrink-0"
                      onClick={() => {
                        setApplyingTo(job);
                      }}
                    >
                      {t('jobs.apply')}
                    </Button>
                  ) : (
                    <p className="text-xs text-muted">{t('jobs.signInToApply')}</p>
                  )}
                  <ShareLinkButton title={job.title} url={`${SITE.url}${jobPath(job.slug)}`} />
                </div>
              </Card>
            );
          })}
        </ul>
      </div>

      <JobApplicationForm
        open={applyingTo !== null}
        jobTitle={applyingTo?.title ?? ''}
        initial={applicationPrefill}
        isSubmitting={board.isApplying}
        onClose={closeApplication}
        onSubmit={submitApplication}
      />
    </>
  );
}
