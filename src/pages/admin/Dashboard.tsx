/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useTranslation } from 'react-i18next';
import {
  Users, FileText, Radio, MessageSquare, Zap, FileBadge, ShoppingBag, ShieldAlert, TrendingUp,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis,
} from 'recharts';
import { useAdminData, computeStats } from '@/hooks/useAdminData';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { formatNumber } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';

const CHART_COLORS = ['#0A8F3F', '#1877F2', '#14B8A6', '#F59E0B', '#DB2777', '#7C3AED'];

export default function AdminDashboard() {
  const { t } = useTranslation();
  const language = useUIStore((s) => s.language);
  const data = useAdminData();

  if (data.loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (data.error) return <ErrorState message={data.error} onRetry={data.refresh} />;

  const stats = computeStats(data);
  const cards = [
    { label: t('admin.totalUsers'), value: stats.totalUsers, sub: `+${stats.newUsersToday} ${t('admin.newToday')}`, icon: Users, color: 'bg-fb-50 text-fb-600 dark:bg-fb-950/50 dark:text-fb-300' },
    { label: t('admin.totalPosts'), value: stats.totalPosts, sub: `+${stats.newPostsToday} ${t('admin.newToday')}`, icon: FileText, color: 'bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-300' },
    { label: t('admin.onlineNow'), value: stats.onlineNow, icon: Radio, color: 'bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-300' },
    { label: t('admin.totalGroups'), value: stats.totalGroups, icon: Users, color: 'bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-300' },
    { label: t('admin.pointsCirculation'), value: stats.pointsInCirculation, icon: Zap, color: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300' },
    { label: t('admin.licensesIssued'), value: stats.activeLicenses, sub: `${stats.pendingLicenses} pending`, icon: FileBadge, color: 'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300' },
    { label: t('admin.listings'), value: stats.totalListings, sub: `${stats.pendingListings} pending`, icon: ShoppingBag, color: 'bg-pink-50 text-pink-600 dark:bg-pink-950/50 dark:text-pink-300' },
    { label: t('admin.openReports'), value: stats.openReports, icon: ShieldAlert, color: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-extrabold sm:text-xl">{t('admin.dashboard')}</h1>
        <Button size="sm" variant="outline" onClick={data.refresh}>
          {t('common.loading') === 'Loading…' ? 'Refresh' : 'রিফ্রেশ'}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="bsdc-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${card.color}`}>
                <card.icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} aria-hidden />
              </span>
              {card.sub ? <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-500 dark:bg-neutral-800">{card.sub}</span> : null}
            </div>
            <p className="mt-3 text-2xl font-extrabold tabular-nums">{formatNumber(card.value, language)}</p>
            <p className="mt-0.5 line-clamp-1 text-xs font-semibold text-neutral-400">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="bsdc-surface p-4" aria-label={t('admin.userGrowth')}>
          <h2 className="mb-3 text-sm font-bold">{t('admin.userGrowth')} — 30 days</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.days}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={4} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <ReTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="users" name="New users" stroke="#1877F2" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="posts" name="New posts" stroke="#0A8F3F" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bsdc-surface p-4" aria-label={t('admin.engagement')}>
          <h2 className="mb-3 text-sm font-bold">{t('admin.engagement')} — 30 days</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.days}>
                <defs>
                  <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0A8F3F" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#0A8F3F" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={4} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <ReTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Area type="monotone" dataKey="engagement" name="Engagement" stroke="#0A8F3F" fill="url(#engGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bsdc-surface p-4" aria-label={t('admin.postActivity')}>
          <h2 className="mb-3 text-sm font-bold">{t('admin.postActivity')} by type</h2>
          <div className="h-64">
            {stats.typeCounts.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-neutral-400">{t('feed.emptyTitle')}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.typeCounts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <ReTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="value" name="Posts" fill="#1877F2" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="bsdc-surface p-4" aria-label={t('admin.topTags')}>
          <h2 className="mb-3 text-sm font-bold">{t('admin.topTags')}</h2>
          <div className="h-64">
            {stats.topTags.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-neutral-400">{t('feed.emptyTitle')}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.topTags} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(entry: { name?: string }) => entry.name || ''} labelLine={false}>
                    {stats.topTags.map((entry, i) => (
                      <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <ReTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      {/* Recent activity */}
      <section className="bsdc-surface p-4" aria-label={t('admin.recentActivity')}>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
          <TrendingUp className="h-4 w-4 text-brand-600" aria-hidden />
          {t('admin.recentActivity')}
        </h2>
        {data.posts.length === 0 && data.users.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">{t('common.empty')}</p>
        ) : (
          <ul className="divide-y divide-surface-light-border text-sm dark:divide-surface-dark-border">
            {data.posts.slice(0, 12).map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-surface-dark-raised">
                  <FileText style={{ width: 14, height: 14 }} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <strong>{p.authorName}</strong> published{' '}
                  <em className="not-italic text-neutral-500">{p.title || p.body.slice(0, 60)}</em>
                </span>
                <span className="shrink-0 text-xs text-neutral-400">{p.type}</span>
              </li>
            ))}
            {data.users.slice(0, 6).map((u) => (
              <li key={u.uid} className="flex items-center gap-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fb-50 text-fb-600 dark:bg-fb-950/50">
                  <Users style={{ width: 14, height: 14 }} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <strong>{u.displayName}</strong> joined BSDC · @{u.username}
                </span>
                <span className="shrink-0 text-xs text-neutral-400">{u.provider || 'password'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="flex items-center justify-center gap-2 pb-4 text-xs text-neutral-400">
        <MessageSquare className="h-3.5 w-3.5" aria-hidden />
        All statistics are computed live from real Firestore data.
      </p>
    </div>
  );
}
