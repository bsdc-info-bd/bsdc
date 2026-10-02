import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Channel,
  CommunityEvent,
  Group,
  GroupMemberEntry,
  GroupSummary,
  JoinRequest,
  JoinStatus,
  RsvpStatus,
} from '@/lib/communities/community-types';
import { useAuthStore } from '@/store/auth-store';

// Loaded on demand: the Supabase client must stay out of the entry chunk.
const repository = () => import('@/lib/communities/community-repository');

export interface GroupDirectoryResult {
  groups: GroupSummary[];
  isLoading: boolean;
  isError: boolean;
  join: (groupId: string) => Promise<JoinStatus>;
  isJoining: boolean;
}

export function useGroupDirectory(): GroupDirectoryResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['group-directory', uid],
    queryFn: async () => (await repository()).fetchGroupDirectory(),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: async (groupId: string) => (await repository()).joinGroup(groupId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['group-directory'] });
      void queryClient.invalidateQueries({ queryKey: ['group'] });
    },
  });

  return {
    groups: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    join: (groupId) => mutation.mutateAsync(groupId),
    isJoining: mutation.isPending,
  };
}

export interface GroupDetailResult {
  group: Group | null;
  channels: Channel[];
  members: GroupMemberEntry[];
  requests: JoinRequest[];
  isLoading: boolean;
  isError: boolean;
  join: () => Promise<JoinStatus>;
  leave: () => Promise<void>;
  decide: (uid: string, approve: boolean) => Promise<void>;
  refresh: () => void;
}

/** One group with everything its page needs, loaded in dependent steps. */
export function useGroup(slug: string): GroupDetailResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();

  const groupQuery = useQuery({
    queryKey: ['group', slug, uid],
    queryFn: async () => (await repository()).fetchGroup(slug, uid),
    enabled: slug.length > 0,
    staleTime: 60_000,
  });

  const group = groupQuery.data ?? null;
  const groupId = group?.id ?? '';
  const canModerate =
    group !== null &&
    (group.myRole === 'owner' || group.myRole === 'admin' || group.myRole === 'moderator');

  const channelsQuery = useQuery({
    queryKey: ['group-channels', groupId],
    queryFn: async () => (await repository()).fetchChannels(groupId),
    enabled: groupId.length > 0,
    staleTime: 5 * 60_000,
  });

  const membersQuery = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: async () => (await repository()).fetchGroupMembers(groupId),
    enabled: groupId.length > 0,
    staleTime: 60_000,
  });

  const requestsQuery = useQuery({
    queryKey: ['group-requests', groupId],
    queryFn: async () => (await repository()).fetchJoinRequests(groupId),
    enabled: groupId.length > 0 && canModerate,
    staleTime: 30_000,
  });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['group', slug, uid] });
    void queryClient.invalidateQueries({ queryKey: ['group-members', groupId] });
    void queryClient.invalidateQueries({ queryKey: ['group-requests', groupId] });
  };

  const joinMutation = useMutation({
    mutationFn: async () => (await repository()).joinGroup(groupId),
    onSuccess: refresh,
  });

  const leaveMutation = useMutation({
    mutationFn: async () => (await repository()).leaveGroup(groupId),
    onSuccess: refresh,
  });

  const decideMutation = useMutation({
    mutationFn: async ({ memberUid, approve }: { memberUid: string; approve: boolean }) =>
      (await repository()).decideJoinRequest(groupId, memberUid, approve),
    onSuccess: refresh,
  });

  return {
    group,
    channels: channelsQuery.data ?? [],
    members: membersQuery.data ?? [],
    requests: requestsQuery.data ?? [],
    isLoading: groupQuery.isLoading,
    isError: groupQuery.isError,
    join: () => joinMutation.mutateAsync(),
    leave: () => leaveMutation.mutateAsync(),
    decide: async (memberUid, approve) => {
      await decideMutation.mutateAsync({ memberUid, approve });
    },
    refresh,
  };
}

export interface EventCalendarResult {
  events: CommunityEvent[];
  isLoading: boolean;
  isError: boolean;
  rsvp: (eventId: string, status: RsvpStatus) => void;
  isSaving: boolean;
}

export function useEventCalendar(): EventCalendarResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['event-calendar', uid],
    queryFn: async () => (await repository()).fetchEventCalendar(),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: async ({ eventId, status }: { eventId: string; status: RsvpStatus }) =>
      (await repository()).rsvpEvent(eventId, status),
    onMutate: ({ eventId, status }) => {
      const key = ['event-calendar', uid];
      const previous = queryClient.getQueryData<CommunityEvent[]>(key);
      queryClient.setQueryData<CommunityEvent[]>(key, (current = []) =>
        current.map((event) =>
          event.id === eventId
            ? {
                ...event,
                myStatus: status,
                going:
                  status === 'going' && event.myStatus !== 'going'
                    ? event.going + 1
                    : status !== 'going' && event.myStatus === 'going'
                      ? Math.max(event.going - 1, 0)
                      : event.going,
              }
            : event,
        ),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['event-calendar', uid], context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['event-calendar', uid] });
    },
  });

  return {
    events: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    rsvp: (eventId, status) => {
      mutation.mutate({ eventId, status });
    },
    isSaving: mutation.isPending,
  };
}
