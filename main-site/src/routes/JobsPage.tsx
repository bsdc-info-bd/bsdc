import { Briefcase, MapPin } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Modal,
  PageSkeleton,
  SectionHeading,
  SelectField,
  TextField,
  TextareaField,
} from '@/design-system';
import { useJobBoard } from '@/hooks/use-opportunities';
import {
  formatSalaryRange,
  isApplied,
  type JobListing,
  type WorkMode,
} from '@/lib/opportunities/opportunity-types';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import { ROUTES, SITE } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

const WORK_MODES: WorkMode[] = ['onsite', 'remote', 'hybrid'];

/** The job board: filters, listings and an application dialog. */
export default function JobsPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const board = useJobBoard();
  const [applyingTo, setApplyingTo] = useState<JobListing | null>(null);
  const [coverLetter, setCoverLetter] = useState('');

  async function submitApplication() {
    if (applyingTo === null) return;
    try {
      await board.apply(applyingTo.id, coverLetter.trim());
      toast.success(t('jobs.applied'));
      setApplyingTo(null);
      setCoverLetter('');
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <>
      <Seo
        title={t('jobs.metaTitle')}
        description={t('jobs.metaDescription')}
        path={ROUTES.jobs}
        jsonLd={board.jobs.slice(0, 20).map((job) => ({
          '@type': 'JobPosting',
          title: job.title,
          hiringOrganization: { '@type': 'Organization', name: job.company },
          employmentType: job.jobType.toUpperCase(),
          jobLocationType: job.workMode === 'remote' ? 'TELECOMMUTE' : undefined,
          ...(job.publishedAt !== null ? { datePosted: job.publishedAt } : {}),
          jobLocation: {
            '@type': 'Place',
            address: { '@type': 'PostalAddress', addressLocality: job.city, addressCountry: 'BD' },
          },
          url: `${SITE.url}${ROUTES.jobs}`,
        }))}
      />

      <div className="fab-container py-6 sm:py-10">
        <SectionHeading title={t('jobs.title')} description={t('jobs.description')} />

        <Card className="mt-4">
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
        {board.isError ? <Alert tone="danger" title={t('jobs.failed')} className="mt-4" /> : null}

        {!board.isLoading && !board.isError && board.jobs.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Briefcase size={22} />}
              title={t('jobs.emptyTitle')}
              description={t('jobs.emptyBody')}
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
                    <h2 className="text-lg font-semibold">{job.title}</h2>
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
                                board.setFilters({ ...board.filters, skill });
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
                </div>
              </Card>
            );
          })}
        </ul>
      </div>

      <Modal
        open={applyingTo !== null}
        onClose={() => {
          setApplyingTo(null);
        }}
        title={t('jobs.applyTo', { title: applyingTo?.title ?? '' })}
        closeLabel={t('common.close')}
      >
        <TextareaField
          label={t('jobs.coverLetter')}
          hint={t('jobs.coverLetterHint')}
          rows={6}
          value={coverLetter}
          maxLength={6000}
          counterMax={6000}
          onChange={(event) => {
            setCoverLetter(event.target.value);
          }}
        />
        <div className="mt-4 flex gap-2">
          <Button
            disabled={board.isApplying || coverLetter.trim().length < 20}
            onClick={() => {
              void submitApplication();
            }}
          >
            {t('jobs.sendApplication')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setApplyingTo(null);
            }}
          >
            {t('common.cancel')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
