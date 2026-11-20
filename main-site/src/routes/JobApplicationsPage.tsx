import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Eye,
  FileText,
  Handshake,
  MapPin,
  Search,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { MediaImage } from '@/components/media/MediaImage';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ExternalLink,
  LinkButton,
  Modal,
  PageSkeleton,
  SelectField,
  TextareaField,
  TextField,
} from '@/design-system';
import { useJobApplications, useJobDetail } from '@/hooks/use-opportunities';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import { formatTaka } from '@/lib/mk/mk-logic';
import type { ApplicationStatus, JobApplication } from '@/lib/opportunities/opportunity-types';
import { dataErrorKey } from '@/lib/supabase/errors';
import { profilePath, ROUTES, jobApplicationsPath, jobPath } from '@/lib/site';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

/** One private, permission-checked employer queue for the role's poster or staff. */
const STATUS_ORDER: readonly ApplicationStatus[] = [
  'submitted',
  'reviewing',
  'shortlisted',
  'hired',
  'rejected',
  'withdrawn',
];

const STATUS_TONE = {
  submitted: 'blue',
  reviewing: 'warn',
  shortlisted: 'green',
  hired: 'green',
  rejected: 'danger',
  withdrawn: 'neutral',
} as const;

type DecisionStatus = Extract<
  ApplicationStatus,
  'reviewing' | 'shortlisted' | 'hired' | 'rejected'
>;
type SortMode = 'priority' | 'newest' | 'oldest';

function isPermissionError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '42501'
  );
}

function safeTelephone(raw: string): string {
  return raw.replace(/[^0-9+]/g, '');
}

function searchableText(application: JobApplication): string {
  return [
    application.applicantName,
    application.displayName,
    application.username,
    application.phone,
    application.email,
    application.location,
    application.education,
    application.skills.join(' '),
    application.coverLetter,
  ]
    .join(' ')
    .toLocaleLowerCase();
}

