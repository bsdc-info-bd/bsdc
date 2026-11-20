import { wakePushDelivery } from '@/lib/push/wake';
import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type {
  ChannelRow,
  EventCalendarRow,
  EventDetailRow,
  GroupDirectoryRow,
  GroupJoinRequestRow,
  GroupMemberRow,
  GroupRow,
  PageRow,
} from '@/lib/supabase/types';
import type {
  Channel,
  CommunityEvent,
  EventDetail,
  CommunityPage,
  Group,
  GroupMemberEntry,
  GroupPrivacy,
  GroupRole,
  GroupSummary,
  JoinRequest,
  JoinStatus,
  RsvpStatus,
} from './community-types';

interface ProfileJoin {
  uid: string;
  username: string;
  display_name: string;
  avatar_url: string;
}

function toSummary(row: GroupDirectoryRow): GroupSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    privacy: row.privacy,
    avatarUrl: row.avatar_url,
    members: row.members_count,
    posts: row.posts_count,
    myRole: row.my_role,
    requestStatus: row.request_status,
  };
}

export async function fetchGroupDirectory(limit = 40): Promise<GroupSummary[]> {
  const { data, error } = await getSupabase()
    .rpc('group_directory', { p_limit: limit })
    .returns<GroupDirectoryRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toSummary);
}

/** One group by slug, with this member's own role resolved separately. */
export async function fetchGroup(slug: string, viewerUid: string | null): Promise<Group | null> {
  const { data, error } = await getSupabase()
    .from('groups')
    .select('*')
    .eq('slug', slug)
    .maybeSingle<GroupRow>();
  if (error && error.code !== 'PGRST116') throw toDataError(error);
  if (!data) return null;

  let myRole: GroupRole | null = null;
  let requestStatus: JoinStatus | null = null;

  if (viewerUid !== null) {
    const { data: membership } = await getSupabase()
      .from('group_members')
      .select('role')
      .eq('group_id', data.id)
      .eq('uid', viewerUid)
      .maybeSingle();
    myRole = membership?.role ?? null;

    if (myRole === null) {
      const { data: request } = await getSupabase()
        .from('group_join_requests')
        .select('status')
        .eq('group_id', data.id)
        .eq('uid', viewerUid)
        .maybeSingle();
      requestStatus = request?.status ?? null;
    }
  }

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    description: data.description,
    privacy: data.privacy,
    avatarUrl: data.avatar_url,
    coverUrl: data.cover_url,
    rules: data.rules,
    language: data.language,
    ownerUid: data.owner_uid,
    members: data.members_count,
    posts: data.posts_count,
    isArchived: data.is_archived,
    createdAt: data.created_at,
    myRole,
    requestStatus,
  };
}

export async function fetchChannels(groupId: string): Promise<Channel[]> {
  const { data, error } = await getSupabase()
    .from('channels')
    .select('*')
    .eq('group_id', groupId)
    .order('position', { ascending: true })
    .returns<ChannelRow[]>();
  if (error) throw toDataError(error);

  return (data ?? []).map((row) => ({
    id: row.id,
    groupId: row.group_id,
    slug: row.slug,
    name: row.name,
    topic: row.topic,
    position: row.position,
    isReadOnly: row.is_read_only,
  }));
}

type JoinedMemberRow = GroupMemberRow & { profiles: ProfileJoin | null };

export async function fetchGroupMembers(groupId: string): Promise<GroupMemberEntry[]> {
  const { data, error } = await getSupabase()
    .from('group_members')
    .select(
      'group_id, uid, role, joined_at, muted_until, profiles:uid (uid, username, display_name, avatar_url)',
    )
    .eq('group_id', groupId)
    .limit(200)
    .returns<JoinedMemberRow[]>();
  if (error) throw toDataError(error);

  return (data ?? []).map((row) => ({
    uid: row.uid,
    role: row.role,
    joinedAt: row.joined_at,
    username: row.profiles?.username ?? '',
    displayName: row.profiles?.display_name ?? '',
    avatarUrl: row.profiles?.avatar_url ?? '',
  }));
}

type JoinedRequestRow = GroupJoinRequestRow & { profiles: ProfileJoin | null };

