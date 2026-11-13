import { useQuery } from '@tanstack/react-query';
import { Award, BadgeCheck, FileText, Lock, MessageSquare, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  ExternalLink,
  Modal,
  PageSkeleton,
  StatCard,
  Tabs,
  type TabItem,
} from '@/design-system';
import { PostCard } from '@/components/content/PostCard';
import { FollowButton } from '@/components/social/FollowButton';
import { usePresence } from '@/hooks/use-presence';
import {
  fetchProfileFollowers,
  fetchProfileFollowing,
  isPrivateSocialListError,
  type SocialProfileItem,
} from '@/lib/data/follow-repository';
import { formatAbsoluteDate, formatNumber } from '@/lib/format';
import {
  fetchProfileByUsername,
  fetchProfileStats,
  type Profile,
} from '@/lib/profile/profile-service';
import { isConfigured } from '@/lib/env';
import { conversationPath, profilePath, ROUTES, SITE } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { useAuthStore } from '@/store/auth-store';

function AboutPanel({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const none = t('profile.about.none');

  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <div className="sm:col-span-2">
        <dt className="text-xs uppercase tracking-wide text-muted">{t('profile.about.skills')}</dt>
        <dd className="mt-1 flex flex-wrap gap-1.5">
          {profile.skills.length > 0
            ? profile.skills.map((skill) => (
                <Chip key={skill} type="button" aria-pressed={false}>
                  {skill}
                </Chip>
              ))
            : none}
        </dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-xs uppercase tracking-wide text-muted">
          {t('profile.about.interests')}
        </dt>
        <dd className="mt-1 flex flex-wrap gap-1.5">
          {profile.interests.length > 0
            ? profile.interests.map((interest) => (
                <Chip key={interest} type="button" aria-pressed={false}>
                  {interest}
                </Chip>
              ))
            : none}
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted">
          {t('profile.about.location')}
        </dt>
        <dd className="mt-1">{profile.location.length > 0 ? profile.location : none}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted">{t('profile.about.website')}</dt>
        <dd className="mt-1 fab-truncate">
          {profile.website.length > 0 ? (
            <ExternalLink href={profile.website} userGenerated>
              {profile.website}
            </ExternalLink>
          ) : (
            none
          )}
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted">
          {t('profile.about.language')}
        </dt>
        <dd className="mt-1">{profile.language === 'bn' ? 'বাংলা' : 'English'}</dd>
      </div>
    </dl>
  );
}

type SocialModalMode = 'followers' | 'following';

