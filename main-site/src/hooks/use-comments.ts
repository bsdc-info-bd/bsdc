import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
const repository = () => import('@/lib/interactions/interaction-repository');
import {
  buildCommentTree,
  type Comment,
  type CommentNode,
} from '@/lib/interactions/interaction-types';
import { useAuthStore } from '@/store/auth-store';

export interface UseCommentsResult {
  tree: CommentNode[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  add: (body: string, parentId: string | null) => Promise<void>;
  edit: (commentId: string, body: string) => Promise<void>;
  remove: (commentId: string) => Promise<void>;
  like: (commentId: string) => void;
  accept: (commentId: string) => void;
  isPosting: boolean;
}

/** The comment thread for one post, kept as a flat list and shaped on read. */
export function useComments(postId: string): UseCommentsResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const queryKey = ['comments', postId, uid];

  const query = useQuery({
    queryKey,
    queryFn: async () => (await repository()).fetchComments(postId, uid),
    staleTime: 20_000,
  });

  const comments = useMemo(() => query.data ?? [], [query.data]);
  const tree = useMemo(() => buildCommentTree(comments), [comments]);

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey });
  };

  const addMutation = useMutation({
    mutationFn: async ({ body, parentId }: { body: string; parentId: string | null }) =>
      (await repository()).createComment(postId, uid ?? '', body, parentId),
    onSuccess: invalidate,
  });

  const editMutation = useMutation({
    mutationFn: async ({ commentId, body }: { commentId: string; body: string }) =>
      (await repository()).updateComment(commentId, body),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: async (commentId: string) => (await repository()).deleteComment(commentId),
    onSuccess: invalidate,
  });

  const likeMutation = useMutation({
    mutationFn: async (commentId: string) => (await repository()).toggleCommentReaction(commentId),
    onMutate: (commentId) => {
      const previous = queryClient.getQueryData<Comment[]>(queryKey);
      queryClient.setQueryData<Comment[]>(queryKey, (current = []) =>
        current.map((comment) =>
          comment.id === commentId
            ? {
                ...comment,
                liked: !comment.liked,
                likes: comment.liked ? Math.max(comment.likes - 1, 0) : comment.likes + 1,
              }
            : comment,
        ),
      );
      return { previous };
    },
    onError: (_error, _commentId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSuccess: (result, commentId) => {
      queryClient.setQueryData<Comment[]>(queryKey, (current = []) =>
        current.map((comment) =>
          comment.id === commentId
            ? { ...comment, liked: result.reacted, likes: result.total }
            : comment,
        ),
      );
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (commentId: string) => (await repository()).markAnswer(commentId),
    onSuccess: invalidate,
  });

  return {
    tree,
    total: comments.length,
    isLoading: query.isLoading,
    isError: query.isError,
    add: async (body, parentId) => {
      await addMutation.mutateAsync({ body, parentId });
    },
    edit: async (commentId, body) => {
      await editMutation.mutateAsync({ commentId, body });
    },
    remove: async (commentId) => {
      await removeMutation.mutateAsync(commentId);
    },
    like: (commentId) => {
      likeMutation.mutate(commentId);
    },
    accept: (commentId) => {
      acceptMutation.mutate(commentId);
    },
    isPosting: addMutation.isPending,
  };
}