export async function fetchJoinRequests(groupId: string): Promise<JoinRequest[]> {
  const { data, error } = await getSupabase()
    .from('group_join_requests')
    .select(
      'group_id, uid, status, message, decided_by, decided_at, created_at, profiles:uid (uid, username, display_name, avatar_url)',
    )
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .returns<JoinedRequestRow[]>();
  if (error) throw toDataError(error);

  return (data ?? []).map((row) => ({
    uid: row.uid,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
    username: row.profiles?.username ?? '',
    displayName: row.profiles?.display_name ?? '',
    avatarUrl: row.profiles?.avatar_url ?? '',
  }));
}

export async function createGroup(input: {
  slug: string;
  name: string;
  description: string;
  privacy: GroupPrivacy;
  language: string;
}): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_group', {
    p_slug: input.slug,
    p_name: input.name,
    p_description: input.description,
    p_privacy: input.privacy,
    p_language: input.language,
  });
  if (error) throw toDataError(error);
  return typeof data === 'string' ? data : '';
}

export async function joinGroup(groupId: string, message = ''): Promise<JoinStatus> {
  const { data, error } = await getSupabase().rpc('join_group', {
    p_group_id: groupId,
    p_message: message,
  });
  if (error) throw toDataError(error);
  wakePushDelivery();
  return (data as JoinStatus | null) ?? 'pending';
}

export async function leaveGroup(groupId: string): Promise<void> {
  const { error } = await getSupabase().rpc('leave_group', { p_group_id: groupId });
  if (error) throw toDataError(error);
}

export async function decideJoinRequest(
  groupId: string,
  uid: string,
  approve: boolean,
): Promise<void> {
  const { error } = await getSupabase().rpc('decide_join_request', {
    p_group_id: groupId,
    p_uid: uid,
    p_approve: approve,
  });
  if (error) throw toDataError(error);
  wakePushDelivery();
}

export async function setGroupRole(groupId: string, uid: string, role: GroupRole): Promise<void> {
  const { error } = await getSupabase().rpc('set_group_role', {
    p_group_id: groupId,
    p_uid: uid,
    p_role: role,
  });
  if (error) throw toDataError(error);
}

export async function createChannel(
  groupId: string,
  slug: string,
  name: string,
  topic: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from('channels')
    .insert({ group_id: groupId, slug, name, topic });
  if (error) throw toDataError(error);
}

/**
 * Corrects a group in place (migration 0128).
 *
 * `update_group` decides who may do this — `bsdc.can_moderate_group`, the same
 * rule the row-level policy applies — so this module carries no opinion about
 * it. A `null` for an optional argument leaves that field untouched.
 */
export async function updateGroup(
  groupId: string,
  input: {
    name: string;
    description: string;
    rules?: string | null;
    privacy?: GroupPrivacy | null;
    language?: string | null;
    avatarUrl?: string | null;
    coverUrl?: string | null;
  },
): Promise<void> {
  const { error } = await getSupabase().rpc('update_group', {
    p_group_id: groupId,
    p_name: input.name,
    p_description: input.description,
    p_rules: input.rules ?? null,
    p_privacy: input.privacy ?? null,
    p_language: input.language ?? null,
    p_avatar_url: input.avatarUrl ?? null,
    p_cover_url: input.coverUrl ?? null,
  });
  if (error) throw toDataError(error);
}

/**
 * Ends a group. Owner or staff only.
 *
 * The consequences are the server's to state and this comment repeats them so
 * the confirmation a member reads matches what will happen: the channels go
 * with the group, its posts are detached from the channel and archived rather
 * than destroyed, and events that belonged to it lose their group and keep
 * their RSVPs.
 */
export async function deleteGroup(groupId: string): Promise<void> {
  const { error } = await getSupabase().rpc('delete_group', { p_group_id: groupId });
  if (error) throw toDataError(error);
}

// -------------------------------- events ------------------------------------

function toEvent(row: EventCalendarRow): CommunityEvent {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    mode: row.mode,
    venue: row.venue,
    city: row.city,
    coverUrl: row.cover_url,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    capacity: row.capacity,
    going: row.going_count,
    groupId: row.group_id,
    pageId: row.page_id,
    myStatus: row.my_status,
  };
}

export async function fetchEventCalendar(limit = 40): Promise<CommunityEvent[]> {
  const { data, error } = await getSupabase()
    .rpc('event_calendar', { p_limit: limit })
    .returns<EventCalendarRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toEvent);
}

