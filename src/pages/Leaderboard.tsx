/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Trophy, Zap, Crown, Medal, Award } from 'lucide-react';
import { getLeaderboard, levelOf } from '@/lib/points';
import { Avatar } from '@/components/ui/Avatar';
import { VerifiedBadge } from '@/components/ui/Badge';
import { SEOHead, Breadcrumbs } from '@/components/seo/SEOHead';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';

type BoardUser = { uid: string; displayName: string; username: string; avatar: string; bsdcPoints: number; isVerified: boolean };

export default function Leaderboard() {
  const { t } = useTranslation();
  const language = useUIStore((s) => s.language);
  const [users, setUsers] = useState<BoardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<'weekly' | 'monthly' | 'allTime'>('allTime');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLeaderboard(50)
      .then((list) => !cancelled && setUsers(list))
      .catch(() => !cancelled && setUsers([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const podium = users.slice(0, 3);
  const rest = users.slice(3);

  return (
    <>
      <SEOHead title="Developer Leaderboard — BSDC" description="The most active developers in the Bangladesh Software Development Community, ranked by BSDC points." path="/leaderboard" />
      <div className="mx-auto max-w-2xl">
        <Breadcrumbs items={[{ name: 'BSDC', path: '/' }, { name: t('leaderboard.title'), path: '/leaderboard' }]} />
        <h1 className="mb-1 flex items-center gap-2 text-xl font-extrabold sm:text-2xl">
          <Trophy className="h-6 w-6 text-amber-500" aria-hidden />
          {t('leaderboard.title')}
        </h1>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">{t('leaderboard.top')}</p>

        <Tabs value={scope} onValueChange={(v) => setScope(v as 'weekly' | 'monthly' | 'allTime')}>
          <div className="bsdc-surface mb-4 p-2">
            <TabsList>
              <TabsTrigger value="weekly">{t('leaderboard.weekly')}</TabsTrigger>
              <TabsTrigger value="monthly">{t('leaderboard.monthly')}</TabsTrigger>
              <TabsTrigger value="allTime">{t('leaderboard.allTime')}</TabsTrigger>
            </TabsList>
          </div>
        </Tabs>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <EmptyState title={t('leaderboard.empty')} body={t('feed.emptyBody')} icon={<Trophy className="h-16 w-16" aria-hidden />} />
        ) : (
          <>
            {podium.length >= 1 ? (
              <div className="mb-6 grid grid-cols-3 items-end gap-2 sm:gap-4">
                {[podium[1], podium[0], podium[2]].filter(Boolean).map((user) => {
                  const rank = user === podium[0] ? 1 : user === podium[1] ? 2 : 3;
                  return (
                    <div key={user.uid} className={cn('flex flex-col items-center', rank === 1 ? 'pb-0' : 'pb-4')}>
                      {rank === 1 ? <Crown className="mb-1 h-6 w-6 text-amber-500" aria-hidden /> : null}
                      <Link to={`/p/${user.username}`}>
                        <Avatar src={user.avatar} name={user.displayName} size={rank === 1 ? 72 : 54} ring={rank === 1} />
                      </Link>
                      <Link to={`/p/${user.username}`} className="mt-1.5 flex max-w-full items-center gap-1 truncate text-xs font-bold hover:underline sm:text-sm">
                        <span className="max-w-20 truncate">{user.displayName}</span>
                        {user.isVerified ? <VerifiedBadge size={11} /> : null}
                      </Link>
                      <p className="text-[11px] text-neutral-400">{levelOf(user.bsdcPoints).name}</p>
                      <p className={cn('mt-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold', rank === 1 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' : rank === 2 ? 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200' : 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300')}>
                        {formatNumber(user.bsdcPoints, language)}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <ol className="space-y-2">
              {rest.map((user, i) => (
                <li key={user.uid}>
                  <Link to={`/p/${user.username}`} className="bsdc-surface flex items-center gap-3 p-3 hover:bg-neutral-50 dark:hover:bg-surface-dark-raised/60">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm font-extrabold text-neutral-500 dark:bg-surface-dark-raised dark:text-neutral-300">
                      {i + 4}
                    </span>
                    <Avatar src={user.avatar} name={user.displayName} size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <span className="truncate text-sm font-bold">{user.displayName}</span>
                        {user.isVerified ? <VerifiedBadge size={12} /> : null}
                      </span>
                      <span className="block truncate text-xs text-neutral-400">@{user.username} · {levelOf(user.bsdcPoints).name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-sm font-extrabold text-brand-600 dark:text-brand-400">
                      <Zap className="h-4 w-4" aria-hidden />
                      {formatNumber(user.bsdcPoints, language)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
            <p className="mt-6 flex items-center justify-center gap-2 text-xs text-neutral-400">
              <Medal className="h-4 w-4" aria-hidden />
              <Award className="h-4 w-4" aria-hidden />
              Earn BSDC points to climb the board
            </p>
          </>
        )}
      </div>
    </>
  );
}
