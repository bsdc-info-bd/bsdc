import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/design-system';
import { follow, isFollowing, unfollow } from '@/lib/data/follow-repository';
import { dataErrorKey } from '@/lib/supabase/errors';
import { useAuthStore } from '@/store/auth-store';

export interface FollowButtonProps {
  /** The member being followed. The button renders nothing for the viewer. */
  uid: string;
  displayName: string;
  size?: 'sm' | 'md';
}

/**
 * Follow / unfollow, on the member's own row in the database.
 *
 * The follower count is maintained by a trigger on `public.follows`, so this
 * control only writes the relationship — and it writes the same row that an
 * unfollow deletes, which is why a double click cannot leave two follows
 * behind (`follow` treats 23505 as success, `unfollow` of a missing row as
 * nothing to do).
 */
export function FollowButton({ uid, displayName, size = 'md' }: FollowButtonProps) {
  const { t } = useTranslation();
  const viewer = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const isSelf = viewer?.uid === uid;

  const query = useQuery({
    queryKey: ['following', viewer?.uid ?? '', uid],
    queryFn: () => isFollowing(viewer?.uid ?? '', uid),
    enabled: !isSelf && viewer !== null,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (viewer === null) return;
      if (next) await follow(viewer.uid, uid);
      else await unfollow(viewer.uid, uid);
    },
    onSuccess: (_result, next) => {
      queryClient.setQueryData(['following', viewer?.uid ?? '', uid], next);
      toast.success(
        next
          ? t('follow.followed', { name: displayName })
          : t('follow.unfollowed', { name: displayName }),
      );
      // The follower counter on the profile is a database trigger's work.
      void queryClient.invalidateQueries({ queryKey: ['profile-stats', uid] });
      // A new follow changes the feed's ranking signal for this author.
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: (error) => {
      toast.error(t(dataErrorKey(error)));
    },
  });

  if (isSelf || viewer === null) return null;

  const following = query.data === true;

  return (
    <Button
      variant={following ? 'secondary' : 'primary'}
      size={size}
      loading={query.isLoading || mutation.isPending}
      aria-pressed={following}
      onClick={() => {
        mutation.mutate(!following);
      }}
    >
      {following ? t('follow.following') : t('follow.follow')}
      <span className="fab-sr-only">{displayName}</span>
    </Button>
  );
}