export async function rsvpEvent(eventId: string, status: RsvpStatus): Promise<number> {
  const { data, error } = await getSupabase().rpc('rsvp_event', {
    p_event_id: eventId,
    p_status: status,
  });
  if (error) throw toDataError(error);
  wakePushDelivery();
  return typeof data === 'number' ? data : 0;
}

function toEventDetail(row: EventDetailRow): EventDetail {
  return {
    ...toEvent(row),
    description: row.description,
    joinUrl: row.join_url,
    timezone: row.timezone,
    isCancelled: row.is_cancelled,
    hostUid: row.host_uid,
  };
}

/** One event by slug. Null when the event is not visible to this reader. */
export async function fetchEventDetail(slug: string): Promise<EventDetail | null> {
  const { data, error } = await getSupabase()
    .rpc('event_detail', { p_slug: slug })
    .returns<EventDetailRow[]>();
  if (error) throw toDataError(error);
  const row = data?.[0];
  return row ? toEventDetail(row) : null;
}

/**
 * The viewer's role in the group that is organising an event.
 *
 * `event_detail` reports the event, not what the reader may do to it, and
 * extending a proven routine's return type to answer a question about a
 * *different* table would be worse than asking the table. `group_members` is
 * readable to its own members under the policy in 0012, so this answers for a
 * member and quietly answers `null` for everybody else — which is exactly the
 * shape `canModerateGroup` wants.
 */
export async function fetchEventGroupRole(
  groupId: string,
  viewerUid: string,
): Promise<GroupRole | null> {
  const { data, error } = await getSupabase()
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('uid', viewerUid)
    .maybeSingle();
  if (error) throw toDataError(error);
  return data?.role ?? null;
}

// ------------------------- correcting an event -------------------------------

/** What `update_event` takes, as the page's edit form sends it. */
export interface EventUpdate {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  mode?: EventDetail['mode'];
  venue?: string;
  city?: string;
  joinUrl?: string;
  coverUrl?: string | null;
  timezone?: string;
  capacity?: number | null;
  slug?: string | null;
}

/**
 * Corrects an event in place (migration 0128).
 *
 * Its host, a moderator of the group it belongs to, or staff — decided by the
 * routine. Attendees are told when the date moves, because a moved event is the
 * one correction somebody else has to hear about.
 */
export async function updateEvent(eventId: string, draft: EventUpdate): Promise<string> {
  const { data, error } = await getSupabase().rpc('update_event', {
    p_event_id: eventId,
    p_title: draft.title,
    p_description: draft.description,
    p_starts_at: draft.startsAt,
    p_ends_at: draft.endsAt,
    p_mode: draft.mode ?? null,
    p_venue: draft.venue ?? null,
    p_city: draft.city ?? null,
    p_join_url: draft.joinUrl ?? null,
    p_cover_url: draft.coverUrl ?? null,
    p_timezone: draft.timezone ?? null,
    p_capacity: draft.capacity ?? null,
    p_slug: draft.slug ?? null,
  });
  if (error) throw toDataError(error);
  return typeof data === 'string' ? data : '';
}

/** Marks an event cancelled. Its page and every RSVP survive; attendees are told. */
export async function cancelEvent(eventId: string): Promise<void> {
  const { error } = await getSupabase().rpc('cancel_event', { p_event_id: eventId });
  if (error) throw toDataError(error);
  wakePushDelivery();
}

/** Removes an event and its RSVPs. Everyone who had not declined is told. */
export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await getSupabase().rpc('delete_event', { p_event_id: eventId });
  if (error) throw toDataError(error);
}

// --------------------------------- pages -------------------------------------

function toPage(row: PageRow): CommunityPage {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    about: row.about,
    avatarUrl: row.avatar_url,
    coverUrl: row.cover_url,
    website: row.website,
    ownerUid: row.owner_uid,
    followers: row.followers_count,
    isVerified: row.is_verified,
  };
}

export async function fetchPages(limit = 40): Promise<CommunityPage[]> {
  const { data, error } = await getSupabase()
    .from('pages')
    .select('*')
    .order('followers_count', { ascending: false })
    .limit(limit)
    .returns<PageRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toPage);
}

export async function togglePageFollow(pageId: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('toggle_page_follow', { p_page_id: pageId });
  if (error) throw toDataError(error);
  if (data === true) wakePushDelivery();
  return data === true;
}
