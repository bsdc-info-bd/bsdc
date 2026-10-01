import { useQuery } from '@tanstack/react-query';
import { Award, FileText, MessageSquare, Users } from 'lucide-react';
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
  PageSkeleton,
  StatCard,
  Tabs,
  type TabItem,
} from '@/design-system';
import { PostCard } from '@/components/content/PostCard';
import { usePresence } from '@/hooks/use-presence';
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

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const params = useParams();
  const currentUser = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [openingChat, setOpeningChat] = useState(false);

  /** Opening a chat is idempotent: the same pair always lands on one thread. */
  async function startConversation() {
    if (!profile) return;
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
    queryKey: ['profile', handle],
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
    queryKey: ['author-posts', data?.uid ?? ''],
    queryFn: async () => {
      const { fetchPostsByAuthor } = await import('@/lib/content/post-repository');
      return fetchPostsByAuthor(data?.uid ?? '', { limit: 20 });
    },
    enabled: typeof data?.uid === 'string' && data.uid.length > 0 && isConfigured.supabase,
    staleTime: 60_000,
  });

  if (!isConfigured.firebase) {
    return (
      <div className="fab-container py-10">
        <Alert tone="danger" title={t('auth.errors.notConfigured')} />
      </div>
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
        noindex={!profile.privacy.discoverable}
        jsonLd={[
          {
            '@type': 'ProfilePage',
            url: `${SITE.url}${profilePath(profile.username)}`,
            mainEntity: {
              '@type': 'Person',
              name: profile.displayName,
              alternateName: profile.username,
              description: profile.bio,
              knowsAbout: profile.skills,
              ...(profile.website.length > 0 ? { url: profile.website } : {}),
            },
          },
        ]}
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
              <Button
                variant="secondary"
                className="shrink-0"
                disabled={openingChat}
                onClick={() => {
                  void startConversation();
                }}
              >
                {t('messages.startConversation')}
              </Button>
            ) : null}
          </div>
        </Card>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={<FileText size={16} />}
            label={t('profile.stats.posts')}
            value={formatNumber(stats?.posts ?? 0, language)}
          />
          <StatCard
            icon={<Users size={16} />}
            label={t('profile.stats.followers')}
            value={formatNumber(stats?.followers ?? 0, language)}
          />
          <StatCard
            icon={<Users size={16} />}
            label={t('profile.stats.following')}
            value={formatNumber(stats?.following ?? 0, language)}
          />
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
    </>
  );
}
