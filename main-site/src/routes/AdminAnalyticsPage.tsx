import { BarChart3, FileText, TrendingUp, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Card,
  LinkButton,
  PageSkeleton,
  SectionHeading,
  SelectField,
  StatCard,
} from '@/design-system';
import { usePermissions } from '@/hooks/use-admin';
import { useAnalytics } from '@/hooks/use-analytics';
import {
  average,
  retentionGrid,
  sparklinePath,
  sum,
  toCsv,
  trendPercent,
} from '@/lib/analytics/analytics-types';
import { formatNumber } from '@/lib/format';
import { formatMoney } from '@/lib/market/market-types';
import { ROUTES } from '@/lib/site';

const WINDOWS = [7, 14, 30, 90, 180];

function Sparkline({ values, label }: { values: number[]; label: string }) {
  return (
    <svg
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className="h-8 w-full text-green-700"
    >
      <polyline
        points={sparklinePath(values)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Platform analytics: growth, money, moderation health and retention. */
export default function AdminAnalyticsPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const { permissions, isLoading: permissionsLoading } = usePermissions();
  const allowed = permissions.includes('moderation.read');
  const analytics = useAnalytics(allowed);

  const members = analytics.growth.map((point) => point.newMembers);
  const posts = analytics.growth.map((point) => point.newPosts);
  const platform = analytics.revenue.map((point) => point.platformTotal);
  const grid = retentionGrid(analytics.retention);

  function exportCsv(): void {
    const csv = toCsv(
      ['day', 'new_members', 'new_posts', 'active_members'],
      analytics.growth.map((point) => [
        point.day,
        point.newMembers,
        point.newPosts,
        point.activeMembers,
      ]),
    );
    void import('@/lib/reports/report-builder').then((module) => {
      module.downloadCsv(csv, `bsdc-growth-${String(analytics.days)}d.csv`);
    });
  }

  return (
    <>
      <Seo
        title={t('analytics.metaTitle')}
        description={t('analytics.metaDescription')}
        path={ROUTES.adminAnalytics}
        noindex
      />

      <div className="fab-container max-w-5xl py-6 sm:py-10">
        <SectionHeading title={t('analytics.title')} description={t('analytics.description')} />

        {permissionsLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {!permissionsLoading && !allowed ? (
          <Alert tone="warning" title={t('admin.denied')} className="mt-4" />
        ) : null}

        {allowed ? (
          <>
            <Card className="mt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label={t('analytics.window')}
                  value={String(analytics.days)}
                  options={WINDOWS.map((days) => ({
                    value: String(days),
                    label: t('analytics.days', { total: formatNumber(days, language) }),
                  }))}
                  onChange={(event) => {
                    analytics.setDays(Number.parseInt(event.target.value, 10));
                  }}
                />
                <div className="flex items-end gap-2">
                  <LinkButton to={ROUTES.adminReports} variant="secondary">
                    {t('analytics.goReports')}
                  </LinkButton>
                  <button
                    type="button"
                    onClick={exportCsv}
                    className="rounded-control border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
                  >
                    {t('analytics.exportCsv')}
                  </button>
                </div>
              </div>
            </Card>

            {analytics.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
            {analytics.isError ? (
              <Alert tone="danger" title={t('analytics.failed')} className="mt-4" />
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={<Users size={16} />}
                label={t('analytics.newMembers')}
                value={formatNumber(sum(members), language)}
                hint={t('analytics.trend', { value: trendPercent(members) ?? 0 })}
              />
              <StatCard
                icon={<FileText size={16} />}
                label={t('analytics.newPosts')}
                value={formatNumber(sum(posts), language)}
                hint={t('analytics.trend', { value: trendPercent(posts) ?? 0 })}
              />
              <StatCard
                icon={<TrendingUp size={16} />}
                label={t('analytics.platformRevenue')}
                value={formatMoney(sum(platform), 'BDT', language)}
                hint={t('analytics.turnover', {
                  amount: formatMoney(
                    sum(analytics.revenue.map((point) => point.grossSales)),
                    'BDT',
                    language,
                  ),
                })}
              />
              <StatCard
                icon={<BarChart3 size={16} />}
                label={t('analytics.activeDaily')}
                value={formatNumber(
                  average(analytics.growth.map((point) => point.activeMembers)),
                  language,
                )}
              />
            </div>

            <Card className="mt-4">
              <h2 className="text-lg font-semibold">{t('analytics.growthTitle')}</h2>
              <p className="mt-1 text-sm text-muted">{t('analytics.growthBody')}</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {t('analytics.newMembers')}
                  </p>
                  <Sparkline values={members} label={t('analytics.newMembers')} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {t('analytics.newPosts')}
                  </p>
                  <Sparkline values={posts} label={t('analytics.newPosts')} />
                </div>
              </div>
            </Card>

            <Card className="mt-4">
              <h2 className="text-lg font-semibold">{t('analytics.moderationTitle')}</h2>
              <p className="mt-1 text-sm text-muted">{t('analytics.moderationBody')}</p>
              <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted">{t('analytics.reportsOpened')}</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {formatNumber(
                      sum(analytics.moderation.map((point) => point.reportsOpened)),
                      language,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('analytics.reportsResolved')}</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {formatNumber(
                      sum(analytics.moderation.map((point) => point.reportsResolved)),
                      language,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('analytics.medianHours')}</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {formatNumber(
                      average(
                        analytics.moderation
                          .map((point) => point.medianHours)
                          .filter((value) => value > 0),
                      ),
                      language,
                    )}
                  </dd>
                </div>
              </dl>
            </Card>

            {grid.length > 0 ? (
              <Card className="mt-4 overflow-x-auto">
                <h2 className="text-lg font-semibold">{t('analytics.retentionTitle')}</h2>
                <p className="mt-1 text-sm text-muted">{t('analytics.retentionBody')}</p>
                <table className="mt-3 w-full min-w-[32rem] border-collapse text-sm">
                  <caption className="sr-only">{t('analytics.retentionTitle')}</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="p-2 text-start text-xs text-muted">
                        {t('analytics.cohort')}
                      </th>
                      <th scope="col" className="p-2 text-start text-xs text-muted">
                        {t('analytics.cohortSize')}
                      </th>
                      {(grid[0]?.weeks ?? []).map((_, index) => (
                        <th
                          key={index}
                          scope="col"
                          className="p-2 text-end text-xs text-muted tabular-nums"
                        >
                          {t('analytics.weekShort', { total: index })}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.map((row) => (
                      <tr key={row.cohortWeek} className="border-t border-border">
                        <th scope="row" className="p-2 text-start font-medium">
                          {row.cohortWeek}
                        </th>
                        <td className="p-2 tabular-nums">
                          {formatNumber(row.cohortSize, language)}
                        </td>
                        {row.weeks.map((value, index) => (
                          <td key={index} className="p-2 text-end tabular-nums">
                            {value === null ? '—' : `${String(value)}%`}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ) : null}

            {analytics.topContent.length > 0 ? (
              <Card className="mt-4">
                <h2 className="text-lg font-semibold">{t('analytics.topTitle')}</h2>
                <ol className="mt-3 grid gap-2">
                  {analytics.topContent.map((post, index) => (
                    <li
                      key={post.postId}
                      className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 last:border-0"
                    >
                      <span className="min-w-0">
                        <span className="text-muted">{index + 1}. </span>
                        <span className="font-medium">{post.title}</span>
                      </span>
                      <span className="text-xs text-muted tabular-nums">
                        {t('analytics.engagement', {
                          likes: formatNumber(post.likesCount, language),
                          comments: formatNumber(post.commentsCount, language),
                        })}
                      </span>
                    </li>
                  ))}
                </ol>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}
