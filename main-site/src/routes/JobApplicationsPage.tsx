import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Eye,
  FileText,
  Handshake,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LinkButton,
  Modal,
  PageSkeleton,
  TextareaField,
} from '@/design-system';
import { useJobApplications, useJobDetail } from '@/hooks/use-opportunities';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import type { ApplicationStatus, JobApplication } from '@/lib/opportunities/opportunity-types';
import { ROUTES, jobApplicationsPath, jobPath } from '@/lib/site';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

/**
 * Every application on one job, as its poster sees them.
 *
 * The job page has always shown "N applicants", and until now that number was a
 * promise with nothing behind it on the web: an employer could publish a role,
 * watch the count rise, and never read a single cover letter. Applying worked;
 * hiring did not.
 *
 * `job_application_queue()` (migration 0113) does the read and re-checks that the
 * caller posted the job or is staff, and `decide_application()` re-checks it
 * again on the write, so a forged request is refused rather than trusted. This
 * page is one job at a time, because an application only means anything next to
 * the role it answers.
 */

const STATUS_TONE = {
  submitted: 'blue',
  reviewing: 'warn',
  shortlisted: 'green',
  hired: 'green',
  rejected: 'danger',
  withdrawn: 'neutral',
} as const;

/** The order an employer triages in: undecided first, settled last. */
const STATUS_ORDER: readonly ApplicationStatus[] = [
  'submitted',
  'reviewing',
  'shortlisted',
  'hired',
  'rejected',
  'withdrawn',
];

