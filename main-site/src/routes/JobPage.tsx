import { ArrowLeft, Banknote, Briefcase, CalendarClock, MapPin, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ExternalLink,
  LinkButton,
  Modal,
  PageSkeleton,
  TextareaField,
} from '@/design-system';
import { useJobDetail } from '@/hooks/use-opportunities';
import { formatAbsoluteDate, formatNumber, formatRelativeTime } from '@/lib/format';
import { jobIsLive, jobPostingJsonLd, safeExternalUrl } from '@/lib/listings/listing-schema';
import { formatSalaryRange, isApplied } from '@/lib/opportunities/opportunity-types';
import { ROUTES, SITE, jobPath } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

/** One job in full: the role, its terms, and the reader's own application. */
export default function JobPage() {
  const { slug = '' } = useParams();
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const detail = useJobDetail(slug);
  const [applying, setApplying] = useState(false);
  const [coverLetter, setCoverLetter] = useState('');

  if (detail.isLoading) return <PageSkeleton label={t('jobs.detail.loading')} />;

  if (detail.isError) {
    return (
      <div className="fab-container py-6">
        <Alert tone="danger" title={t('jobs.detail.failed')} />
      </div>
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
  const salary = formatSalaryRange(job.salaryMin, job.salaryMax, job.currency, language);
  const applyLink = live ? safeExternalUrl(job.applyUrl) : null;
  const path = jobPath(job.slug);
  const url = `${SITE.url}${path}`;
  const schema = live ? jobPostingJsonLd(job, url) : null;
  const summary = job.description.replace(/\s+/g, ' ').trim().slice(0, 155);
  const jobId = job.id;

  async function submitApplication() {
    try {
      await detail.apply(jobId, coverLetter.trim());
      toast.success(t('jobs.applied'));
      setApplying(false);
      setCoverLetter('');
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
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

          <Card>
            <div className="flex flex-col gap-3">
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
                ) : isPoster ? (
                  <p className="text-sm text-muted">{t('jobs.detail.postedByYou')}</p>
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
              </div>
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

      <Modal
        open={applying}
        onClose={() => {
          setApplying(false);
        }}
        title={t('jobs.applyTo', { title: job.title })}
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
            disabled={detail.isApplying || coverLetter.trim().length < 20}
            onClick={() => {
              void submitApplication();
            }}
          >
            {t('jobs.sendApplication')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setApplying(false);
            }}
          >
            {t('common.cancel')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