export default function JobApplicationsPage() {
  const { slug = '' } = useParams();
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const isStaff = useAuthStore((state) => state.claims.staff);
  const detail = useJobDetail(slug);
  const job = detail.job;
  const isPoster = job !== null && uid !== null && job.posterUid === uid;
  const canReview = isPoster || isStaff;
  const queue = useJobApplications(job?.id ?? null, canReview);
  const [filter, setFilter] = useState<ApplicationStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('priority');
  const [decision, setDecision] = useState<{
    application: JobApplication;
    status: DecisionStatus;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState('');

  const counts = useMemo(() => {
    const map = new Map<ApplicationStatus, number>();
    for (const application of queue.applications) {
      map.set(application.status, (map.get(application.status) ?? 0) + 1);
    }
    return map;
  }, [queue.applications]);

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const rows = queue.applications.filter((application) => {
      const matchesStatus = filter === 'all' || application.status === filter;
      return matchesStatus && (needle.length === 0 || searchableText(application).includes(needle));
    });
    return [...rows].sort((left, right) => {
      if (sort === 'priority') {
        const rank = STATUS_ORDER.indexOf(left.status) - STATUS_ORDER.indexOf(right.status);
        if (rank !== 0) return rank;
      }
      const leftDate = Date.parse(left.createdAt) || 0;
      const rightDate = Date.parse(right.createdAt) || 0;
      return sort === 'oldest' ? leftDate - rightDate : rightDate - leftDate;
    });
  }, [filter, queue.applications, search, sort]);

  function askDecision(application: JobApplication, status: DecisionStatus) {
    setDecision({ application, status });
    setReason('');
    setActionError('');
  }

  async function confirmDecision() {
    if (decision === null || (decision.status === 'rejected' && reason.trim().length < 3)) return;
    try {
      await queue.decide(decision.application.id, decision.status, reason.trim());
      const message = {
        reviewing: 'jobs.applications.movedReviewing',
        shortlisted: 'jobs.applications.movedShortlisted',
        hired: 'jobs.applications.movedHired',
        rejected: 'jobs.applications.movedRejected',
      }[decision.status];
      toast.success(t(message));
      setDecision(null);
      setReason('');
      setActionError('');
    } catch (error) {
      setActionError(t(dataErrorKey(error)));
    }
  }

  const path = jobApplicationsPath(slug);

  if (detail.isLoading) return <PageSkeleton label={t('common.loading')} />;

  if (detail.isError) {
    return (
      <>
        <Seo
          title={t('jobs.applications.title')}
          description={t('jobs.applications.failed')}
          path={path}
          noindex
        />
        <div className="fab-container space-y-3 py-6 sm:py-10">
          <Alert tone="danger" title={t('jobs.applications.jobLoadFailed')}>
            <button
              type="button"
              onClick={() => void detail.refetch()}
              className="font-semibold underline"
            >
              {t('common.retry')}
            </button>
          </Alert>
          <LinkButton to={ROUTES.jobs} variant="outline" size="sm">
            {t('jobs.applications.backToJob')}
          </LinkButton>
        </div>
      </>
    );
  }

  if (detail.isNotFound || job === null) {
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

  if (!canReview) {
    return (
      <>
        <Seo title={t('jobs.applications.title')} description={job.title} path={path} noindex />
        <div className="fab-container py-6 sm:py-10">
          <EmptyState
            icon={<ShieldCheck size={22} />}
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
  const permissionDenied = isPermissionError(queue.error);
  const statusOptions = STATUS_ORDER.map((status) => ({
    value: status,
    label: `${t(`jobs.statuses.${status}`)} (${formatNumber(counts.get(status) ?? 0, language)})`,
  }));

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
            {isStaff && !isPoster ? (
              <p className="mt-1 text-xs font-medium text-blue-text">
                {t('jobs.applications.staffReview')}
              </p>
            ) : null}
          </div>
          {!queue.isError ? (
            <Badge tone="green" icon={<Users size={14} />}>
              {t('jobs.applications.liveCount', {
                total: formatNumber(
                  queue.applications.filter(
                    (application) => !['rejected', 'withdrawn'].includes(application.status),
                  ).length,
                  language,
                ),
              })}
            </Badge>
          ) : null}
        </div>

        {queue.isError ? (
          <Alert
            tone="danger"
            title={t(
              permissionDenied ? 'jobs.applications.accessDeniedTitle' : 'jobs.applications.failed',
            )}
          >
            <p>
              {t(
                permissionDenied
                  ? 'jobs.applications.accessDeniedBody'
                  : 'jobs.applications.failedBody',
              )}
            </p>
            <button
              type="button"
              onClick={() => void queue.refetch()}
              className="mt-2 font-semibold underline"
            >
              {t('common.retry')}
            </button>
          </Alert>
        ) : null}

        {!queue.isError ? (
          <>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.5fr)_minmax(12rem,0.5fr)]">
              <TextField
                label={t('jobs.applications.search')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                iconStart={<Search size={15} />}
                type="search"
              />
              <SelectField
                label={t('jobs.applications.filterLabel')}
                value={filter}
                onChange={(event) => setFilter(event.target.value as ApplicationStatus | 'all')}
                options={[
                  {
                    value: 'all',
                    label: `${t('jobs.applications.all')} (${formatNumber(queue.applications.length, language)})`,
                  },
                  ...statusOptions,
                ]}
              />
              <SelectField
                label={t('jobs.applications.sortLabel')}
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
                options={[
                  { value: 'priority', label: t('jobs.applications.sortPriority') },
                  { value: 'newest', label: t('jobs.applications.sortNewest') },
                  { value: 'oldest', label: t('jobs.applications.sortOldest') },
                ]}
              />
            </div>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={t('jobs.applications.filterLabel')}
            >
              <button
                type="button"
                aria-pressed={filter === 'all'}
                onClick={() => setFilter('all')}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${filter === 'all' ? 'border-green-700 bg-green-700 text-white' : 'border-border text-text hover:bg-surface-2'}`}
              >
                {t('jobs.applications.all')} · {formatNumber(queue.applications.length, language)}
              </button>
              {STATUS_ORDER.filter((status) => (counts.get(status) ?? 0) > 0).map((status) => (
                <button
                  key={status}
                  type="button"
                  aria-pressed={filter === status}
                  onClick={() => setFilter(status)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${filter === status ? 'border-green-700 bg-green-700 text-white' : 'border-border text-text hover:bg-surface-2'}`}
                >
                  {t(`jobs.statuses.${status}`)} · {formatNumber(counts.get(status) ?? 0, language)}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {queue.isLoading ? (
          <Card>
            <p role="status" className="text-sm text-muted">
              {t('jobs.applications.loading')}
            </p>
          </Card>
        ) : null}

        {!queue.isLoading && !queue.isError && queue.applications.length === 0 ? (
          <EmptyState
            icon={<Users size={22} />}
            title={t('jobs.applications.emptyTitle')}
            description={t('jobs.applications.emptyBody')}
          />
        ) : null}
        {!queue.isLoading &&
        !queue.isError &&
        queue.applications.length > 0 &&
        visible.length === 0 ? (
          <EmptyState
            icon={<Search size={22} />}
            title={t('jobs.applications.noMatchesTitle')}
            description={t('jobs.applications.noMatchesBody')}
          />
        ) : null}

        <ul className="grid gap-3">
          {visible.map((application) => {
            const busy = queue.decidingId === application.id;
            const live =
              application.status !== 'withdrawn' &&
              application.status !== 'rejected' &&
              application.status !== 'hired';
            const tel = safeTelephone(application.phone);
            return (
              <li key={application.id}>
                <Card className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar
                        src={application.avatarUrl ?? ''}
                        name={application.applicantName}
                        size="md"
                      />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-semibold text-text">
                          <span className="truncate">{application.applicantName}</span>
                          {application.verified ? (
                            <ShieldCheck
                              size={15}
                              aria-label={t('jobs.applications.verified')}
                              className="shrink-0 text-green-700"
                            />
                          ) : null}
                        </p>
                        {application.username ? (
                          <Link
                            to={profilePath(application.username)}
                            className="text-xs text-green-700 hover:underline"
                          >
                            @{application.username}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                    <Badge tone={STATUS_TONE[application.status]}>
                      {t(`jobs.statuses.${application.status}`)}
                    </Badge>
                  </div>

                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    <CalendarClock size={13} aria-hidden />
                    {t('jobs.applications.applied', {
                      when: formatRelativeTime(new Date(application.createdAt), language),
                    })}
                  </p>

                  <div className="grid gap-3 rounded-xl bg-surface-2 p-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                        {t('jobs.application.section.contact')}
                      </p>
                      <div className="mt-1 flex flex-col items-start gap-1 text-sm">
                        {application.phone ? (
                          <a className="text-green-700 underline" href={`tel:${tel}`}>
                            {application.phone}
                          </a>
                        ) : null}
                        {application.email ? (
                          <a
                            className="break-all text-green-700 underline"
                            href={`mailto:${application.email}`}
                          >
                            {application.email}
                          </a>
                        ) : null}
                        {!application.phone && !application.email ? (
                          <span className="text-muted">{t('jobs.applications.noContact')}</span>
                        ) : null}
                      </div>
                    </div>
                    <DetailField
                      label={t('jobs.application.location')}
                      value={application.location}
                      fallback={t('jobs.application.notProvided')}
                      icon={<MapPin size={13} />}
                    />
                    <DetailField
                      label={t('jobs.application.yearsExperience')}
                      value={
                        application.yearsExperience === null
                          ? ''
                          : t('jobs.application.years', { count: application.yearsExperience })
                      }
                      fallback={t('jobs.application.notProvided')}
                    />
                    <DetailField
                      label={t('jobs.application.education')}
                      value={application.education}
                      fallback={t('jobs.application.notProvided')}
                    />
                    <DetailField
                      label={t('jobs.application.expectedSalary')}
                      value={
                        application.expectedSalaryPoisha === null
                          ? ''
                          : formatTaka(application.expectedSalaryPoisha, language)
                      }
                      fallback={t('jobs.application.notProvided')}
                    />
                    <DetailField
                      label={t('jobs.application.noticePeriod')}
                      value={application.noticePeriod}
                      fallback={t('jobs.application.notProvided')}
                    />
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                    {application.resumeUrl ? (
                      <ExternalLink href={application.resumeUrl} userGenerated>
                        <FileText size={14} />
                        {t('jobs.applications.openResume')}
                      </ExternalLink>
                    ) : null}
                    {application.portfolioUrl ? (
                      <ExternalLink href={application.portfolioUrl} userGenerated>
                        {t('jobs.application.portfolio')}
                      </ExternalLink>
                    ) : null}
                    {application.linkedinUrl ? (
                      <ExternalLink href={application.linkedinUrl} userGenerated>
                        {t('jobs.application.linkedin')}
                      </ExternalLink>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-xs font-medium text-muted">{t('jobs.application.skills')}</p>
                    {application.skills.length > 0 ? (
                      <ul className="mt-1 flex flex-wrap gap-1">
                        {application.skills.map((skill) => (
                          <li key={skill}>
                            <Badge tone="neutral">{skill}</Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-muted">{t('jobs.application.notProvided')}</p>
                    )}
                  </div>

                  {application.certificationImageUrls.length > 0 ? (
                    <div>
                      <p className="text-xs font-medium text-muted">
                        {t('jobs.application.certifications')}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {application.certificationImageUrls.map((url) => (
                          <ExternalLink
                            key={url}
                            href={url}
                            userGenerated
                            showIcon={false}
                            className="rounded-lg"
                          >
                            <MediaImage
                              src={url}
                              alt={t('jobs.application.certificationImageAlt')}
                              width={120}
                              height={88}
                              loading="lazy"
                              className="h-20 w-28 rounded-lg border border-border object-cover"
                            />
                          </ExternalLink>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <p className="text-xs font-medium text-muted">
                      {t('jobs.applications.coverLetter')}
                    </p>
                    <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-text">
                      {application.coverLetter.trim() || t('jobs.applications.noCoverLetter')}
                    </p>
                  </div>

                  {application.rejectionReason ? (
                    <Alert tone="warning" title={t('jobs.applications.rejectionReason')}>
                      {application.rejectionReason}
                    </Alert>
                  ) : null}

                  {live ? (
                    <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                      {application.status === 'submitted' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={queue.isDeciding}
                          loading={busy}
                          onClick={() => askDecision(application, 'reviewing')}
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
                          onClick={() => askDecision(application, 'shortlisted')}
                          iconStart={<CheckCircle2 size={14} />}
                        >
                          {t('jobs.applications.shortlist')}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        disabled={queue.isDeciding}
                        loading={busy}
                        onClick={() => askDecision(application, 'hired')}
                        iconStart={<Handshake size={14} />}
                      >
                        {t('jobs.applications.hire')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={queue.isDeciding}
                        onClick={() => askDecision(application, 'rejected')}
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
        open={decision !== null}
        onClose={() => {
          if (!queue.isDeciding) setDecision(null);
        }}
        title={t('jobs.applications.confirmTitle')}
        closeLabel={t('common.cancel')}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={queue.isDeciding}
              onClick={() => setDecision(null)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant={decision?.status === 'rejected' ? 'danger' : 'primary'}
              loading={queue.isDeciding}
              disabled={
                queue.isDeciding ||
                decision === null ||
                (decision.status === 'rejected' && reason.trim().length < 3)
              }
              onClick={() => void confirmDecision()}
            >
              {decision ? t(`jobs.applications.actions.${decision.status}`) : t('common.cancel')}
            </Button>
          </div>
        }
      >
        {decision ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              {t('jobs.applications.confirmBody', {
                name: decision.application.applicantName,
                action: t(`jobs.applications.actions.${decision.status}`),
              })}
            </p>
            {decision.status === 'rejected' ? (
              <TextareaField
                label={t('jobs.applications.declineReason')}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={600}
                error={
                  reason.trim().length > 0 && reason.trim().length < 3
                    ? t('jobs.applications.reasonTooShort')
                    : undefined
                }
              />
            ) : null}
            {actionError ? (
              <Alert tone="danger" title={t('jobs.applications.decisionFailed')}>
                {actionError}
              </Alert>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function DetailField({
  label,
  value,
  fallback,
  icon,
}: {
  label: string;
  value: string;
  fallback: string;
  icon?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-1 break-words text-sm">{value || fallback}</p>
    </div>
  );
}
