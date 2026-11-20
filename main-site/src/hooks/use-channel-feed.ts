import { useQuery } from '@tanstack/react-query';
import { hydratePosts } from '@/lib/feed/feed-repository';
import type { Post } from '@/lib/content/post-repository';

// Loaded on demand: the Supabase client must stay out of the entry chunk.
const repository = () => import('@/lib/channels/channel-repository');

export interface ChannelFeedResult {
  posts: Post[];
  isLoading: boolean;
  isError: boolean;
}

/**
 * One channel's posts, in the home feed's shape.
 *
 * Two steps, and sharing the home feed's hydrator is the point: the database
 * answers with candidate rows (what the room holds, filtered by who may read
 * it), and the one hydrator the app already has turns ids into full posts. A
 * channel is a filtered feed, not a second feed.
 */
export function useChannelFeed(channelId: string | null): ChannelFeedResult {
  const query = useQuery({
    queryKey: ['channel-feed', channelId],
    queryFn: async () => {
      const candidates = await (await repository()).fetchChannelCandidates(channelId as string);
      return hydratePosts(candidates.map((candidate) => candidate.postId));
    },
    enabled: channelId !== null,
    staleTime: 60_000,
  });

  return {
    posts: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
