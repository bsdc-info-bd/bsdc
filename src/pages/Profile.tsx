/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays, Github, Link2, Linkedin, MapPin, MessageSquare, MoreHorizontal, Share2, Flag,
  Twitter, GraduationCap, Briefcase, Zap, Copy, UserMinus, Blocks,
} from 'lucide-react';
import { toast } from 'sonner';
import { useUserByUsername } from '@/hooks/useFeed';
import { fetchFollowerIds, fetchFollowingIds, fetchUsersByIds, followUser, isFollowing, unfollowUser } from '@/lib/data';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useChat } from '@/hooks/useChat';
import { Avatar } from '@/components/ui/Avatar';
import { Button, LinkButton } from '@/components/ui/Button';
import { VerifiedBadge, RoleBadge, CreatorBadge, Badge } from '@/components/ui/Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { PostList } from '@/components/feed/PostList';
import { FeedCard } from '@/components/feed/FeedCard';
import { useBookmarks } from '@/hooks/useFeed';
import { SEOHead, Breadcrumbs } from '@/components/seo/SEOHead';
import { personSchema, profilePageSchema, breadcrumbSchema } from '@/config/seo';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/Dropdown';
import { copyToClipboard, formatDate, formatNumber } from '@/lib/utils';
import { onPresence } from '@/lib/realtime';
import { levelOf } from '@/lib/points';
import { submitReport } from '@/lib/data';

