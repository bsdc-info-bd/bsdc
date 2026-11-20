import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Channel,
  CommunityEvent,
  EventDetail,
  Group,
  GroupMemberEntry,
  GroupRole,
  GroupSummary,
  JoinRequest,
  JoinStatus,
  RsvpStatus,
} from '@/lib/communities/community-types';
import type { EventUpdate } from '@/lib/communities/community-repository';
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

export interface EventDetailResult {
  event: EventDetail | null;
  isLoading: boolean;
  isError: boolean;
  /** True when the reader may not see this event: private group, or no such slug. */
  isNotFound: boolean;
  rsvp: (status: RsvpStatus) => void;
  isSaving: boolean;
  saveFailed: boolean;
}

/** One event page, with the caller's RSVP. The going count comes back from the server. */
export function useEventDetail(slug: string): EventDetailResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const key = ['event-detail', uid, slug];

  const query = useQuery({
    queryKey: key,
    queryFn: async () => (await repository()).fetchEventDetail(slug),
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async ({ eventId, status }: { eventId: string; status: RsvpStatus }) =>
      (await repository()).rsvpEvent(eventId, status),
    onSuccess: (going, { status }) => {
      queryClient.setQueryData<EventDetail | null>(key, (current) =>
        current ? { ...current, myStatus: status, going } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['event-calendar'] });
    },
  });

  const eventId = query.data?.id ?? null;

  return {
    event: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    isNotFound: !query.isLoading && !query.isError && query.data === null,
    rsvp: (status) => {
      if (eventId !== null) mutation.mutate({ eventId, status });
    },
    isSaving: mutation.isPending,
    saveFailed: mutation.isError,
  };
}

/**
 * The viewer's role in the group organising an event, if it belongs to one.
 *
 * Only asked when the event names a group and the reader is signed in; the
 * answer decides whether the page offers its edit controls, and the routine
 * decides again on the write.
 */
export function useEventGroupRole(groupId: string | null): GroupRole | null {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const query = useQuery({
    queryKey: ['event-group-role', groupId, uid],
    queryFn: async () => {
      if (groupId === null || uid === null) return null;
      return (await repository()).fetchEventGroupRole(groupId, uid);
    },
    enabled: groupId !== null && uid !== null,
    staleTime: 60_000,
  });
  return query.data ?? null;
}

// ----------------------- correcting and ending a group -----------------------

/**
 * What `update_group` takes. Named here rather than reached for with an inline
 * `import()` type, which the lint rules forbid for good reason: an inline import
 * type is invisible to the module graph and hides the dependency.
 */
export type GroupUpdateInput = {
  name: string;
  description: string;
  rules?: string | null;
  privacy?: Group['privacy'] | null;
  language?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
};

export interface GroupOwnerActions {
  save: (
    groupId: string,
    input: GroupUpdateInput,
  ) => Promise<void>;
  remove: (groupId: string) => Promise<void>;
  isSaving: boolean;
  isRemoving: boolean;
}

/**
 * What a group's moderators may do to it (migration 0128).
 *
 * `update_group` decides who may correct a group — a moderator, admin or owner,
 * or staff — and only its owner (or staff) may delete it. The button that opens
 * this hook's form is offered on the same rule, so a member never sees a control
 * that would refuse them.
 */
export function useGroupOwnerActions(): GroupOwnerActions {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['group'] });
    void queryClient.invalidateQueries({ queryKey: ['group-directory'] });
    void queryClient.invalidateQueries({ queryKey: ['groups'] });
    void queryClient.invalidateQueries({ queryKey: ['search'] });
  };

  const save = useMutation({
    mutationFn: async ({
      groupId,
      input,
    }: {
      groupId: string;
      input: GroupUpdateInput;
    }) => (await repository()).updateGroup(groupId, input),
    onSuccess: invalidate,
    onError: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (groupId: string) => (await repository()).deleteGroup(groupId),
    onSuccess: invalidate,
    onError: invalidate,
  });

  return {
    save: (groupId, input) => save.mutateAsync({ groupId, input }),
    remove: (groupId) => remove.mutateAsync(groupId),
    isSaving: save.isPending,
    isRemoving: remove.isPending,
  };
}

export interface EventOwnerActions {
  save: (
    eventId: string,
    draft: EventUpdate,
  ) => Promise<string>;
  cancel: (eventId: string) => Promise<void>;
  remove: (eventId: string) => Promise<void>;
  isSaving: boolean;
  isCancelling: boolean;
  isRemoving: boolean;
}

/** What an event's host may do to it. The server re-checks host, group and staff. */
export function useEventOwnerActions(): EventOwnerActions {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['event-detail'] });
    void queryClient.invalidateQueries({ queryKey: ['event-calendar'] });
    void queryClient.invalidateQueries({ queryKey: ['search'] });
  };

  const save = useMutation({
    mutationFn: async ({
      eventId,
      draft,
    }: {
      eventId: string;
      draft: EventUpdate;
    }) => (await repository()).updateEvent(eventId, draft),
    onSuccess: invalidate,
    onError: invalidate,
  });

  const cancel = useMutation({
    mutationFn: async (eventId: string) => (await repository()).cancelEvent(eventId),
    onSuccess: invalidate,
    onError: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (eventId: string) => (await repository()).deleteEvent(eventId),
    onSuccess: invalidate,
    onError: invalidate,
  });

  return {
    save: (eventId, draft) => save.mutateAsync({ eventId, draft }),
    cancel: (eventId) => cancel.mutateAsync(eventId),
    remove: (eventId) => remove.mutateAsync(eventId),
    isSaving: save.isPending,
    isCancelling: cancel.isPending,
    isRemoving: remove.isPending,
  };
}
