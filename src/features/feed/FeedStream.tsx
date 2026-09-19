/**
 * BSDC — src/features/feed/FeedStream.tsx
 * Purpose : The feed itself: cursor paging, infinite scroll, pull to refresh, virtualisation.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Paging is cursor based on `createdAt`, never an offset, so a post published while the
 *   person is scrolling cannot push a duplicate into the list. Pages are merged by id, which makes
 *   the operation idempotent under React strict mode, Fast Refresh and a double-firing sentinel.
 *   Past one hundred loaded posts the list virtualises (LAW-20), and on touch surfaces the whole
 *   stream is wrapped in pull-to-refresh, which is the gesture people actually try.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/shared/ui/EmptyState';
import { FeedSkeleton } from '@/shared/ui/Skeleton';
import { InfiniteScrollSentinel } from '@/shared/ui/InfiniteScrollSentinel';
import { PullToRefresh } from '@/shared/ui/PullToRefresh';
import { Text } from '@/shared/ui/Typography';
import { VirtualList } from '@/shared/ui/VirtualList';
import type { Profile } from '@/entities/profile/model';
import type { Post } from '@/entities/post/model';
import { FEED_PAGE_SIZE, listFeedPage } from '@/entities/post/repository';
import { PostCard } from './PostCard';

/** Rows beyond which the stream virtualises (LAW-20). */
const VIRTUALISE_AFTER = 100;

/** Sort mode offered by the stream. */
export type FeedSort = 'latest' | 'trending';

/** Props for the feed stream. */
export interface FeedStreamProps {
  readonly viewer: Profile | null;
  readonly locale: 'bn' | 'en';
  readonly sort?: FeedSort | undefined;
  readonly groupId?: string | undefined;
  readonly authorUid?: string | undefined;
  readonly canModerate?: boolean | undefined;
  readonly pullToRefresh?: boolean | undefined;
  /** Rendered above the first post; the composer lives here on the feed route. */
  readonly header?: React.ReactNode | undefined;
  readonly onChanged?: (() => void) | undefined;
}

/**
 * Renders a paginated feed stream.
 * @param props stream props
 * @returns the feed stream
 */
export function FeedStream({
  viewer,
  locale,
  sort = 'latest',
  groupId,
  authorUid,
  canModerate = false,
  pullToRefresh = false,
  header,
  onChanged,
}: FeedStreamProps): React.ReactElement {
  const { t } = useTranslation('feed');
  const [posts, setPosts] = useState<readonly Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'remote' | 'local'>('local');
  const inFlight = useRef(false);

  /** Loads one page, merging by id so a repeated call cannot duplicate a post. */
  const load = useCallback(
    async (mode: 'initial' | 'more' | 'refresh'): Promise<void> => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (mode === 'more') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);

      const page = await listFeedPage({
        limit: FEED_PAGE_SIZE,
        ...(mode === 'more' && cursor !== null ? { before: cursor } : {}),
        ...(groupId !== undefined ? { groupId } : {}),
        ...(authorUid !== undefined ? { authorUid } : {}),
        visibility: 'public',
      });

      setSource(page.source);
      setError(page.error === null ? null : page.error.messageBn());
      setPosts((current) => {
        if (mode === 'more') {
          const seen = new Set(current.map((post) => post.id));
          return [...current, ...page.items.filter((post) => !seen.has(post.id))];
        }
        return page.items;
      });
      setCursor(page.nextBefore);
      setHasMore(page.nextBefore !== null && page.items.length > 0);
      setLoading(false);
      setRefreshing(false);
      inFlight.current = false;
      onChanged?.();
    },
    [authorUid, cursor, groupId, onChanged],
  );

  useEffect(() => {
    void load('initial');
    // The first page is loaded once per filter change; paging is driven by the sentinel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, authorUid, sort]);

  const virtualise = posts.length > VIRTUALISE_AFTER;
  const rendered =
    sort === 'trending'
      ? [...posts].sort(
          (left, right) =>
            right.counts.reactions +
            right.counts.comments -
            (left.counts.reactions + left.counts.comments),
        )
      : posts;

  const body = (
    <>
      {header}

      {source === 'local' && posts.length > 0 ? (
        <Text as="p" role="status" className="bsdc-feed__offline">
          {t('deviceOnly')}
        </Text>
      ) : null}

      {error !== null ? (
        <Text as="p" role="alert" className="bsdc-feed__error">
          {error}
        </Text>
      ) : null}

      {loading && posts.length === 0 ? <FeedSkeleton count={3} /> : null}

      {!loading && posts.length === 0 ? (
        <EmptyState illustration="welcome" title={t('emptyTitle')} description={t('emptyBody')} />
      ) : null}

      {virtualise ? (
        <VirtualList
          items={rendered}
          itemHeight={420}
          height="70vh"
          label={t('streamLabel')}
          renderItem={(post, index) => (
            <PostCard
              post={post}
              locale={locale}
              viewer={viewer}
              canModerate={canModerate}
              priority={index === 0}
            />
          )}
        />
      ) : (
        <ul className="bsdc-feed__list">
          {rendered.map((post, index) => (
            <li key={post.id}>
              <PostCard
                post={post}
                locale={locale}
                viewer={viewer}
                canModerate={canModerate}
                priority={index === 0}
              />
            </li>
          ))}
        </ul>
      )}

      <InfiniteScrollSentinel
        onLoadMore={() => void load('more')}
        hasMore={hasMore}
        loading={loading && posts.length > 0}
        {...(error !== undefined && error !== null ? { error } : {})}
        endMessage={posts.length > 0 ? t('endOfFeed') : undefined}
        retryLabel={t('retry')}
      />
    </>
  );

  return (
    <section className="bsdc-feed" aria-label={t('streamLabel')}>
      {pullToRefresh ? (
        <PullToRefresh onRefresh={() => load('refresh')}>{body}</PullToRefresh>
      ) : (
        body
      )}
      {refreshing ? (
        <Text as="p" role="status" className="bsdc-visually-hidden">
          {t('refreshing')}
        </Text>
      ) : null}
    </section>
  );
}
