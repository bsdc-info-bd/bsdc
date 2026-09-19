/**
 * BSDC — src/entities/group/requests.ts
 * Purpose : Join requests, group roles and the visibility rule a secret group relies on.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A public group anyone may enter. A closed group anyone may see and ask to enter. A
 *   secret group nobody may even see unless they are already in it — and that difference is made
 *   in firestore.rules, not in a component that forgets to hide a card. `groupVisibleTo` exists so
 *   the client renders the same answer the rules would give, never a more generous one.
 *   A join request is a document per person per group, so asking twice updates one record rather
 *   than creating two, and withdrawing is a delete a manager never has to arbitrate.
 *   Roles: a manager may promote a member to manager and demote a manager, but may not demote the
 *   owner, because the owner is a field on the group and not a membership row anybody can rewrite.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { TEXT_LIMITS } from '@/core/config/limits';
import { sanitizeText } from '@/shared/lib/text';
import type { Group, GroupRole } from './model';

/** States a join request can hold. */
export const JOIN_REQUEST_STATES = ['pending', 'approved', 'declined', 'withdrawn'] as const;
export type JoinRequestState = (typeof JOIN_REQUEST_STATES)[number];

/** The two decisions a reviewer may take. */
export const JOIN_DECISIONS = ['approved', 'declined'] as const;
export type JoinDecision = (typeof JOIN_DECISIONS)[number];

