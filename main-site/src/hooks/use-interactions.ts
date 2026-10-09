import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
// The repository pulls in the Supabase client, so it is imported lazily:
// the app bar renders on first paint and must not drag the SDK with it.
const repository = () => import('@/lib/interactions/interaction-repository');
const social = () => import('@/lib/data/follow-repository');
import type { FollowSuggestion } from '@/lib/data/follow-repository';
import {
  EMPTY_INTERACTION,
  type AppNotification,
  type InteractionState,
  type Reaction,
  type ShareChannel,
} from '@/lib/interactions/interaction-types';
import { useAuthStore } from '@/store/auth-store';

/** Reaction and bookmark state for a batch of posts, fetched once. */
export function useInteractionState(postIds: readonly string[]): Map<string, InteractionState> {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const key = [...postIds].sort().join(',');

  const { data } = useQuery({
    queryKey: ['interaction-state', uid, key],
    queryFn: async () => (await repository()).fetchInteractionState(postIds),
    enabled: uid !== null && postIds.length > 0,
    staleTime: 30_000,
  });

  return data ?? new Map<string, InteractionState>();
}

export interface PostInteractions {
  state: InteractionState;
  likes: number;
  react: (reaction: Reaction) => void;
  bookmark: () => void;
  share: (channel: ShareChannel) => void;
  isBusy: boolean;
}

/**
 * Optimistic reactions and bookmarks for a single post. The server's count is
 * authoritative and replaces the optimistic one as soon as it arrives.
 */
export function usePostInteractions(postId: string, initialLikes: number): PostInteractions {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const queryKey = ['interaction', uid, postId];

  const { data } = useQuery({
    queryKey,
    queryFn: async () => {
      const map = await (await repository()).fetchInteractionState([postId]);
      return map.get(postId) ?? EMPTY_INTERACTION;
    },
    enabled: uid !== null,
    staleTime: 30_000,
  });

  const likesKey = ['post-likes', postId];
  const { data: likes = initialLikes } = useQuery({
    queryKey: likesKey,
    queryFn: () => initialLikes,
    initialData: initialLikes,
    staleTime: Infinity,
  });

  const state = data ?? EMPTY_INTERACTION;

  const reactMutation = useMutation({
    mutationFn: async (reaction: Reaction) => (await repository()).toggleReaction(postId, reaction),
    onMutate: (reaction) => {
      const previous = state;
      const removing = previous.reaction === reaction;
      queryClient.setQueryData<InteractionState>(queryKey, {
        ...previous,
        reaction: removing ? null : reaction,
      });
      queryClient.setQueryData<number>(likesKey, (current = initialLikes) => {
        if (removing) return Math.max(current - 1, 0);
        return previous.reaction === null ? current + 1 : current;
      });
      return { previous };
    },
    onError: (_error, _reaction, context) => {
      if (context) queryClient.setQueryData(queryKey, context.previous);
      void queryClient.invalidateQueries({ queryKey: likesKey });
    },
    onSuccess: (result) => {
      queryClient.setQueryData<InteractionState>(queryKey, (current = EMPTY_INTERACTION) => ({
        ...current,
        reaction: result.reacted ? result.reaction : null,
      }));
      queryClient.setQueryData(likesKey, result.total);
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: async () => (await repository()).toggleBookmark(postId),
    onMutate: () => {
      const previous = state;
      queryClient.setQueryData<InteractionState>(queryKey, {
        ...previous,
        bookmarked: !previous.bookmarked,
      });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context) queryClient.setQueryData(queryKey, context.previous);
    },
    onSuccess: (bookmarked) => {
      queryClient.setQueryData<InteractionState>(queryKey, (current = EMPTY_INTERACTION) => ({
        ...current,
        bookmarked,
      }));
      void queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
    },
  });

  const share = useCallback(
    (channel: ShareChannel) => {
      void repository()
        .then(async (module) => module.recordShare(postId, channel))
        .catch(() => undefined);
    },
    [postId],
  );

  return {
    state,
    likes,
    react: (reaction) => {
      reactMutation.mutate(reaction);
    },
    bookmark: () => {
      bookmarkMutation.mutate();
    },
    share,
    isBusy: reactMutation.isPending || bookmarkMutation.isPending,
  };
}

const UNREAD_POLL_MS = 45_000;

export function useUnreadNotificationCount(): number {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const { data = 0 } = useQuery({
    queryKey: ['notifications-unread', uid],
    queryFn: async () => (await repository()).fetchUnreadCount(),
    enabled: uid !== null,
    refetchInterval: UNREAD_POLL_MS,
    staleTime: UNREAD_POLL_MS,
  });
  return data;
}

export interface NotificationsResult {
  notifications: AppNotification[];
  isLoading: boolean;
  isError: boolean;
  markAllRead: () => void;
}

export function useNotifications(): NotificationsResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', uid],
    queryFn: async () => (await repository()).fetchNotifications(),
    enabled: uid !== null,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async () => (await repository()).markNotificationsRead(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications', uid] });
      queryClient.setQueryData(['notifications-unread', uid], 0);
    },
  });

  return {
    notifications: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    markAllRead: () => {
      mutation.mutate();
    },
  };
}

export interface FollowSuggestionsResult {
  suggestions: FollowSuggestion[];
  isLoading: boolean;
  isError: boolean;
  /** Not interested. The suggestion goes away and does not come back. */
  dismiss: (uid: string) => void;
  dismissed: readonly string[];
}

/**
 * Who to follow next.
 *
 * A few more are fetched than are shown so that dismissing one does not leave a
 * hole, and the dismissal is local: the database does not keep a list of members
 * somebody was not interested in, because that is a preference about a page, not
 * a fact about anybody.
 */
export function useFollowSuggestions(limit = 6): FollowSuggestionsResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['follow-suggestions', uid, limit],
    queryFn: async () => (await social()).fetchFollowSuggestions(limit + 6),
    enabled: uid !== null,
    staleTime: 5 * 60_000,
  });

  const dismiss = useCallback((target: string) => {
    setDismissed((current) => (current.includes(target) ? current : [...current, target]));
  }, []);

  const suggestions = (data ?? [])
    .filter((suggestion) => !dismissed.includes(suggestion.uid))
    .slice(0, limit);

  return { suggestions, isLoading, isError, dismiss, dismissed };
}
