/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { useFeed } from '@/hooks/useFeed';
import { FeedCard } from './FeedCard';
import { FeedSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import type { Post, PostSort } from '@/types/post';

export function PostList({
  sort,
  filterType,
  authorUsername,
  tagFilter,
  emptyTitle,
  emptyBody,
  showLoadMore = true,
}: {
  sort?: PostSort;
  filterType?: string;
  authorUsername?: string;
  tagFilter?: string;
  emptyTitle?: string;
  emptyBody?: string;
  showLoadMore?: boolean;
}) {
  const { t } = useTranslation();
  const { posts, loading, error, refresh } = useFeed(sort || 'forYou', filterType, authorUsername, tagFilter);
  const [visible, setVisible] = useState(15);

  useEffect(() => {
    setVisible(15);
  }, [filterType, authorUsername, tagFilter, sort]);

  if (loading) return <FeedSkeleton />;
  if (error) {
    return <EmptyState title={t('common.error')} body={error} action={<Button onClick={refresh}>{t('common.retry')}</Button>} />;
  }
  if (posts.length === 0) {
    return <EmptyState title={emptyTitle || t('feed.emptyTitle')} body={emptyBody || t('feed.emptyBody')} action={emptyBody ? undefined : <Link to="/create"><Button icon={<Plus className="h-4 w-4" aria-hidden />}>{t('feed.createFirstPost')}</Button></Link>} />;
  }

  const slice = posts.slice(0, visible);

  return (
    <div className="space-y-4">
      {slice.map((post: Post) => (
        <FeedCard key={post.id} post={post} onDeleted={() => refresh()} />
      ))}
      {showLoadMore && visible < posts.length ? (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => setVisible((v) => v + 15)}>
            {t('feed.loadMore')}
          </Button>
        </div>
      ) : (
        <p className="py-6 text-center text-xs text-neutral-400">{t('feed.endOfFeed')}</p>
      )}
    </div>
  );
}
