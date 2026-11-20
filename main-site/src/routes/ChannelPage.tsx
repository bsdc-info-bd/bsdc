import { Hash } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { PostCard } from '@/components/content/PostCard';
import { Seo } from '@/components/seo/Seo';
import { Badge, Card, EmptyState, PageSkeleton } from '@/design-system';
import { useChannelFeed } from '@/hooks/use-channel-feed';
import { useGroup } from '@/hooks/use-communities';
import type { Post } from '@/lib/content/post-repository';
import { channelPath, groupPath } from '@/lib/site';

/**
 * One channel of a group: the room's posts in the home feed's shape.
 *
 * The address is the group's slug and the channel's slug. The room itself is
 * found in the group's own channel list — the same list the group page shows —
 * and a channel that is not in the list renders exactly the same empty state
 * whether it does not exist or the reader may not see it: a URL must not
 * reveal that a private room exists.
 */
export default function ChannelPage() {
  const { t } = useTranslation();
  const { slug = '', channelSlug = '' } = useParams<{ slug: string; channelSlug: string }>();

  const detail = useGroup(slug);
  const group = detail.group;
  const channel = detail.channels.find((entry) => entry.slug === channelSlug) ?? null;

  const feed = useChannelFeed(channel?.id ?? null);

  if (detail.isLoading) {
    return <PageSkeleton label={t('common.loading')} />;
  }

  if (detail.isError || group === null || channel === null) {
    return (
      <>
        <Seo
          title={`${t('channels.notFoundTitle')} — ${t('common.brand')}`}
          description={t('channels.notFoundBody')}
          path={`/g/${slug}/c/${channelSlug}`}
          noindex
        />
        <div className="fab-container py-10">
          <EmptyState
            icon={<Hash size={22} />}
            title={t('channels.notFoundTitle')}
            description={t('channels.notFoundBody')}
          />
        </div>
      </>
    );
  }

  const posts: Post[] = feed.posts;

  return (
    <>
      <Seo
        title={`${group.name} · ${channel.name} — ${t('common.brand')}`}
        description={
          channel.topic.length > 0 ? channel.topic : t('channels.emptyBody', { group: group.name })
        }
        path={channelPath(group.slug, channel.slug)}
        // A private or archived group's room is not a page a crawler may read.
        noindex={group.privacy !== 'public' || group.isArchived}
      />
      <div className="fab-container py-6">
        <nav className="mb-4 text-xs text-muted" aria-label={t('channels.breadcrumb')}>
          <Link to={groupPath(group.slug)}>{group.name}</Link>
          <span aria-hidden="true"> / </span>
          <span>{channel.name}</span>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="flex items-center gap-1 text-2xl font-bold">
            <Hash size={22} aria-hidden="true" />
            {channel.name}
          </h1>
          {channel.isReadOnly ? <Badge tone="neutral">{t('groups.readOnly')}</Badge> : null}
          <Badge tone="neutral">{t('channels.posts', { count: channel.postCount })}</Badge>
        </div>

        {channel.topic.length > 0 ? (
          <p className="mt-2 text-sm text-muted">{channel.topic}</p>
        ) : null}

        {feed.isLoading ? (
          <PageSkeleton label={t('common.loading')} />
        ) : feed.isError ? (
          <EmptyState
            icon={<Hash size={22} />}
            title={t('channels.failed')}
            description={t('channels.notFoundBody')}
          />
        ) : posts.length === 0 ? (
          <Card className="mt-4">
            <EmptyState
              icon={<Hash size={22} />}
              title={t('channels.emptyTitle')}
              description={t('channels.emptyBody', { group: group.name })}
            />
          </Card>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {posts.map((post) => (
              <li key={post.id}>
                <PostCard post={post} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
