import type {
  DbEventMode,
  DbGroupPrivacy,
  DbGroupRole,
  DbJoinStatus,
  DbRsvpStatus,
} from '@/lib/supabase/types';

export type GroupPrivacy = DbGroupPrivacy;
export type GroupRole = DbGroupRole;
export type JoinStatus = DbJoinStatus;
export type RsvpStatus = DbRsvpStatus;
export type EventMode = DbEventMode;

export interface GroupSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  privacy: GroupPrivacy;
  avatarUrl: string;
  members: number;
  posts: number;
  myRole: GroupRole | null;
  requestStatus: JoinStatus | null;
}

export interface Group extends GroupSummary {
  coverUrl: string;
  rules: string;
  language: string;
  ownerUid: string;
  isArchived: boolean;
  createdAt: string;
}

export interface Channel {
  id: string;
  groupId: string;
  slug: string;
  name: string;
  topic: string;
  position: number;
  isReadOnly: boolean;
}

export interface GroupMemberEntry {
  uid: string;
  role: GroupRole;
  joinedAt: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

export interface JoinRequest {
  uid: string;
  status: JoinStatus;
  message: string;
  createdAt: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

export interface CommunityPage {
  id: string;
  slug: string;
  name: string;
  category: string;
  about: string;
  avatarUrl: string;
  coverUrl: string;
  website: string;
  ownerUid: string;
  followers: number;
  isVerified: boolean;
}

export interface CommunityEvent {
  id: string;
  slug: string;
  title: string;
  mode: EventMode;
  venue: string;
  city: string;
  coverUrl: string;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  going: number;
  groupId: string | null;
  pageId: string | null;
  myStatus: RsvpStatus | null;
}

const ROLE_RANK: Record<GroupRole, number> = { owner: 3, admin: 2, moderator: 1, member: 0 };

/** True when the role may edit the group, its channels and its members. */
export function canModerateGroup(role: GroupRole | null): boolean {
  return role !== null && ROLE_RANK[role] >= ROLE_RANK.moderator;
}

export function canAdministerGroup(role: GroupRole | null): boolean {
  return role !== null && ROLE_RANK[role] >= ROLE_RANK.admin;
}

export type JoinAction = 'join' | 'request' | 'pending' | 'open' | 'closed';

/**
 * What the join control should offer, given the group's privacy and this
 * member's current standing. Pure, so the button can never disagree with the
 * database's own rules in `public.join_group()`.
 */
export function joinAction(group: GroupSummary, signedIn: boolean): JoinAction {
  if (group.myRole !== null) return 'open';
  if (!signedIn) return 'closed';
  if (group.requestStatus === 'pending') return 'pending';
  if (group.privacy === 'public') return 'join';
  if (group.privacy === 'private') return 'request';
  return 'closed';
}

/** Members are listed by rank, then by how long they have been there. */
export function sortMembers(members: readonly GroupMemberEntry[]): GroupMemberEntry[] {
  return [...members].sort((a, b) => {
    const rank = ROLE_RANK[b.role] - ROLE_RANK[a.role];
    return rank !== 0 ? rank : Date.parse(a.joinedAt) - Date.parse(b.joinedAt);
  });
}

export function isEventFull(event: CommunityEvent): boolean {
  return event.capacity !== null && event.going >= event.capacity && event.myStatus !== 'going';
}

export function isEventLive(event: CommunityEvent, now: number = Date.now()): boolean {
  return Date.parse(event.startsAt) <= now && Date.parse(event.endsAt) > now;
}

/** Groups upcoming events by calendar day, in chronological order. */
export function groupEventsByDay(
  events: readonly CommunityEvent[],
): { day: string; events: CommunityEvent[] }[] {
  const days = new Map<string, CommunityEvent[]>();

  for (const event of [...events].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))) {
    const day = event.startsAt.slice(0, 10);
    const bucket = days.get(day);
    if (bucket === undefined) {
      days.set(day, [event]);
    } else {
      bucket.push(event);
    }
  }

  return [...days.entries()].map(([day, list]) => ({ day, events: list }));
}