/** One person's request to join one group. The document id is `${groupId}:${uid}`. */
export interface GroupJoinRequest {
  readonly id: string;
  readonly groupId: string;
  readonly uid: string;
  /** Why they want in, in their own words. May be empty for a public group. */
  readonly message: string;
  readonly state: JoinRequestState;
  readonly decidedByUid: string;
  readonly decidedAt: string | null;
  /** Set when a manager declined with a reason, so the refusal is not silent. */
  readonly decisionNote: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** Input for a new request. */
export interface NewJoinRequestInput {
  readonly groupId: string;
  readonly uid: string;
  readonly message?: string | undefined;
  readonly now?: Date | undefined;
}

/** Rank of a group role; higher wins. Used by every "may I do this to them" question. */
const GROUP_ROLE_RANK: Readonly<Record<GroupRole, number>> = {
  member: 0,
  manager: 1,
};

/**
 * Builds a join request.
 * @param input group, person and their message
 * @returns the request entity
 */
export function newJoinRequest(input: NewJoinRequestInput): GroupJoinRequest {
  const now = (input.now ?? new Date()).toISOString();
  return {
    id: `${input.groupId}:${input.uid}`,
    groupId: input.groupId,
    uid: input.uid,
    message: sanitizeText(input.message ?? '').slice(0, TEXT_LIMITS.joinRequestMessage),
    state: 'pending',
    decidedByUid: '',
    decidedAt: null,
    decisionNote: '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Reports whether a group asks people to request entry rather than letting them walk in.
 * @param group the group
 * @returns true when a request is required
 */
export function requiresJoinRequest(group: Group): boolean {
  return group.privacy !== 'public' || group.requiresApproval;
}

/**
 * Reports whether the viewer may see the group at all.
 *
 * This is the client-side half of the read rule. It is deliberately no more permissive than
 * firestore.rules, so a component cannot accidentally reveal a secret group that the server would
 * refuse to serve anyway.
 *
 * @param group the group
 * @param viewerUid the viewer's account id, or null when signed out
 * @param isMember whether the viewer is a member
 * @param isStaff whether the viewer holds support claims or above
 * @returns true when the group may be shown
 */
export function groupVisibleTo(
  group: Group,
  viewerUid: string | null,
  isMember: boolean,
  isStaff = false,
): boolean {
  if (group.privacy !== 'secret') return true;
  if (isStaff) return true;
  if (viewerUid === null) return false;
  return isMember || viewerUid === group.ownerUid;
}

/**
 * Reports whether the viewer may read the group's posts.
 * @param group the group
 * @param isMember whether the viewer is a member
 * @returns true when the content is readable
 */
export function groupContentVisible(group: Group, isMember: boolean): boolean {
  return group.privacy === 'public' || isMember;
}

/**
 * Reports whether one account outranks another inside a group.
 * @param actor the acting role
 * @param target the target's role
 * @returns true when the actor may act on the target
 */
export function outranks(actor: GroupRole, target: GroupRole): boolean {
  return GROUP_ROLE_RANK[actor] > GROUP_ROLE_RANK[target];
}

/**
 * Reports whether an actor may review join requests for a group.
 * @param group the group
 * @param uid the acting account
 * @param role the acting account's group role, or null when they are not a member
 * @param isStaff whether the acting account holds moderator claims or above
 * @returns true when they may approve and decline
 */
export function mayReviewRequests(
  group: Group,
  uid: string,
  role: GroupRole | null,
  isStaff = false,
): boolean {
  if (isStaff) return true;
  if (uid === group.ownerUid) return true;
  return role === 'manager';
}

/**
 * Reports whether an actor may assign a role to a target.
 *
 * Only the group's owner, or staff, may make somebody a manager. That is stricter than "a manager
 * may promote a member" and deliberately so: with two tiers, letting a manager mint another
 * manager hands out the keys to the group to anybody who was asked once, and the owner would then
 * need staff intervention to take them back. A manager may still remove a member
 * (`mayRemoveMember`), which is the power a manager actually needs day to day.
 *
 * @param group the group
 * @param actorUid the acting account
 * @param actorRole the acting account's role
 * @param targetUid the account being changed
 * @param targetRole the target's current role
 * @param next the role being assigned
 * @param isStaff whether the acting account holds moderator claims or above
 * @returns true when the assignment may proceed
 */
export function mayAssignRole(
  group: Group,
  actorUid: string,
  actorRole: GroupRole | null,
  targetUid: string,
  targetRole: GroupRole,
  next: GroupRole,
  isStaff = false,
): boolean {
  if (targetUid === group.ownerUid) return false;
  if (targetUid === actorUid) return false;
  if (next === targetRole) return false;
  if (isStaff || actorUid === group.ownerUid) return true;
  // A manager may only ever hand out a role beneath their own. With two member tiers there is no
  // such role today, so the answer is no; the comparison is written out rather than hardcoded so
  // that adding a tier later cannot accidentally grant it to every manager.
  return actorRole !== null && GROUP_ROLE_RANK[next] < GROUP_ROLE_RANK[actorRole];
}

/**
 * Reports whether an actor may remove somebody from a group.
 * @param group the group
 * @param actorUid the acting account
 * @param actorRole the acting account's role
 * @param targetUid the account being removed
 * @param isStaff whether the acting account holds moderator claims or above
 * @returns true when the removal may proceed
 */
export function mayRemoveMember(
  group: Group,
  actorUid: string,
  actorRole: GroupRole | null,
  targetUid: string,
  isStaff = false,
): boolean {
  if (targetUid === group.ownerUid) return false;
  if (targetUid === actorUid) return true;
  if (isStaff || actorUid === group.ownerUid) return true;
  return actorRole === 'manager';
}

/**
 * Decides a pending request.
 * @param request the request
 * @param decision the reviewer's decision
 * @param reviewerUid the reviewer
 * @param note an optional reason, required in practice when declining
 * @param now the instant of the decision
 * @returns the decided request, or null when the request is not pending
 */
export function decideJoinRequest(
  request: GroupJoinRequest,
  decision: JoinDecision,
  reviewerUid: string,
  note = '',
  now: Date = new Date(),
): GroupJoinRequest | null {
  if (request.state !== 'pending') return null;
  const at = now.toISOString();
  return {
    ...request,
    state: decision,
    decidedByUid: reviewerUid,
    decidedAt: at,
    decisionNote: sanitizeText(note).slice(0, TEXT_LIMITS.joinRequestNote),
    updatedAt: at,
  };
}

/**
 * Withdraws a request, which only the person who made it may do.
 * @param request the request
 * @param uid the withdrawing account
 * @param now the instant
 * @returns the withdrawn request, or null when somebody else tried
 */
export function withdrawJoinRequest(
  request: GroupJoinRequest,
  uid: string,
  now: Date = new Date(),
): GroupJoinRequest | null {
  if (request.uid !== uid) return null;
  if (request.state !== 'pending') return null;
  const at = now.toISOString();
  return { ...request, state: 'withdrawn', updatedAt: at, deletedAt: at };
}

/**
 * Finds the viewer's own request, so the button says "requested" instead of "join".
 * @param requests the group's requests
 * @param uid the viewer
 * @returns their request, or undefined
 */
export function myJoinRequest(
  requests: readonly GroupJoinRequest[],
  uid: string,
): GroupJoinRequest | undefined {
  return requests.find((request) => request.uid === uid && request.deletedAt == null);
}

/**
 * Counts requests still waiting on a decision.
 * @param requests the group's requests
 * @returns the pending count
 */
export function countPendingRequests(requests: readonly GroupJoinRequest[]): number {
  return requests.filter((request) => request.state === 'pending' && request.deletedAt == null)
    .length;
}

/**
 * Orders requests for a reviewer: waiting first, then newest first.
 * @param requests the group's requests
 * @returns the ordered requests
 */
export function sortJoinRequests(
  requests: readonly GroupJoinRequest[],
): readonly GroupJoinRequest[] {
  return [...requests]
    .filter((request) => request.deletedAt == null)
    .sort((a, b) => {
      const pendingDelta = Number(b.state === 'pending') - Number(a.state === 'pending');
      if (pendingDelta !== 0) return pendingDelta;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

/**
 * Labels the action a viewer can take on a group, which is the only question the join button
 * actually asks.
 *
 * A declined applicant may ask again: a group's membership changes, a note can be answered, and
 * refusing to let somebody re-apply for something they were refused once is the kind of rule that
 * outlives its reason. The decline note is shown next to the button rather than instead of it.
 *
 * @param group the group
 * @param isMember whether the viewer is a member
 * @param request the viewer's request, when they have one
 * @returns the action to offer
 */
export function joinAction(
  group: Group,
  isMember: boolean,
  request: GroupJoinRequest | undefined,
): 'leave' | 'pending' | 'request' | 'join' {
  if (isMember) return 'leave';
  if (request?.state === 'pending') return 'pending';
  return requiresJoinRequest(group) ? 'request' : 'join';
}
