import { CheckCircle2, Compass, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PostCard } from '@/components/content/PostCard';
import { Alert, Button, EmptyState, LinkButton, PageSkeleton } from '@/design-system';
import type { UseFeedResult } from '@/hooks/use-feed';
import { formatNumber } from '@/lib/format';
import { ROUTES } from '@/lib/site';

export interface FeedListProps {
  feed: UseFeedResult;
  emptyTitle: string;
  emptyDescription: string;
}

/** Renders a ranked feed with impression tracking and an infinite sentinel. */
export function FeedList({ feed, emptyTitle, emptyDescription }: FeedListProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const sentinel = useRef<HTMLDivElement | null>(null);
  const { loadMore, hasNextPage, isFetchingNextPage } = feed;

  useEffect(() => {
    const node = sentinel.current;
    if (node === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [loadMore, hasNextPage, isFetchingNextPage]);

  if (feed.isLoading) {
    return <PageSkeleton label={t('feed.loading')} />;
  }

  if (feed.isError) {
    return (
      <Alert tone="danger" title={t('feed.errorTitle')}>
        <p>{t('feed.errorBody')}</p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={feed.refresh}>
          {t('feed.retry')}
        </Button>
      </Alert>
    );
  }

  // An empty feed is a claim about the community, so it is only made when it
  // is true. These two states are the ones where posts exist and the member's
  // own settings removed them — each says so, and each offers the way back.
  if (feed.posts.length === 0 && feed.emptyReason === 'all-seen') {
    return (
      <EmptyState
        icon={<CheckCircle2 size={22} />}
        title={t('feed.empty.caughtUp.title')}
        description={t('feed.empty.caughtUp.description')}
        action={
          <Button variant="secondary" size="sm" onClick={feed.showSeen}>
            {t('feed.empty.caughtUp.action')}
          </Button>
        }
      />
    );
  }

  if (feed.posts.length === 0 && feed.emptyReason === 'preferences') {
    return (
      <EmptyState
        icon={<SlidersHorizontal size={22} />}
        title={t('feed.empty.filtered.title')}
        description={t('feed.empty.filtered.description')}
        action={
          <LinkButton to={ROUTES.settings} variant="secondary" size="sm">
            {t('feed.empty.filtered.action')}
          </LinkButton>
        }
      />
    );
  }

  if (feed.posts.length === 0) {
    return (
      <EmptyState icon={<Compass size={22} />} title={emptyTitle} description={emptyDescription} />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {feed.newPostCount > 0 ? (
        <div className="sticky top-16 z-20 flex justify-center">
          <Button size="sm" variant="secondary" onClick={feed.refresh}>
            <RefreshCw aria-hidden className="size-4" />
            {t('feed.newPosts', { total: formatNumber(feed.newPostCount, language) })}
          </Button>
        </div>
      ) : null}

      {feed.posts.map((post) => (
        <div key={post.id} ref={feed.observe(post.id)}>
          <PostCard post={post} />
        </div>
      ))}

      <div ref={sentinel} aria-hidden className="h-px" />

      {feed.isFetchingNextPage ? (
        <p className="py-4 text-center text-sm text-muted">{t('feed.loadingMore')}</p>
      ) : null}

      {!feed.hasNextPage ? (
        <p className="py-4 text-center text-sm text-muted">{t('feed.end')}</p>
      ) : null}
    </div>
  );
}
