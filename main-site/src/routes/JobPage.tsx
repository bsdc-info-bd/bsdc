import { ArrowLeft, Banknote, Briefcase, CalendarClock, MapPin, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { JobEditDialog } from '@/components/listings/ListingEditForm';
import { OwnerActions } from '@/components/listings/OwnerActions';
import { MediaImage } from '@/components/media/MediaImage';
import { ShareLinkButton } from '@/components/share/ShareLinkButton';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ExternalLink,
  LinkButton,
  PageSkeleton,
} from '@/design-system';
import { JobApplicationForm } from '@/components/jobs/JobApplicationForm';
import { useJobApplicationPrefill } from '@/components/jobs/use-job-application-prefill';
import { useJobDetail, useJobOwnerActions } from '@/hooks/use-opportunities';
import type { JobDetail, JobUpdate } from '@/lib/opportunities/opportunity-types';
import { dataErrorKey } from '@/lib/supabase/errors';
import { toast } from 'sonner';
import { formatAbsoluteDate, formatNumber, formatRelativeTime } from '@/lib/format';
import { jobIsLive, jobPostingJsonLd, safeExternalUrl } from '@/lib/listings/listing-schema';
import { formatSalaryRange, isApplied } from '@/lib/opportunities/opportunity-types';
import type { JobApplicationSubmission } from '@/lib/opportunities/job-application';
import { ROUTES, SITE, jobApplicationsPath, jobPath } from '@/lib/site';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

/** The published job as the edit dialog's draft, with the instant it expires as an ISO string. */
function jobToDraft(job: JobDetail): JobUpdate {
  return {
    title: job.title,
    company: job.company,
    description: job.description,
    jobType: job.jobType,
    workMode: job.workMode,
    level: job.level,
    city: job.city,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryPeriod: job.period,
    skills: job.skills,
    applyUrl: job.applyUrl,
    expiresAt: job.expiresAt,
    coverUrl: job.coverUrl,
  };
}

