/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Hash, TrendingUp, UserPlus, CalendarDays, Check, Plus, MapPin, Sparkles } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { VerifiedBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { followUser, fetchActiveUsers, fetchFollowerIds, fetchFollowingIds, fetchPopularTags } from '@/lib/data';
import { suggestUsers } from '@/lib/feed-algorithm';
import { haversineKm } from '@/lib/geo';
import { useSuggestions } from '@/lib/suggestionStore';
import { POST_TYPE_META } from './postMeta';
import { Link as RouterLink } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { formatNumber } from '@/lib/utils';
import type { UserProfile } from '@/types/user';
import type { CommunityEvent } from '@/types/domain';
import { fetchEvents } from '@/lib/data';

/** Community highlights rail — trending tags, who-to-follow (computed on real data), upcoming events. */
export function RightRail() {
  const { t } = useTranslation();
  const engineSuggestions = useSuggestions();
  const suggestedPosts = engineSuggestions?.posts || [];
  const profile = useAuthStore((s) => s.profile);
  const language = useUIStore((s) => s.language);
  const [tags, setTags] = useState<{ name: string; postCount: number }[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
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
        setUsers(users);
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

      {profile?.geo
        ? (() => {
            const nearby = users
              .filter((u) => u.uid !== profile.uid && u.geo)
              .map((u) => ({ user: u, km: haversineKm(profile.geo!, u.geo!) }))
              .sort((a, b) => a.km - b.km)
              .slice(0, 3);
            if (nearby.length === 0) return null;
            return (
              <section className="bsdc-surface p-4" aria-label={t('feed.nearbyDevs')}>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <MapPin className="h-4 w-4 text-brand-600" aria-hidden />
                  {t('feed.nearbyDevs')}
                </h2>
                <ul className="space-y-3">
                  {nearby.map(({ user, km }) => (
                    <li key={user.uid} className="flex items-center gap-2.5">
                      <Link to={`/p/${user.username}`} className="shrink-0">
                        <Avatar src={user.avatar} name={user.displayName} size={36} />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link to={`/p/${user.username}`} className="block truncate text-sm font-semibold hover:underline">{user.displayName}</Link>
                        <p className="truncate text-xs text-neutral-400">{user.location || 'Bangladesh'}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
                        {km < 1 ? '<1' : Math.round(km)} km
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })()
        : null}

      {suggestedPosts.length > 0 ? (
        <section className="bsdc-surface p-4" aria-label={t('feed.suggestedPosts')}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Sparkles className="h-4 w-4 text-brand-600" aria-hidden />
            {t('feed.suggestedPosts')}
          </h2>
          <ul className="space-y-2.5">
            {suggestedPosts.slice(0, 4).map((p) => {
              const meta = POST_TYPE_META[p.type] || POST_TYPE_META.text;
              return (
                <li key={p.id}>
                  <RouterLink
                    to={`/${p.type === 'snippet' ? 'snippet' : p.type === 'text' || p.type === 'image' || p.type === 'poll' ? 'post' : p.type}/${p.slug}`}
                    className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-neutral-50 dark:hover:bg-surface-dark-raised"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${meta.color}18`, color: meta.color }}>
                      <meta.icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{p.title || p.body.slice(0, 48)}</span>
                      <span className="block truncate text-xs text-neutral-400">@{p.authorUsername} · {p.reactionTotal + p.commentCount} engagements</span>
                    </span>
                  </RouterLink>
                </li>
              );
            })}
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