export default function JobApplicationsPage() {
  const { slug = '' } = useParams();
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const uid = useAuthStore((state) => state.user?.uid ?? null);

  const detail = useJobDetail(slug);
  const job = detail.job;
  const isPoster = job !== null && uid !== null && job.posterUid === uid;

  const queue = useJobApplications(job?.id ?? null, isPoster);
  const [filter, setFilter] = useState<ApplicationStatus | 'all'>('all');
  const [declining, setDeclining] = useState<JobApplication | null>(null);
  const [reason, setReason] = useState('');

  const counts = useMemo(() => {
    const map = new Map<ApplicationStatus, number>();
    for (const application of queue.applications) {
      map.set(application.status, (map.get(application.status) ?? 0) + 1);
    }
    return map;
  }, [queue.applications]);

  const visible = useMemo(() => {
    const rows =
      filter === 'all'
        ? queue.applications
        : queue.applications.filter((application) => application.status === filter);
    return [...rows].sort((a, b) => {
      const rank = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      if (rank !== 0) return rank;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [queue.applications, filter]);

  /**
   * A decided application. Each outcome gets its own literal key rather than a
   * template so the i18n test can prove both languages have a sentence for it.
   */
  async function decide(application: JobApplication, status: ApplicationStatus): Promise<void> {
    try {
      await queue.decide(application.id, status);
      switch (status) {
        case 'shortlisted':
          toast.success(t('jobs.applications.movedShortlisted'));
          break;
        case 'hired':
          toast.success(t('jobs.applications.movedHired'));
          break;
        case 'rejected':
          toast.success(t('jobs.applications.movedRejected'));
          break;
        case 'reviewing':
          toast.success(t('jobs.applications.movedReviewing'));
          break;
        default:
          toast.success(t('jobs.applications.deciding'));
      }
      setDeclining(null);
      setReason('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.generic'));
    }
  }

  const path = jobApplicationsPath(slug);

  if (detail.isLoading) return <PageSkeleton label={t('common.loading')} />;

  if (detail.isError || detail.isNotFound || job === null) {
    return (
      <>
        <Seo
          title={t('jobs.applications.notFoundTitle')}
          description={t('jobs.detail.notFoundBody')}
          path={path}
          noindex
        />
        <div className="fab-container py-6 sm:py-10">
          <EmptyState
            icon={<Users size={22} />}
            title={t('jobs.applications.notFoundTitle')}
            description={t('jobs.detail.notFoundBody')}
            action={
              <LinkButton to={ROUTES.jobs} variant="outline" size="sm">
                {t('jobs.applications.backToJob')}
              </LinkButton>
            }
          />
        </div>
      </>
    );
  }

  if (!isSignedIn) {
    return (
      <>
        <Seo title={t('jobs.applications.title')} description={job.title} path={path} noindex />
        <div className="fab-container py-6">
          <Alert tone="warning" title={t('jobs.signInToApply')} />
        </div>
      </>
    );
  }

  // A signed-in member who did not post this role is not being shown other
  // people's cover letters: the server refuses the read, and the page says so
  // plainly rather than rendering an empty list that reads as "nobody applied".
  if (!isPoster) {
    return (
      <>
        <Seo title={t('jobs.applications.title')} description={job.title} path={path} noindex />
        <div className="fab-container py-6 sm:py-10">
          <EmptyState
            icon={<Users size={22} />}
            title={t('jobs.applications.ownerOnlyTitle')}
            description={t('jobs.applications.ownerOnlyBody')}
            action={
              <LinkButton to={jobPath(slug)} variant="outline" size="sm">
                {t('jobs.applications.backToJob')}
              </LinkButton>
            }
          />
        </div>
      </>
    );
  }

  const total = job.applications;

  return (
    <>
      <Seo
        title={`${t('jobs.applications.title')} — ${job.title}`}
        description={job.title}
        path={path}
        noindex
      />
      <div className="fab-container space-y-4 py-6 sm:py-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              to={jobPath(slug)}
              className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"
            >
              <ArrowLeft size={15} aria-hidden />
              {job.title}
            </Link>
            <h1 className="mt-2 text-xl font-bold text-text sm:text-2xl">
              {t('jobs.applications.title')}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {t('jobs.applications.lead', { total: formatNumber(total, language) })}
            </p>
          </div>
          <Badge tone="green" icon={<Users size={14} />}>
            {t('jobs.applications.liveCount', {
              total: formatNumber(
                queue.applications.filter(
                  (a) => a.status !== 'rejected' && a.status !== 'withdrawn',
                ).length,
                language,
              ),
            })}
          </Badge>
        </div>

        {queue.isError ? <Alert tone="danger" title={t('jobs.applications.failed')} /> : null}

        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label={t('jobs.applications.filterLabel')}
        >
          <button
            type="button"
            role="radio"
            aria-checked={filter === 'all'}
            onClick={() => setFilter('all')}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              filter === 'all'
                ? 'border-green-700 bg-green-700 text-white'
                : 'border-border text-text hover:bg-surface-2'
            }`}
          >
            {t('jobs.applications.all')} · {formatNumber(queue.applications.length, language)}
          </button>
          {STATUS_ORDER.filter((status) => (counts.get(status) ?? 0) > 0).map((status) => (
            <button
              key={status}
              type="button"
              role="radio"
              aria-checked={filter === status}
              onClick={() => setFilter(status)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                filter === status
                  ? 'border-green-700 bg-green-700 text-white'
                  : 'border-border text-text hover:bg-surface-2'
              }`}
            >
              {t(`jobs.statuses.${status}`, { defaultValue: status })} ·{' '}
              {formatNumber(counts.get(status) ?? 0, language)}
            </button>
          ))}
        </div>

        {queue.isLoading ? (
          <Card>
            <p className="text-sm text-muted">{t('common.loading')}</p>
          </Card>
        ) : null}

        {!queue.isLoading && visible.length === 0 ? (
          <EmptyState
            icon={<Users size={22} />}
            title={t('jobs.applications.emptyTitle')}
            description={t('jobs.applications.emptyBody')}
          />
        ) : null}

        <ul className="grid gap-3">
          {visible.map((application) => {
            const busy = queue.decidingId === application.id;
            const live = application.status !== 'withdrawn' && application.status !== 'rejected';
            return (
              <li key={application.id}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-semibold text-text">
                        <span className="truncate">{application.displayName}</span>
                        {application.verified ? (
                          <ShieldCheck
                            size={15}
                            aria-label={t('jobs.applications.verified')}
                            className="shrink-0 text-green-700"
                          />
                        ) : null}
                      </p>
                      {application.username.length > 0 ? (
                        <Link
                          to={`/u/${application.username}`}
                          className="text-xs text-green-700 hover:underline"
                        >
                          @{application.username}
                        </Link>
                      ) : null}
                    </div>
                    <Badge tone={STATUS_TONE[application.status]}>
                      {t(`jobs.statuses.${application.status}`, {
                        defaultValue: application.status,
                      })}
                    </Badge>
                  </div>

                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                    <CalendarClock size={13} aria-hidden />
                    {t('jobs.applications.applied', {
                      when: formatRelativeTime(new Date(application.createdAt), language),
                    })}
                  </p>

                  <div className="mt-3">
                    <p className="text-xs font-medium text-muted">
                      {t('jobs.applications.coverLetter')}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-6 text-text">
                      {application.coverLetter.trim().length > 0
                        ? application.coverLetter
                        : t('jobs.applications.noCoverLetter')}
                    </p>
                  </div>

                  {application.resumeUrl.length > 0 ? (
                    <a
                      href={application.resumeUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-3 inline-flex items-center gap-1.5 text-sm text-green-700 hover:underline"
                    >
                      <FileText size={14} aria-hidden />
                      {t('jobs.applications.openResume')}
                    </a>
                  ) : null}

                  {live ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {application.status === 'submitted' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={queue.isDeciding}
                          loading={busy}
                          onClick={() => void decide(application, 'reviewing')}
                          iconStart={<Eye size={14} />}
                        >
                          {t('jobs.applications.review')}
                        </Button>
                      ) : null}
                      {application.status !== 'shortlisted' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={queue.isDeciding}
                          loading={busy}
                          onClick={() => void decide(application, 'shortlisted')}
                          iconStart={<CheckCircle2 size={14} />}
                        >
                          {t('jobs.applications.shortlist')}
                        </Button>
                      ) : null}
                      {application.status !== 'hired' ? (
                        <Button
                          size="sm"
                          disabled={queue.isDeciding}
                          loading={busy}
                          onClick={() => void decide(application, 'hired')}
                          iconStart={<Handshake size={14} />}
                        >
                          {t('jobs.applications.hire')}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={queue.isDeciding}
                        onClick={() => {
                          setDeclining(application);
                          setReason('');
                        }}
                        iconStart={<XCircle size={14} />}
                      >
                        {t('jobs.applications.decline')}
                      </Button>
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      </div>

      <Modal
        open={declining !== null}
        onClose={() => setDeclining(null)}
        title={t('jobs.applications.declineTitle')}
        closeLabel={t('common.cancel')}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDeclining(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={reason.trim().length < 3}
              onClick={() => {
                if (declining !== null) void decide(declining, 'rejected');
              }}
            >
              {t('jobs.applications.decline')}
            </Button>
          </div>
        }
      >
        <TextareaField
          label={t('jobs.applications.declineReason')}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
        />
      </Modal>
    </>
  );
}