/** One job in full: the role, its terms, and the reader's own application. */
export default function JobPage() {
  const { slug = '' } = useParams();
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const detail = useJobDetail(slug);
  const ownerActions = useJobOwnerActions();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const applicationPrefill = useJobApplicationPrefill();
  const isStaff = useAuthStore((state) => state.claims?.staff ?? false);
  const [applying, setApplying] = useState(false);

  if (detail.isLoading) return <PageSkeleton label={t('jobs.detail.loading')} />;

  if (detail.isError) {
    return (
      <>
        <Seo
          title={t('jobs.detail.failed')}
          description={t('jobs.detail.notFoundBody')}
          path={jobPath(slug)}
          noindex
        />
        <div className="fab-container py-6">
          <Alert tone="danger" title={t('jobs.detail.failed')}>
            <button
              type="button"
              onClick={() => void detail.refetch()}
              className="font-semibold underline"
            >
              {t('common.retry')}
            </button>
          </Alert>
        </div>
      </>
    );
  }

  const job = detail.job;
  if (detail.isNotFound || job === null) {
    return (
      <>
        <Seo
          title={t('jobs.detail.notFoundTitle')}
          description={t('jobs.detail.notFoundBody')}
          path={jobPath(slug)}
          noindex
        />
        <div className="fab-container py-6 sm:py-10">
          <EmptyState
            icon={<Briefcase size={22} />}
            title={t('jobs.detail.notFoundTitle')}
            description={t('jobs.detail.notFoundBody')}
            action={
              <LinkButton to={ROUTES.jobs} variant="outline" size="sm">
                {t('jobs.detail.back')}
              </LinkButton>
            }
          />
        </div>
      </>
    );
  }

  const live = jobIsLive(job);
  const remote = job.workMode === 'remote';
  const applied = isApplied(job.myStatus);
  const isPoster = uid !== null && uid === job.posterUid;
  const canReviewApplications = isPoster || isStaff;
  const salary = formatSalaryRange(job.salaryMin, job.salaryMax, job.currency, language);
  const applyLink = live ? safeExternalUrl(job.applyUrl) : null;
  const path = jobPath(job.slug);
  const url = `${SITE.url}${path}`;
  const schema = live ? jobPostingJsonLd(job, url) : null;
  const summary = job.description.replace(/\s+/g, ' ').trim().slice(0, 155);
  const jobId = job.id;

  async function submitApplication(application: JobApplicationSubmission) {
    await detail.apply(jobId, application);
  }

  return (
    <>
      <Seo
        title={t('jobs.detail.metaTitle', { title: job.title })}
        description={summary.length > 0 ? summary : job.company}
        path={path}
        noindex={!live}
        jsonLd={schema !== null ? [schema] : []}
      />

      <article className="fab-container py-5 sm:py-8">
        <div className="mx-auto grid w-full max-w-4xl gap-4">
          <LinkButton
            to={ROUTES.jobs}
            variant="ghost"
            size="sm"
            iconStart={<ArrowLeft size={16} />}
            className="w-fit"
          >
            {t('jobs.detail.back')}
          </LinkButton>

          <Card padded={false} className="overflow-hidden">
            {job.coverUrl.trim().length > 0 ? (
              <div className="aspect-[16/6] w-full bg-surface-2">
                <MediaImage
                  src={job.coverUrl.trim()}
                  alt=""
                  slotWidth={960}
                  priority
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-3 p-4 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{t(`jobs.types.${job.jobType}`)}</Badge>
                <Badge tone="neutral">{t(`jobs.levels.${job.level}`)}</Badge>
                <Badge tone="blue">{t(`jobs.modes.${job.workMode}`)}</Badge>
                {live ? null : <Badge tone="warn">{t(`jobs.detail.statuses.${job.status}`)}</Badge>}
              </div>

              <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{job.title}</h1>
              <p className="text-base text-muted">{job.company}</p>

              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                <li className="flex items-start gap-2">
                  <MapPin size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
                  <span>{remote ? t('jobs.modes.remote') : job.city}</span>
                </li>
                {salary !== null ? (
                  <li className="flex items-start gap-2">
                    <Banknote size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
                    <span>
                      {salary} / {t(`jobs.periods.${job.period}`)}
                    </span>
                  </li>
                ) : null}
                {job.publishedAt !== null ? (
                  <li className="flex items-start gap-2">
                    <CalendarClock
                      size={16}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-muted"
                    />
                    <span>
                      {t('jobs.detail.posted', {
                        when: formatRelativeTime(new Date(job.publishedAt), language),
                      })}
                      {job.expiresAt !== null
                        ? ` · ${t('jobs.detail.closes', {
                            date: formatAbsoluteDate(new Date(job.expiresAt), language),
                          })}`
                        : ''}
                    </span>
                  </li>
                ) : null}
                <li className="flex items-start gap-2">
                  <Users size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
                  <span>
                    {t('jobs.applicantCount', {
                      total: formatNumber(job.applications, language),
                    })}
                  </span>
                </li>
              </ul>

              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
                {applied ? (
                  <p className="flex items-center gap-2 text-sm">
                    {t('jobs.detail.applicationStatus')}
                    <Badge tone="green">{t(`jobs.statuses.${job.myStatus ?? 'submitted'}`)}</Badge>
                  </p>
                ) : canReviewApplications ? (
                  // The count above is a promise that the applications can be
                  // read somewhere. This is that somewhere.
                  <div className="flex flex-wrap items-center gap-3">
                    {isPoster ? (
                      <p className="text-sm text-muted">{t('jobs.detail.postedByYou')}</p>
                    ) : null}
                    <LinkButton
                      to={jobApplicationsPath(slug)}
                      size="sm"
                      variant="secondary"
                      iconStart={<Users size={14} />}
                    >
                      {t('jobs.detail.reviewApplicants')}
                    </LinkButton>
                  </div>
                ) : !isSignedIn ? (
                  <p className="text-sm text-muted">{t('jobs.signInToApply')}</p>
                ) : live ? (
                  <Button
                    onClick={() => {
                      setApplying(true);
                    }}
                  >
                    {t('jobs.apply')}
                  </Button>
                ) : null}

                {applyLink !== null ? (
                  <ExternalLink href={applyLink} userGenerated>
                    {t('jobs.detail.applyExternal')}
                  </ExternalLink>
                ) : null}
                <ShareLinkButton title={job.title} url={url} size="md" />
              </div>

              {isPoster ? (
                <div className="border-t border-border pt-3">
                  <OwnerActions
                    labels={{
                      edit: t('jobs.manage.edit'),
                      ...(live ? { close: t('jobs.manage.close') } : {}),
                      delete: t('jobs.manage.delete'),
                      closeTitle: t('jobs.manage.closeTitle'),
                      closeBody: t('jobs.manage.closeBody'),
                      closeConfirm: t('jobs.manage.closeConfirm'),
                      deleteTitle: t('jobs.manage.deleteTitle'),
                      deleteBody:
                        job.applications === 0
                          ? t('jobs.manage.deleteBodyNoApplications')
                          : t('jobs.manage.deleteBody', { total: job.applications }),
                      deleteConfirm: t('jobs.manage.deleteConfirm'),
                      cancel: t('common.cancel'),
                    }}
                    onEdit={() => {
                      setEditing(true);
                    }}
                    {...(live
                      ? {
                          onClose: async () => {
                            try {
                              await ownerActions.close(job.id);
                              toast.success(t('jobs.manage.closedDone'));
                            } catch (error) {
                              toast.error(t(dataErrorKey(error)));
                            }
                          },
                        }
                      : {})}
                    onDelete={async () => {
                      try {
                        await ownerActions.remove(job.id, job.applications > 0);
                        toast.success(t('jobs.manage.deleted'));
                        navigate(ROUTES.jobs);
                      } catch (error) {
                        toast.error(t(dataErrorKey(error)));
                      }
                    }}
                    isClosing={ownerActions.isClosing}
                    isDeleting={ownerActions.isRemoving}
                  />
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">{t('jobs.detail.about')}</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-7">{job.description}</p>
            {job.skills.length > 0 ? (
              <ul className="mt-4 flex flex-wrap gap-1">
                {job.skills.map((skill) => (
                  <li key={skill}>
                    <Badge tone="neutral">{skill}</Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </div>
      </article>

      {isPoster ? (
        <JobEditDialog
          open={editing}
          initial={jobToDraft(job)}
          isSaving={ownerActions.isSaving}
          onClose={() => {
            setEditing(false);
          }}
          onSave={async (draft: JobUpdate) => {
            try {
              const saved = await ownerActions.save(job.id, draft);
              setEditing(false);
              toast.success(t('jobs.manage.saved'));
              if (saved.length > 0 && saved !== job.slug) navigate(jobPath(saved));
            } catch (error) {
              toast.error(t(dataErrorKey(error)));
            }
          }}
        />
      ) : null}

      <JobApplicationForm
        open={applying}
        jobTitle={job.title}
        initial={applicationPrefill}
        isSubmitting={detail.isApplying}
        onClose={() => setApplying(false)}
        onSubmit={submitApplication}
      />
    </>
  );
}
