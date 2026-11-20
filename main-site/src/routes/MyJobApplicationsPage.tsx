import { Briefcase, CalendarClock, FileText, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MediaImage } from '@/components/media/MediaImage';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  ExternalLink,
  LinkButton,
  PageSkeleton,
} from '@/design-system';
import { useMyJobApplications } from '@/hooks/use-opportunities';
import { formatRelativeTime } from '@/lib/format';
import { formatTaka } from '@/lib/mk/mk-logic';
import type { MyJobApplication } from '@/lib/opportunities/opportunity-types';
import { ROUTES, jobPath } from '@/lib/site';

const STATUS_TONE = {
  submitted: 'blue',
  reviewing: 'warn',
  shortlisted: 'green',
  hired: 'green',
  rejected: 'danger',
  withdrawn: 'neutral',
} as const;

export default function MyJobApplicationsPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const tracker = useMyJobApplications(true);

  return (
    <>
      <Seo
        title={t('jobs.myApplications.title')}
        description={t('jobs.myApplications.description')}
        path={ROUTES.myJobApplications}
        noindex
      />
      <div className="fab-container space-y-4 py-6 sm:py-10">
        <div>
          <h1 className="text-2xl font-bold">{t('jobs.myApplications.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('jobs.myApplications.description')}</p>
        </div>

        {tracker.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {tracker.isError ? (
          <Alert tone="danger" title={t('jobs.myApplications.failed')}>
            <button
              type="button"
              onClick={() => void tracker.refetch()}
              className="font-semibold underline"
            >
              {t('common.retry')}
            </button>
          </Alert>
        ) : null}
        {!tracker.isLoading && !tracker.isError && tracker.applications.length === 0 ? (
          <EmptyState
            icon={<Briefcase size={22} />}
            title={t('jobs.myApplications.emptyTitle')}
            description={t('jobs.myApplications.emptyBody')}
            action={
              <LinkButton to={ROUTES.jobs} size="sm">
                {t('jobs.myApplications.browse')}
              </LinkButton>
            }
          />
        ) : null}

        {!tracker.isLoading && !tracker.isError && tracker.applications.length > 0 ? (
          <ul className="grid gap-3">
            {tracker.applications.map((application) => (
              <li key={application.id}>
                <ApplicationHistoryCard application={application} language={language} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </>
  );
}

function ApplicationHistoryCard({
  application,
  language,
}: {
  application: MyJobApplication;
  language: 'en' | 'bn';
}) {
  const { t } = useTranslation();
  const status = application.status;
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">
            <Link to={jobPath(application.jobSlug)} className="hover:underline">
              {application.jobTitle}
            </Link>
          </h2>
          <p className="mt-1 text-sm text-muted">{application.company}</p>
        </div>
        <Badge tone={STATUS_TONE[status]}>{t(`jobs.statuses.${status}`)}</Badge>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted">
        <CalendarClock size={13} aria-hidden />
        {t('jobs.myApplications.applied', {
          when: formatRelativeTime(new Date(application.createdAt), language),
        })}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Detail
          label={t('jobs.application.location')}
          value={application.location}
          fallback={t('jobs.application.notProvided')}
          icon={<MapPin size={13} />}
        />
        <Detail
          label={t('jobs.application.yearsExperience')}
          value={
            application.yearsExperience === null
              ? ''
              : t('jobs.application.years', { count: application.yearsExperience })
          }
          fallback={t('jobs.application.notProvided')}
        />
        <Detail
          label={t('jobs.application.education')}
          value={application.education}
          fallback={t('jobs.application.notProvided')}
        />
        <Detail
          label={t('jobs.application.expectedSalary')}
          value={
            application.expectedSalaryPoisha === null
              ? ''
              : formatTaka(application.expectedSalaryPoisha, language)
          }
          fallback={t('jobs.application.notProvided')}
        />
        <Detail
          label={t('jobs.application.noticePeriod')}
          value={application.noticePeriod}
          fallback={t('jobs.application.notProvided')}
        />
      </div>

      {application.rejectionReason ? (
        <Alert tone="warning" title={t('jobs.myApplications.rejectionReason')}>
          {application.rejectionReason}
        </Alert>
      ) : null}

      {application.skills.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-muted">{t('jobs.application.skills')}</p>
          <p className="mt-1 text-sm">{application.skills.join(' · ')}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {application.resumeUrl ? (
          <ExternalLink href={application.resumeUrl} userGenerated>
            <FileText size={14} />
            {t('jobs.application.resume')}
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

      {application.certificationImageUrls.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-muted">{t('jobs.application.certifications')}</p>
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

      <p className="text-xs text-muted">{t('jobs.myApplications.contactPrivacy')}</p>
    </Card>
  );
}

function Detail({
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
    <div>
      <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-1 break-words text-sm">{value || fallback}</p>
    </div>
  );
}
