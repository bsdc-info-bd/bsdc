/**
 * BSDC — src/entities/group/model.ts
 * Purpose : The group entity: privacy model, membership roles and defaults.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Three privacy levels, and the difference is enforced in rules, not in the UI:
 *   public  — anyone may read the group and its posts
 *   closed  — anyone may see the group and ask to join; posts are members-only
 *   secret  — the group is invisible to non-members and unsearchable
 *   Membership is a separate document keyed by uid, which makes "am I a member" a single read
 *   and lets the rules authorise a group read with one `exists()` call.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { slugify } from '@/shared/lib/slugify';
import { uid } from '@/shared/lib/uid';

/** Group privacy levels. */
export const GROUP_PRIVACIES = ['public', 'closed', 'secret'] as const;
export type GroupPrivacy = (typeof GROUP_PRIVACIES)[number];

/** Roles inside a group. */
export const GROUP_ROLES = ['member', 'manager'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

/** A BSDC group. */
export interface Group {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly coverUrl: string;
  readonly avatarUrl: string;
  readonly privacy: GroupPrivacy;
  readonly category: string;
  readonly region: string;
  readonly district: string;
  readonly rules: string;
  readonly tags: readonly string[];
  readonly ownerUid: string;
  readonly memberCount: number;
  readonly postCount: number;
  readonly requiresApproval: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** Membership of one account in one group. */
export interface GroupMember {
  /** Equals `${groupId}:${uid}`. */
  readonly id: string;
  readonly groupId: string;
  readonly uid: string;
  readonly role: GroupRole;
  readonly joinedAt: string;
  readonly notifications: boolean;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** Fields required to create a group. */
export interface NewGroupInput {
  readonly name: string;
  readonly description: string;
  readonly privacy: GroupPrivacy;
  readonly ownerUid: string;
  readonly category?: string | undefined;
  readonly region?: string | undefined;
  readonly district?: string | undefined;
  readonly rules?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly id?: string | undefined;
  readonly now?: Date | undefined;
}

/**
 * Builds a group entity from the create form.
 * @param input form values
 * @returns a complete group entity
 */
export function newGroup(input: NewGroupInput): Group {
  const now = (input.now ?? new Date()).toISOString();
  const id = input.id ?? uid();
  return {
    id,
    name: input.name.trim().slice(0, 80),
    slug: slugify(input.name) || id.slice(0, 8),
    description: input.description.trim().slice(0, 2000),
    coverUrl: '',
    avatarUrl: '',
    privacy: input.privacy,
    category: input.category ?? '',
    region: input.region ?? '',
    district: input.district ?? '',
    rules: input.rules ?? '',
    tags: input.tags ?? [],
    ownerUid: input.ownerUid,
    memberCount: 1,
    postCount: 0,
    requiresApproval: input.privacy !== 'public',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Builds the owner's membership record for a new group.
 * @param group the group
 * @returns the membership entity
 */
export function ownerMembership(group: Group): GroupMember {
  const now = new Date().toISOString();
  return {
    id: `${group.id}:${group.ownerUid}`,
    groupId: group.id,
    uid: group.ownerUid,
    role: 'manager',
    joinedAt: now,
    notifications: true,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Builds a membership record for someone joining.
 * @param groupId group id
 * @param uid account id
 * @param role membership role
 * @returns the membership entity
 */
export function newMembership(
  groupId: string,
  uid: string,
  role: GroupRole = 'member',
): GroupMember {
  const now = new Date().toISOString();
  return {
    id: `${groupId}:${uid}`,
    groupId,
    uid,
    role,
    joinedAt: now,
    notifications: true,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Route of a group.
 * @param group the group
 * @returns the group path
 */
export function groupHref(group: Group): string {
  return `/groups/${group.slug}`;
}

/**
 * Reports whether a group's content is visible to a non-member.
 * @param group the group
 * @param isMember whether the viewer is a member
 * @returns true when the viewer may read the group's posts
 */
export function groupContentVisible(group: Group, isMember: boolean): boolean {
  if (group.privacy === 'public') return true;
  return isMember;
}