function FollowersModal({
  open,
  mode,
  onModeChange,
  onClose,
  profile,
  followersCount,
  followingCount,
  language,
}: {
  open: boolean;
  mode: SocialModalMode;
  onModeChange: (next: SocialModalMode) => void;
  onClose: () => void;
  profile: Profile;
  followersCount: number;
  followingCount: number;
  language: 'en' | 'bn';
}) {
  const { t } = useTranslation();
  const [limit, setLimit] = useState(30);

  const listQuery = useQuery<SocialProfileItem[]>({
    queryKey: ['profile-social-list', profile.uid, mode, limit],
    queryFn: () =>
      mode === 'followers'
        ? fetchProfileFollowers(profile.uid, limit, 0)
        : fetchProfileFollowing(profile.uid, limit, 0),
    enabled: open,
    retry: (count, error) => (isPrivateSocialListError(error) ? false : count < 1),
    staleTime: 20_000,
  });

  const isPrivate = listQuery.isError && isPrivateSocialListError(listQuery.error);
  const items = listQuery.data ?? [];
  const hasMore = items.length >= limit;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        mode === 'followers'
          ? t('profile.social.followersTab', {
              total: formatNumber(followersCount, language),
            })
          : t('profile.social.followingTab', {
              total: formatNumber(followingCount, language),
            })
      }
      closeLabel={t('common.close')}
    >
      <div className="mb-4 flex gap-2">
        <Button
          size="sm"
          variant={mode === 'followers' ? 'primary' : 'secondary'}
          onClick={() => {
            setLimit(30);
            onModeChange('followers');
          }}
        >
          {t('profile.social.followersTab', {
            total: formatNumber(followersCount, language),
          })}
        </Button>
        <Button
          size="sm"
          variant={mode === 'following' ? 'primary' : 'secondary'}
          onClick={() => {
            setLimit(30);
            onModeChange('following');
          }}
        >
          {t('profile.social.followingTab', {
            total: formatNumber(followingCount, language),
          })}
        </Button>
      </div>

      {listQuery.isPending ? (
        <PageSkeleton label={t('common.loading')} />
      ) : isPrivate ? (
        <EmptyState
          icon={<Lock size={26} />}
          title={t('profile.social.privateTitle')}
          description={t('profile.social.privateBody', { name: profile.displayName })}
        />
      ) : listQuery.isError ? (
        <Alert tone="danger" title={t(dataErrorKey(listQuery.error))} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Users size={26} />}
          title={
            mode === 'followers'
              ? t('profile.social.emptyFollowers')
              : t('profile.social.emptyFollowing')
          }
          description={profile.displayName}
        />
      ) : (
        <div className="space-y-2">
          <ul className="max-h-[55dvh] space-y-2 overflow-y-auto pr-1">
            {items.map((member) => {
              const target =
                member.username.trim().length > 0
                  ? profilePath(member.username)
                  : `/u/${member.uid}`;
              return (
                <li
                  key={member.uid}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-2.5"
                >
                  <Link
                    to={target}
                    onClick={onClose}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
                  >
                    <Avatar src={member.avatarUrl} name={member.displayName} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <span className="fab-truncate text-sm font-semibold">
                          {member.displayName}
                        </span>
                        {member.verified ? (
                          <BadgeCheck
                            size={14}
                            className="shrink-0 text-green-700"
                            aria-hidden="true"
                          />
                        ) : null}
                      </span>
                      <span className="fab-truncate block text-xs text-muted">
                        {member.username ? `@${member.username}` : ''}
                        {member.username && member.location ? ' · ' : ''}
                        {member.location}
                      </span>
                    </span>
                  </Link>
                  <FollowButton uid={member.uid} displayName={member.displayName} size="sm" />
                </li>
              );
            })}
          </ul>
          {hasMore ? (
            <div className="pt-2 text-center">
              <Button variant="secondary" size="sm" onClick={() => setLimit((n) => n + 30)}>
                {t('profile.social.loadMore')}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const params = useParams();
  const currentUser = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [openingChat, setOpeningChat] = useState(false);
  const [socialModal, setSocialModal] = useState<SocialModalMode | null>(null);

  /** Opening a chat is idempotent: the same pair always lands on one thread. */
  async function startConversation() {
    if (!profile) return;
    if (!currentUser) {
      navigate(ROUTES.login);
      return;
    }
    if (currentUser.uid === profile.uid) {
      toast.error(t('chat.selfChatBlocked'));
      return;
    }
    setOpeningChat(true);
    try {
      const { openDirectConversation } = await import('@/lib/messaging/message-repository');
      const id = await openDirectConversation(profile.uid);
      navigate(conversationPath(id));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    } finally {
      setOpeningChat(false);
    }
  }
  const [tab, setTab] = useState('posts');

  const handle = (params['handle'] ?? '').replace(/^@/, '').toLowerCase();

  const { data, isPending, isError } = useQuery({
    queryKey: ['profile', currentUser?.uid ?? 'anon', handle],
    queryFn: () => fetchProfileByUsername(handle),
    enabled: handle.length > 0 && isConfigured.firebase,
    staleTime: 60_000,
  });

  // Counters live in Postgres and are maintained by a database trigger.
  const { data: stats } = useQuery({
    queryKey: ['profile-stats', data?.uid ?? ''],
    queryFn: () => fetchProfileStats(data?.uid ?? ''),
    enabled: typeof data?.uid === 'string' && data.uid.length > 0,
    staleTime: 60_000,
  });

  const presence = usePresence(data?.uid ?? null);

  // Published posts by this member, loaded once the profile is known.
  const { data: posts } = useQuery({
    queryKey: ['author-posts', currentUser?.uid ?? 'anon', data?.uid ?? ''],
    queryFn: async () => {
      const { fetchPostsByAuthor } = await import('@/lib/content/post-repository');
      return fetchPostsByAuthor(data?.uid ?? '', { limit: 20 });
    },
    enabled: typeof data?.uid === 'string' && data.uid.length > 0 && isConfigured.supabase,
    staleTime: 60_000,
  });

  if (!isConfigured.firebase) {
    return (
      <>
        <Seo
          title={`${t('profile.notFoundTitle')} — ${t('common.brand')}`}
          description={t('profile.notFoundBody')}
          path={handle ? profilePath(handle) : '/'}
          noindex
        />
        <div className="fab-container py-10">
          <Alert tone="danger" title={t('auth.errors.notConfigured')} />
        </div>
      </>
    );
  }

  if (isPending) return <PageSkeleton label={t('common.loading')} />;

  if (isError || !data) {
    return (
      <div className="fab-container py-10">
        <Seo
          title={`${t('profile.notFoundTitle')} — ${t('common.brand')}`}
          description={t('profile.notFoundBody')}
          path={profilePath(handle)}
          noindex
        />
        <EmptyState
          icon={<Users size={32} />}
          title={t('profile.notFoundTitle')}
          description={t('profile.notFoundBody')}
          action={
            <Button variant="secondary" onClick={() => window.history.back()}>
              {t('common.backHome')}
            </Button>
          }
        />
      </div>
    );
  }

  const profile = data;
  const isSelf = currentUser?.uid === profile.uid;
  const joined = formatAbsoluteDate(new Date(profile.createdAt), language);

  const items: TabItem[] = [
    {
      id: 'posts',
      label: t('profile.tabs.posts'),
      content:
        posts && posts.length > 0 ? (
          <ul className="grid gap-3">
            {posts.map((post) => (
              <li key={post.id}>
                <PostCard post={post} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<FileText size={28} />}
            title={t('profile.empty.postsTitle')}
            description={t('profile.empty.postsBody')}
          />
        ),
    },
    {
      id: 'comments',
      label: t('profile.tabs.comments'),
      content: (
        <EmptyState
          icon={<MessageSquare size={28} />}
          title={t('profile.empty.commentsTitle')}
          description={t('profile.empty.commentsBody')}
        />
      ),
    },
    { id: 'about', label: t('profile.tabs.about'), content: <AboutPanel profile={profile} /> },
    {
      id: 'badges',
      label: t('profile.tabs.badges'),
      content: (
        <EmptyState
          icon={<Award size={28} />}
          title={t('profile.empty.badgesTitle')}
          description={t('profile.empty.badgesBody')}
        />
      ),
    },
  ];

  const profileCanonical = `${SITE.url}${profilePath(profile.username)}`;
  const profileAvatar = profile.avatarUrl.trim();
  const profileWebsite = profile.website.trim();

  return (
    <>
      <Seo
        title={`${profile.displayName} (@${profile.username}) — ${t('common.brand')}`}
        description={
          profile.bio.length > 0
            ? profile.bio
            : t('profile.metaDescription', { name: profile.displayName })
        }
        path={profilePath(profile.username)}
        type="profile"
        {...(profileAvatar.length > 0 ? { image: profileAvatar } : {})}
        noindex={!profile.privacy.discoverable}
        jsonLd={
          profile.privacy.discoverable
            ? [
                {
                  '@type': 'ProfilePage',
                  url: profileCanonical,
                  mainEntity: {
                    '@type': 'Person',
                    name: profile.displayName,
                    alternateName: profile.username,
                    description: profile.bio,
                    url: profileCanonical,
                    ...(profileAvatar.length > 0 ? { image: profileAvatar } : {}),
                    knowsAbout: profile.skills,
                    ...(profileWebsite.length > 0 ? { sameAs: [profileWebsite] } : {}),
                  },
                },
              ]
            : []
        }
      />

      <div className="fab-container py-6 sm:py-10">
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <Avatar
              src={profile.avatarUrl}
              name={profile.displayName}
              size="xl"
              online={presence === 'online'}
            />
            <div className="min-w-0 flex-1">
              <h1 className="fab-truncate text-2xl">{profile.displayName}</h1>
              <p className="text-sm text-muted">@{profile.username}</p>
              {profile.bio.length > 0 ? <p className="mt-2 text-sm">{profile.bio}</p> : null}
              <p className="mt-2 text-xs text-muted">{t('profile.joined', { date: joined })}</p>
            </div>
            {isSelf ? (
              <Link to={ROUTES.settings} className="shrink-0">
                <Button variant="secondary">{t('profile.editProfile')}</Button>
              </Link>
            ) : currentUser ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <FollowButton uid={profile.uid} displayName={profile.displayName} />
                <Button
                  variant="secondary"
                  disabled={openingChat}
                  onClick={() => {
                    void startConversation();
                  }}
                >
                  {t('messages.startConversation')}
                </Button>
              </div>
            ) : null}
          </div>
        </Card>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={<FileText size={16} />}
            label={t('profile.stats.posts')}
            value={formatNumber(stats?.posts ?? 0, language)}
          />
          <button
            type="button"
            onClick={() => setSocialModal('followers')}
            aria-label={t('profile.social.followersLabel', {
              total: formatNumber(stats?.followers ?? 0, language),
            })}
            className="text-start rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
          >
            <StatCard
              icon={<Users size={16} />}
              label={t('profile.stats.followers')}
              value={formatNumber(stats?.followers ?? 0, language)}
              className="transition-colors hover:border-green-400"
            />
          </button>
          <button
            type="button"
            onClick={() => setSocialModal('following')}
            aria-label={t('profile.social.followingLabel', {
              total: formatNumber(stats?.following ?? 0, language),
            })}
            className="text-start rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
          >
            <StatCard
              icon={<Users size={16} />}
              label={t('profile.stats.following')}
              value={formatNumber(stats?.following ?? 0, language)}
              className="transition-colors hover:border-green-400"
            />
          </button>
          <StatCard
            icon={<Award size={16} />}
            label={t('profile.stats.reputation')}
            value={formatNumber(stats?.reputation ?? 0, language)}
          />
        </div>

        <div className="mt-6">
          <Tabs items={items} activeId={tab} onChange={setTab} label={t('profile.tabs.about')} />
        </div>
      </div>

      {socialModal !== null ? (
        <FollowersModal
          open={socialModal !== null}
          mode={socialModal}
          onModeChange={(next) => setSocialModal(next)}
          onClose={() => setSocialModal(null)}
          profile={profile}
          followersCount={stats?.followers ?? 0}
          followingCount={stats?.following ?? 0}
          language={language}
        />
      ) : null}
    </>
  );
}
