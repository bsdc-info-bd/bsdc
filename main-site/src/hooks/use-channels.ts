import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth-store';
import type { PostableChannel } from '@/lib/channels/channel-repository';

// Loaded on demand: the Supabase client must stay out of the entry chunk.
const repository = () => import('@/lib/channels/channel-repository');

export interface PostableChannelsResult {
  channels: PostableChannel[];
  writeable: PostableChannel[];
  isLoading: boolean;
  isError: boolean;
}

/**
 * Every channel the signed-in member may see, with the reason each one would
 * refuse their post. The picker uses `channels` for the full list — blocked
 * rooms stay visible so the member knows the room exists — and `writeable`
 * for what they may actually pick.
 */
export function usePostableChannels(): PostableChannelsResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);

  const query = useQuery({
    queryKey: ['postable-channels', uid],
    queryFn: async () => (await repository()).fetchPostableChannels(),
    enabled: uid !== null,
    staleTime: 60_000,
  });

  const channels = query.data ?? [];
  return {
    channels,
    writeable: channels.filter((channel) => channel.blockReason === null),
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
