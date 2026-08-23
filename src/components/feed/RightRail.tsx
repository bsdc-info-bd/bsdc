/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Hash, TrendingUp, UserPlus, CalendarDays, Check, Plus } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { VerifiedBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { followUser, fetchActiveUsers, fetchFollowerIds, fetchFollowingIds, fetchPopularTags } from '@/lib/data';
import { suggestUsers } from '@/lib/feed-algorithm';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { formatNumber } from '@/lib/utils';
import type { UserProfile } from '@/types/user';
import type { CommunityEvent } from '@/types/domain';
import { fetchEvents } from '@/lib/data';

/** Community highlights rail — trending tags, who-to-follow (computed on real data), upcoming events. */
export function RightRail() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const language = useUIStore((s) => s.language);
  const [tags, setTags] = useState<{ name: string; postCount: number }[]>([]);
  const [suggestions, setSuggestions] = useState<{ user: UserProfile; reason: string }[]>([]);
  const [events, setEvents] = useState<(CommunityEvent & { id: string })[]>([]);
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tagList, users, eventList, myFollowing, myFollowers] = await Promise.all([
          fetchPopularTags(8).catch(() => []),
          fetchActiveUsers(60).catch(() => [] as UserProfile[]),
          fetchEvents(20).catch(() => []),
          profile ? fetchFollowingIds(profile.uid, 200).catch(() => [] as string[]) : Promise.resolve([] as string[]),
          profile ? fetchFollowerIds(profile.uid, 200).catch(() => [] as string[]) : Promise.resolve([] as string[]),
        ]);
        if (cancelled) return;
        setTags(tagList);
        setEvents(eventList.filter((e) => e.startsAt > Date.now()).slice(0, 3));
        if (profile) {
          setSuggestions(
            suggestUsers(users, profile, new Set(myFollowing), new Set(myFollowers), 4).map((s) => ({ user: s.user, reason: s.reason })),
          );
        }
      } catch {
        /* rail degrades silently */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  async function handleFollow(target: UserProfile) {
    if (!profile) return;
    setFollowed((prev) => new Set([...prev, target.uid]));
    try {
      await followUser(profile, target);
    } catch {
      setFollowed((prev) => {
        const next = new Set(prev);
        next.delete(target.uid);
        return next;
      });
    }
  }

  return (
    <aside className="sticky top-20 hidden max-h-[calc(100dvh-6rem)] w-80 shrink-0 space-y-4 overflow-y-auto py-1 pl-4 xl:block" aria-label={t('common.seeAll')}>
      {tags.length > 0 ? (
        <section className="bsdc-surface p-4" aria-label={t('feed.trendingTags')}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <TrendingUp className="h-4 w-4 text-brand-600" aria-hidden />
            {t('feed.trendingTags')}
          </h2>
          <ul className="space-y-2">
            {tags.map((tag) => (
              <li key={tag.name}>
                <Link to={`/tag/${encodeURIComponent(tag.name)}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-neutral-50 dark:hover:bg-surface-dark-raised">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
                    <Hash className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{tag.name}</span>
                    <span className="block text-xs text-neutral-400">{formatNumber(tag.postCount, language)} posts</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {profile && suggestions.length > 0 ? (
        <section className="bsdc-surface p-4" aria-label={t('feed.whoToFollow')}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <UserPlus className="h-4 w-4 text-brand-600" aria-hidden />
            {t('feed.whoToFollow')}
          </h2>
          <ul className="space-y-3">
            {suggestions.map(({ user, reason }) => (
              <li key={user.uid} className="flex items-center gap-2.5">
                <Link to={`/p/${user.username}`} className="shrink-0">
                  <Avatar src={user.avatar} name={user.displayName} size={38} />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to={`/p/${user.username}`} className="flex items-center gap-1">
                    <span className="truncate text-sm font-semibold hover:underline">{user.displayName}</span>
                    {user.isVerified ? <VerifiedBadge size={13} /> : null}
                  </Link>
                  <p className="truncate text-xs text-neutral-400">{reason}</p>
                </div>
                {followed.has(user.uid) ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-brand-600">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    {t('common.following')}
                  </span>
                ) : (
                  <Button size="xs" variant="subtle" icon={<Plus className="h-3.5 w-3.5" aria-hidden />} onClick={() => void handleFollow(user)}>
                    {t('common.follow')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {events.length > 0 ? (
        <section className="bsdc-surface p-4" aria-label={t('feed.upcomingEvents')}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <CalendarDays className="h-4 w-4 text-brand-600" aria-hidden />
            {t('feed.upcomingEvents')}
          </h2>
          <ul className="space-y-2.5">
            {events.map((event) => (
              <li key={event.id}>
                <Link to="/events" className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-neutral-50 dark:hover:bg-surface-dark-raised">
                  <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-fb-50 text-fb-700 dark:bg-fb-950/60 dark:text-fb-300">
                    <span className="text-[9px] font-bold uppercase">{new Date(event.startsAt).toLocaleString('en', { month: 'short' })}</span>
                    <span className="text-sm font-extrabold leading-none">{new Date(event.startsAt).getDate()}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{event.title}</span>
                    <span className="block text-xs text-neutral-400">
                      {formatNumber(event.goingCount, language)} {t('events.going')}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}
