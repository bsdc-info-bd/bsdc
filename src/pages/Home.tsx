/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Clock, Flame, Rss } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useCountdown } from '@/hooks/useCountdown';
import { useAuthStore } from '@/stores/authStore';
import { PostList } from '@/components/feed/PostList';
import { StoriesRow } from '@/components/feed/StoriesRow';
import { RightRail } from '@/components/feed/RightRail';
import { SEOHead } from '@/components/seo/SEOHead';
import { organizationSchema, websiteSchema } from '@/config/seo';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { LinkButton } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { PostSort } from '@/types/post';

const QuickComposer = lazy(() => import('@/components/feed/QuickComposer'));

export default function Home() {
  const { t } = useTranslation();
  const activeFeed = useUIStore((s) => s.activeFeed);
  const setActiveFeed = useUIStore((s) => s.setActiveFeed);
  const settings = useUIStore((s) => s.systemSettings);
  const profile = useAuthStore((s) => s.profile);
  const countdown = useCountdown(settings.launchDate);

  const prelaunch = settings.preLaunchMode && settings.launchDate !== null && !countdown.expired;

  return (
    <>
      <SEOHead
        title={t('seo.homeTitle')}
        description={t('seo.homeDesc')}
        keywords={['bangladesh developers', 'software community bangladesh', 'bd developers', 'programming bangladesh', 'BSDC']}
        path="/"
        ogImage={undefined}
        jsonLd={[websiteSchema(), organizationSchema()]}
      />
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          {prelaunch ? <LaunchCountdown target={settings.launchDate} /> : null}

          {profile ? (
            <>
              <StoriesRow />
              <div className="mb-4 lg:hidden">
                <Suspense fallback={null}>
                  <QuickComposer />
                </Suspense>
              </div>
            </>
          ) : null}

          <Tabs value={activeFeed} onValueChange={(v) => setActiveFeed(v as PostSort)}>
            <div className="bsdc-surface mb-4 flex items-center justify-between gap-2 p-2">
              <TabsList>
                <TabsTrigger value="forYou" icon={<Sparkles className="h-4 w-4" aria-hidden />}>
                  <span className="hidden min-[380px]:inline">{t('feed.forYou')}</span>
                </TabsTrigger>
                <TabsTrigger value="latest" icon={<Clock className="h-4 w-4" aria-hidden />}>
                  <span className="hidden min-[380px]:inline">{t('feed.latest')}</span>
                </TabsTrigger>
                <TabsTrigger value="trending" icon={<Flame className="h-4 w-4" aria-hidden />}>
                  <span className="hidden min-[380px]:inline">{t('feed.trending')}</span>
                </TabsTrigger>
                {profile ? (
                  <TabsTrigger value="following">
                    <span className="hidden min-[380px]:inline">{t('feed.following')}</span>
                  </TabsTrigger>
                ) : null}
              </TabsList>
              <LinkButton to="/feed" variant="ghost" size="xs" icon={<Rss className="h-3.5 w-3.5" aria-hidden />} className="hidden sm:inline-flex">
                RSS
              </LinkButton>
            </div>
          </Tabs>

          <PostList
            sort={activeFeed}
            emptyTitle={activeFeed === 'following' ? undefined : t('feed.emptyTitle')}
            emptyBody={activeFeed === 'following' ? t('feed.emptyFollowing') : t('feed.emptyBody')}
          />
        </div>
        <RightRail />
      </div>
    </>
  );
}

function LaunchCountdown({ target }: { target: number | null }) {
  const { t } = useTranslation();
  const { days, hours, minutes, seconds, expired } = useCountdown(target);
  const cells = [
    { value: days, label: t('launch.days') },
    { value: hours, label: t('launch.hours') },
    { value: minutes, label: t('launch.minutes') },
    { value: seconds, label: t('launch.seconds') },
  ];
  return (
    <section className="bsdc-surface bsdc-fabric-hero relative mb-4 overflow-hidden p-6 text-center sm:p-10" aria-label={t('launch.title')}>
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-600 dark:text-brand-400">{t('launch.title')}</p>
      <h1 className="mx-auto mt-2 max-w-xl text-xl font-extrabold leading-tight sm:text-3xl">
        {expired ? t('launch.weAreLive') : t('launch.subtitle')}
      </h1>
      {!expired ? (
        <div className="mx-auto mt-6 grid max-w-lg grid-cols-4 gap-2 sm:gap-3" role="timer" aria-live="off">
          {cells.map((cell) => (
            <div key={cell.label} className="rounded-xl border border-brand-100 bg-white/80 py-3 shadow-card dark:border-brand-900 dark:bg-surface-dark-raised/80">
              <p className={cn('text-2xl font-extrabold tabular-nums text-brand-700 dark:text-brand-300 sm:text-3xl', cell.label === t('launch.seconds') && 'animate-countdown-tick')}>
                {String(cell.value).padStart(2, '0')}
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{cell.label}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5">
          <LinkButton to="/explore" variant="gradient">{t('launch.exploreNow')}</LinkButton>
        </div>
      )}
      <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">{t('common.tagline')}</p>
    </section>
  );
}
