import { Activity, FileText, Flag, Megaphone, Puzzle, Store, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo/Seo';
import { Alert, Card, LinkButton, PageSkeleton, SectionHeading, StatCard } from '@/design-system';
import { useAdminOverview, useAuditLog, usePermissions } from '@/hooks/use-admin';
import { hasAnyPermission } from '@/lib/admin/admin-types';
import { formatAbsoluteDate, formatNumber } from '@/lib/format';
import { ROUTES } from '@/lib/site';

/** The admin landing page: what needs attention, and who did what. */
export default function AdminPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const { permissions, isLoading: permissionsLoading } = usePermissions();

  const allowed = hasAnyPermission(permissions, ['moderation.read', 'plugins.read', 'people.read']);
  const { overview, isLoading } = useAdminOverview(allowed);
  const audit = useAuditLog(permissions.includes('audit.read'));

  return (
    <>
      <Seo
        title={t('admin.metaTitle')}
        description={t('admin.metaDescription')}
        path={ROUTES.admin}
        noindex
      />

      <div className="fab-container max-w-5xl py-6 sm:py-10">
        <SectionHeading title={t('admin.title')} description={t('admin.description')} />

        {permissionsLoading ? <PageSkeleton label={t('common.loading')} /> : null}

        {!permissionsLoading && !allowed ? (
          <Alert tone="warning" title={t('admin.denied')} className="mt-4">
            {t('admin.deniedBody')}
          </Alert>
        ) : null}

        {allowed ? (
          <>
            {isLoading ? <PageSkeleton label={t('common.loading')} /> : null}

            {overview !== null ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  icon={<Users size={16} />}
                  label={t('admin.members')}
                  value={formatNumber(overview.membersTotal, language)}
                  hint={t('admin.today', {
                    total: formatNumber(overview.membersToday, language),
                  })}
                />
                <StatCard
                  icon={<FileText size={16} />}
                  label={t('admin.posts')}
                  value={formatNumber(overview.postsTotal, language)}
                  hint={t('admin.today', { total: formatNumber(overview.postsToday, language) })}
                />
                <StatCard
                  icon={<Flag size={16} />}
                  label={t('admin.openReports')}
                  value={formatNumber(overview.openReports, language)}
                />
                <StatCard
                  icon={<Puzzle size={16} />}
                  label={t('admin.pluginsOn')}
                  value={`${formatNumber(overview.pluginsEnabled, language)} / ${formatNumber(
                    overview.pluginsTotal,
                    language,
                  )}`}
                />
                <StatCard
                  icon={<Store size={16} />}
                  label={t('admin.shopsPending')}
                  value={formatNumber(overview.shopsPending, language)}
                />
                <StatCard
                  icon={<Megaphone size={16} />}
                  label={t('admin.campaignsPending')}
                  value={formatNumber(overview.campaignsPending, language)}
                />
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {permissions.includes('moderation.read') ? (
                <LinkButton to={ROUTES.adminModeration}>{t('admin.goModeration')}</LinkButton>
              ) : null}
              {permissions.includes('plugins.read') ? (
                <LinkButton to={ROUTES.adminPlugins} variant="secondary">
                  {t('admin.goPlugins')}
                </LinkButton>
              ) : null}
              {permissions.includes('people.read') ? (
                <LinkButton to={ROUTES.adminPeople} variant="secondary">
                  {t('admin.goPeople')}
                </LinkButton>
              ) : null}
            </div>

            {permissions.includes('audit.read') ? (
              <Card className="mt-6">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Activity size={18} aria-hidden="true" />
                  {t('admin.auditTitle')}
                </h2>
                <p className="mt-1 text-sm text-muted">{t('admin.auditBody')}</p>
                <ul className="mt-3 grid gap-2">
                  {audit.entries.slice(0, 25).map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 last:border-0"
                    >
                      <span className="font-mono text-sm">{entry.action}</span>
                      <span className="fab-truncate text-xs text-muted">
                        {entry.subject.length > 0 ? entry.subject : '—'} ·{' '}
                        {formatAbsoluteDate(new Date(entry.createdAt), language)}
                      </span>
                    </li>
                  ))}
                </ul>
                {audit.entries.length === 0 && !audit.isLoading ? (
                  <p className="mt-3 text-sm text-muted">{t('admin.auditEmpty')}</p>
                ) : null}
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}