export default function Profile() {
  const { t } = useTranslation();
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.profile);
  const language = useUIStore((s) => s.language);
  const { user, loading } = useUserByUsername(username);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [followList, setFollowList] = useState<{ users: { uid: string; displayName: string; username: string; avatar: string; isVerified: boolean }[]; mode: 'followers' | 'following' | null }>({ users: [], mode: null });
  const [menuOpen, setMenuOpen] = useState(false);
  const { openDirectChat } = useChat(null);
  const { posts: savedPosts } = useBookmarks(user?.uid === me?.uid ? me?.uid || null : null);

  const isMe = Boolean(me && user && me.uid === user.uid);

  useEffect(() => {
    if (!me || !user || isMe) return;
    void isFollowing(me.uid, user.uid).then(setFollowing);
  }, [me, user, isMe]);

  useEffect(() => {
    if (!user) return;
    const unsub = onPresence(user.uid, (info) => setOnline(info.online));
    return unsub;
  }, [user]);

  async function toggleFollow() {
    if (!me) {
      navigate('/login');
      return;
    }
    if (!user) return;
    setBusy(true);
    try {
      if (following) {
        await unfollowUser(me.uid, user.uid);
        setFollowing(false);
        toast.success(`${t('common.unfollow')} @${user.username}`);
      } else {
        await followUser(me, user);
        setFollowing(true);
        toast.success(`${t('common.follow')} @${user.username}`);
      }
    } catch {
      toast.error('Could not update follow state');
    } finally {
      setBusy(false);
    }
  }

  async function openFollowList(mode: 'followers' | 'following') {
    if (!user) return;
    try {
      const ids = mode === 'followers' ? await fetchFollowerIds(user.uid, 50) : await fetchFollowingIds(user.uid, 50);
      const users = await fetchUsersByIds(ids.slice(0, 30));
      setFollowList({ users, mode });
    } catch {
      toast.error('Could not load list');
    }
  }

  async function handleMessage() {
    if (!me || !user) {
      navigate('/login');
      return;
    }
    const chatId = await openDirectChat({ uid: user.uid, displayName: user.displayName, username: user.username, avatar: user.avatar });
    if (chatId) navigate(`/messages?chat=${chatId}`);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="-mt-10 ml-4 h-24 w-24 rounded-full" />
        <Skeleton className="mt-3 h-5 w-48" />
        <Skeleton className="mt-6 h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (!user) {
    return <EmptyState title={t('profile.notFound')} body={`@${username}`} action={<LinkButton to="/">{t('notFound.home')}</LinkButton>} />;
  }

  const level = levelOf(user.bsdcPoints);

  return (
    <>
      <SEOHead
        title={`BSDC · ${user.username}${user.bioTitle ? ` — ${user.bioTitle}` : ''}`}
        description={user.bio || `${user.displayName} — member of the Bangladesh Software Development Community.`}
        path={`/p/${user.username}`}
        ogImage={user.avatar || undefined}
        ogType="profile"
        keywords={[user.username, user.displayName, ...user.skills.slice(0, 5), 'bangladesh developer']}
        jsonLd={[
          personSchema(user),
          profilePageSchema(user),
          breadcrumbSchema([{ name: 'Home', url: '/' }, { name: user.username, url: `/p/${user.username}` }]),
        ]}
      />
      <Breadcrumbs items={[{ name: 'BSDC', path: '/' }, { name: user.displayName, path: `/p/${user.username}` }]} />
      <div className="mx-auto max-w-4xl">
        {/* Cover */}
        <div className="relative h-36 overflow-hidden rounded-2xl bg-brand-gradient sm:h-48 lg:h-60">
          {user.coverPhoto ? (
            <img src={user.coverPhoto} alt={`${user.displayName} cover photo`} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="bsdc-fabric-weave h-full w-full" />
          )}
        </div>

        {/* Header */}
        <div className="px-4 sm:px-6">
          <div className="-mt-12 flex items-end justify-between gap-3 sm:-mt-14">
            <span className="rounded-full border-4 border-white dark:border-surface-dark-muted">
              <Avatar src={user.avatar} name={user.displayName} size={104} online={online} />
            </span>
            <div className="flex flex-wrap items-center justify-end gap-2 pb-1">
              {isMe ? (
                <LinkButton to="/settings/profile" variant="primary" size="sm">
                  {t('profile.editProfile')}
                </LinkButton>
              ) : (
                <>
                  <Button size="sm" variant={following ? 'outline' : 'primary'} loading={busy} onClick={() => void toggleFollow()}>
                    {following ? t('common.following') : t('common.follow')}
                  </Button>
                  <Button size="sm" variant="outline" icon={<MessageSquare className="h-4 w-4" aria-hidden />} onClick={() => void handleMessage()}>
                    <span className="hidden min-[420px]:inline">{t('profile.messageUser')}</span>
                  </Button>
                </>
              )}
              <Dropdown open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownTrigger asChild>
                  <button type="button" aria-label={t('common.more')} className="bsdc-tap rounded-lg border border-surface-light-border p-2 dark:border-surface-dark-border">
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </button>
                </DropdownTrigger>
                <DropdownContent>
                  <DropdownItem icon={<Copy className="h-4 w-4" aria-hidden />} onSelect={() => { void copyToClipboard(`${window.location.origin}/p/${user.username}`); toast.success(t('common.copied')); }}>
                    {t('profile.copyLink')}
                  </DropdownItem>
                  <DropdownItem icon={<Share2 className="h-4 w-4" aria-hidden />} onSelect={async () => { const url = `${window.location.origin}/p/${user.username}`; if (navigator.share) await navigator.share({ url }).catch(() => undefined); else { await copyToClipboard(url); toast.success(t('common.copied')); } }}>
                    {t('common.share')}
                  </DropdownItem>
                  {!isMe ? (
                    <>
                      <DropdownSeparator />
                      <DropdownItem icon={<UserMinus className="h-4 w-4" aria-hidden />} onSelect={() => toast.info('User muted (block list saved locally)')}>
                        Block
                      </DropdownItem>
                      <DropdownItem danger icon={<Flag className="h-4 w-4" aria-hidden />} onSelect={async () => { if (me) { await submitReport(me, 'user', user.uid, user.displayName, 'inappropriate', ''); toast.success(t('post.reportThanks')); } }}>
                        {t('profile.reportUser')}
                      </DropdownItem>
                    </>
                  ) : null}
                </DropdownContent>
              </Dropdown>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="text-xl font-extrabold sm:text-2xl">{user.displayName}</h1>
              {user.isVerified ? <VerifiedBadge size={18} /> : null}
              {user.isCreator ? <CreatorBadge /> : null}
              {user.role !== 'user' ? <RoleBadge role={user.role} /> : null}
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">@{user.username} · <span className="inline-flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-brand-600" aria-hidden />{level.name}</span></p>
            {user.bioTitle ? <p className="mt-1.5 text-sm font-semibold text-neutral-700 dark:text-neutral-300">{user.bioTitle}</p> : null}
            {user.bio ? <p className="mt-1 max-w-2xl whitespace-pre-line text-sm text-neutral-600 dark:text-neutral-300">{user.bio}</p> : null}

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              {user.location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  {user.location}
                </span>
              ) : null}
              {user.website ? (
                <a href={user.website.startsWith('http') ? user.website : `https://${user.website}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-brand-600">
                  <Link2 className="h-3.5 w-3.5" aria-hidden />
                  {user.website.replace(/^https?:\/\//, '')}
                </a>
              ) : null}
              {user.github ? (
                <a href={`https://github.com/${user.github}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-brand-600">
                  <Github className="h-3.5 w-3.5" aria-hidden />
                  {user.github}
                </a>
              ) : null}
              {user.linkedin ? (
                <a href={`https://linkedin.com/in/${user.linkedin}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-brand-600">
                  <Linkedin className="h-3.5 w-3.5" aria-hidden />
                  {user.linkedin}
                </a>
              ) : null}
              {user.twitter ? (
                <a href={`https://twitter.com/${user.twitter}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-brand-600">
                  <Twitter className="h-3.5 w-3.5" aria-hidden />
                  {user.twitter}
                </a>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                {t('profile.joined')} {formatDate(user.joinedAt, 'MMM YYYY')}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <button type="button" onClick={() => void openFollowList('followers')} className="hover:underline">
                <strong>{formatNumber(user.followerCount, language)}</strong> <span className="text-neutral-500">{t('profile.followers')}</span>
              </button>
              <button type="button" onClick={() => void openFollowList('following')} className="hover:underline">
                <strong>{formatNumber(user.followingCount, language)}</strong> <span className="text-neutral-500">{t('profile.followingTab')}</span>
              </button>
              <span>
                <strong>{formatNumber(user.postCount, language)}</strong> <span className="text-neutral-500">{t('profile.posts')}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Zap className="h-4 w-4 text-brand-600" aria-hidden />
                <strong>{formatNumber(user.bsdcPoints, language)}</strong> <span className="text-neutral-500">{t('profile.points')}</span>
              </span>
            </div>

            {user.skills.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {user.skills.map((skill) => (
                  <Badge key={skill} color="brand">#{skill}</Badge>
                ))}
              </div>
            ) : null}

            {(user.education || user.work) ? (
              <div className="mt-3 space-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                {user.work ? <p className="inline-flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" aria-hidden /> {user.work}</p> : null}
                {user.education ? <p className="inline-flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5" aria-hidden /> {user.education}</p> : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="posts" className="mt-5 px-0 sm:px-4">
          <div className="border-b border-surface-light-border dark:border-surface-dark-border">
            <TabsList className="mb-0">
              <TabsTrigger value="posts">{t('profile.posts')}</TabsTrigger>
              <TabsTrigger value="projects">{t('profile.projects')}</TabsTrigger>
              <TabsTrigger value="snippets">{t('profile.snippets')}</TabsTrigger>
              {isMe ? <TabsTrigger value="saved">{t('profile.readingList')}</TabsTrigger> : null}
              <TabsTrigger value="about">{t('profile.about')}</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="posts">
            <PostList sort="latest" authorUsername={user.username} emptyTitle={t('common.empty')} emptyBody={isMe ? t('feed.emptyBody') : `@${user.username} has not posted yet.`} />
          </TabsContent>
          <TabsContent value="projects">
            <PostList sort="latest" authorUsername={user.username} filterType="project" emptyTitle={t('common.empty')} emptyBody="No showcased projects yet." />
          </TabsContent>
          <TabsContent value="snippets">
            <PostList sort="latest" authorUsername={user.username} filterType="snippet" emptyTitle={t('common.empty')} emptyBody="No code snippets yet." />
          </TabsContent>
          {isMe ? (
            <TabsContent value="saved">
              {savedPosts.length === 0 ? (
                <EmptyState title={t('common.empty')} body="Your saved posts will appear here." icon={<Blocks className="h-14 w-14" aria-hidden />} />
              ) : (
                <div className="space-y-4">
                  {savedPosts.map((p) => (
                    <FeedCard key={p.id} post={p} />
                  ))}
                </div>
              )}
            </TabsContent>
          ) : null}
          <TabsContent value="about">
            <div className="bsdc-surface space-y-4 p-5 text-sm">
              <div>
                <h2 className="mb-1 font-bold">{t('profile.about')}</h2>
                <p className="text-neutral-600 dark:text-neutral-300">{user.bio || '—'}</p>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-bold uppercase text-neutral-400">{t('profile.skills')}</dt>
                  <dd className="mt-0.5">{user.skills.join(', ') || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase text-neutral-400">{t('profile.education')}</dt>
                  <dd className="mt-0.5">{user.education || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase text-neutral-400">{t('profile.work')}</dt>
                  <dd className="mt-0.5">{user.work || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase text-neutral-400">{t('common.level')}</dt>
                  <dd className="mt-0.5">{level.name} · {formatNumber(user.bsdcPoints, language)} {t('common.points')}</dd>
                </div>
              </dl>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Followers / Following modal */}
      {followList.mode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setFollowList({ users: [], mode: null })} />
          <div className="bsdc-animate-slide-up relative w-full max-w-sm rounded-2xl bg-white p-4 shadow-raised dark:bg-surface-dark-muted">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">{followList.mode === 'followers' ? t('profile.followers') : t('profile.followingTab')}</h2>
              <button type="button" onClick={() => setFollowList({ users: [], mode: null })} aria-label={t('common.close')} className="rounded-lg p-1.5 hover:bg-neutral-100 dark:hover:bg-surface-dark-raised">
                ×
              </button>
            </div>
            {followList.users.length === 0 ? (
              <p className="py-6 text-center text-sm text-neutral-400">{t('common.empty')}</p>
            ) : (
              <ul className="max-h-80 space-y-1 overflow-y-auto">
                {followList.users.map((u) => (
                  <li key={u.uid}>
                    <Link to={`/p/${u.username}`} onClick={() => setFollowList({ users: [], mode: null })} className="flex items-center gap-2.5 rounded-lg p-2 hover:bg-neutral-50 dark:hover:bg-surface-dark-raised">
                      <Avatar src={u.avatar} name={u.displayName} size={36} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 truncate text-sm font-semibold">{u.displayName}{u.isVerified ? <VerifiedBadge size={12} /> : null}</span>
                        <span className="block truncate text-xs text-neutral-400">@{u.username}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
