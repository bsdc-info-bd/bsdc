/**
 * BSDC — src/entities/group/repository.ts
 * Purpose : Group persistence: listing, creating, joining, leaving and live membership.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Joining always writes a membership document keyed by uid, which is what the rules use
 *   to authorise `secret` group reads — so a join is effective the moment it is written, with no
 *   second index to catch up. Leaving is a soft delete for the same recovery guarantee as posts.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { QueryConstraint } from 'firebase/firestore';
import {
  COLLECTIONS,
  SUBCOLLECTIONS,
  groupJoinRequestPath,
  groupMemberPath,
} from '@/core/config/collections';
import { AppError } from '@/core/errors/AppError';
import { firestoreDb } from '@/services/firebase/app';
import { fromQuery, translateFirestoreError } from '@/services/firebase/firestore';
import { acquireListener, type Unsubscribe } from '@/services/realtime/registry';
import { mirrorGet, mirrorList, mirrorSoftDelete, mirrorPut } from '@/services/offline/mirror';
import {
  readThrough,
  writeThrough,
  type ReadThroughResult,
  type WriteThroughResult,
} from '@/services/offline/sync';
import {
  newMembership,
  ownerMembership,
  type Group,
  type GroupMember,
  type GroupPrivacy,
  type GroupRole,
} from './model';
import { sortJoinRequests, withdrawJoinRequest, type GroupJoinRequest } from './requests';

/** Groups loaded per page. */
export const GROUP_PAGE_SIZE = 24;

/** Options for a group listing. */
export interface GroupQuery {
  readonly limit?: number | undefined;
  readonly privacy?: GroupPrivacy | undefined;
  readonly category?: string | undefined;
}

/**
 * Lists groups, hiding secret groups the viewer does not belong to.
 * @param query listing options
 * @returns the groups with their provenance
 */
export async function listGroups(query: GroupQuery = {}): Promise<ReadThroughResult<Group>> {
  return await readThrough<Group>(
    'groups',
    async () => {
      const {
        collection,
        query: buildQuery,
        where,
        orderBy,
        limit,
        getDocs,
      } = await import('firebase/firestore');
      const db = await firestoreDb();
      const constraints: QueryConstraint[] = [
        where('deletedAt', '==', null),
        where('privacy', '==', query.privacy ?? 'public'),
        orderBy('memberCount', 'desc'),
        limit(query.limit ?? GROUP_PAGE_SIZE),
      ];
      if (query.category !== undefined) constraints.push(where('category', '==', query.category));
      try {
        const snapshot = await getDocs(
          buildQuery(collection(db, COLLECTIONS.groups), ...constraints),
        );
        return fromQuery<Group>(snapshot);
      } catch (error) {
        throw translateFirestoreError(error, 'group.list');
      }
    },
    {
      orderBy: 'memberCount',
      direction: 'desc',
      ...(query.category !== undefined
        ? { where: [(group: Group) => group.category === query.category] }
        : {}),
    },
  );
}

/**
 * Creates a group and the owner's membership record in one logical action.
 * @param group the group entity
 * @returns the write outcome
 */
export async function createGroup(group: Group): Promise<WriteThroughResult> {
  await mirrorPut('groups', group);
  await mirrorPut('groups', ownerMembership(group) as unknown as Group & { readonly id: string });
  return await writeThrough(
    'groups',
    group,
    {
      kind: 'group.create',
      entityId: group.id,
      payload: group as unknown as Readonly<Record<string, unknown>>,
    },
    async () => {
      const { doc, setDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await setDoc(doc(db, COLLECTIONS.groups, group.id), group);
        await setDoc(doc(db, groupMemberPath(group.id, group.ownerUid)), ownerMembership(group));
      } catch (error) {
        throw translateFirestoreError(error, 'group.create');
      }
    },
  );
}

/**
 * Joins a group.
 * @param groupId group id
 * @param uid account id
 * @returns the write outcome
 */
export async function joinGroup(groupId: string, uid: string): Promise<WriteThroughResult> {
  const membership = newMembership(groupId, uid);
  return await writeThrough(
    'groups',
    membership as unknown as Group & { readonly id: string },
    { kind: 'group.join', entityId: membership.id, payload: { groupId, uid } },
    async () => {
      const { doc, setDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await setDoc(doc(db, groupMemberPath(groupId, uid)), membership);
      } catch (error) {
        throw translateFirestoreError(error, 'group.join');
      }
    },
  );
}

/**
 * Leaves a group.
 * @param groupId group id
 * @param uid account id
 * @returns the write outcome
 */
export async function leaveGroup(groupId: string, uid: string): Promise<WriteThroughResult> {
  const now = new Date().toISOString();
  await mirrorSoftDelete('groups', `${groupId}:${uid}`, now);
  const existing =
    (await mirrorGet<GroupMember>('groups', `${groupId}:${uid}`)) ?? newMembership(groupId, uid);

  return await writeThrough(
    'groups',
    { ...existing, deletedAt: now, updatedAt: now } as unknown as Group & { readonly id: string },
    { kind: 'group.leave', entityId: `${groupId}:${uid}`, payload: { groupId, uid } },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, groupMemberPath(groupId, uid)), { deletedAt: now, updatedAt: now });
      } catch (error) {
        throw translateFirestoreError(error, 'group.leave');
      }
    },
  );
}

/**
 * Reads the viewer's membership of a group from the device mirror.
 * @param groupId group id
 * @param uid account id
 * @returns the membership, or undefined when the viewer is not a member
 */
export async function peekMembership(
  groupId: string,
  uid: string,
): Promise<GroupMember | undefined> {
  const membership = await mirrorGet<GroupMember>('groups', `${groupId}:${uid}`);
  if (membership === undefined || membership.deletedAt != null) return undefined;
  return membership;
}

/**
 * Lists the groups the viewer has joined from the device mirror.
 * @param uid account id
 * @returns the joined groups
 */
export async function listMyGroups(uid: string): Promise<readonly Group[]> {
  return await mirrorList<Group>('groups', {
    where: [(group: Group) => group.ownerUid === uid],
    orderBy: 'createdAt',
    direction: 'desc',
  });
}

/**
 * Watches the member list of a group.
 * @param groupId group id
 * @param handler receives the members
 * @returns a release function
 */
export function watchGroupMembers(
  groupId: string,
  handler: (members: readonly GroupMember[]) => void,
): Unsubscribe {
  return acquireListener(`group-members:${groupId}`, 'groups', async () => {
    const { collection, onSnapshot } = await import('firebase/firestore');
    const db = await firestoreDb();
    return onSnapshot(
      collection(db, COLLECTIONS.groups, groupId, SUBCOLLECTIONS.members),
      (snapshot) => {
        handler(fromQuery<GroupMember>(snapshot));
      },
    );
  });
}

/**
 * Asks to join a group that requires approval.
 * @param request the request entity, built by src/entities/group/requests.ts
 * @returns the write outcome
 */
export async function requestJoin(request: GroupJoinRequest): Promise<WriteThroughResult> {
  return await writeThrough(
    'joinRequests',
    request,
    {
      kind: 'group.request',
      entityId: request.id,
      payload: { groupId: request.groupId, uid: request.uid, message: request.message },
    },
    async () => {
      const { doc, setDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await setDoc(doc(db, groupJoinRequestPath(request.groupId, request.uid)), request);
      } catch (error) {
        throw translateFirestoreError(error, 'group.request');
      }
    },
  );
}

/**
 * Withdraws the viewer's own request.
 * @param groupId group id
 * @param uid the applicant
 * @returns the write outcome, or a refused result when there is nothing pending here
 */
export async function withdrawRequest(groupId: string, uid: string): Promise<WriteThroughResult> {
  const existing = await mirrorGet<GroupJoinRequest>('joinRequests', `${groupId}:${uid}`);
  if (existing === undefined) {
    return {
      synced: false,
      queued: false,
      error: new AppError('BSDC-GROUP-004', { groupId }),
    };
  }
  const next = withdrawJoinRequest(existing, uid);
  if (next === null) {
    return {
      synced: false,
      queued: false,
      error: new AppError('BSDC-GROUP-005', { groupId }),
    };
  }
  return await writeThrough(
    'joinRequests',
    next,
    {
      kind: 'group.request',
      entityId: next.id,
      payload: { groupId, uid, withdrawn: true },
    },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, groupJoinRequestPath(groupId, uid)), {
          state: 'withdrawn',
          updatedAt: next.updatedAt,
          deletedAt: next.deletedAt,
        });
      } catch (error) {
        throw translateFirestoreError(error, 'group.withdraw');
      }
    },
  );
}

/**
 * Approves or declines a request. Approving also writes the membership, in that order, because a
 * person told "you are in" and then shown a members-only group that has not heard of them is a
 * worse bug than a slow join.
 * @param request the decided request entity
 * @param note the reviewer's note, shown to the applicant when the answer is no
 * @returns the write outcome
 */
export async function reviewJoinRequest(
  request: GroupJoinRequest,
  note = '',
): Promise<WriteThroughResult> {
  if (request.state !== 'approved' && request.state !== 'declined') {
    return {
      synced: false,
      queued: false,
      error: new AppError('BSDC-GROUP-006', { groupId: request.groupId }),
    };
  }
  const outcome = await writeThrough(
    'joinRequests',
    request,
    {
      kind: 'group.reviewRequest',
      entityId: request.id,
      payload: { groupId: request.groupId, uid: request.uid, state: request.state, note },
    },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, groupJoinRequestPath(request.groupId, request.uid)), {
          state: request.state,
          decidedByUid: request.decidedByUid,
          decidedAt: request.decidedAt,
          decisionNote: request.decisionNote,
          updatedAt: request.updatedAt,
        });
      } catch (error) {
        throw translateFirestoreError(error, 'group.review');
      }
    },
  );
  if (request.state === 'approved') {
    const membership = newMembership(request.groupId, request.uid);
    await writeThrough(
      'groups',
      membership as unknown as Group & { readonly id: string },
      {
        kind: 'group.join',
        entityId: membership.id,
        payload: { groupId: request.groupId, uid: request.uid, approved: true },
      },
      async () => {
        const { doc, setDoc } = await import('firebase/firestore');
        const db = await firestoreDb();
        try {
          await setDoc(doc(db, groupMemberPath(request.groupId, request.uid)), membership);
        } catch (error) {
          throw translateFirestoreError(error, 'group.approve');
        }
      },
    );
  }
  return outcome;
}

/**
 * Lists the join requests of one group, waiting first.
 * @param groupId group id
 * @returns the requests, or an empty list when the rules refuse the read
 */
export async function listJoinRequests(groupId: string): Promise<readonly GroupJoinRequest[]> {
  try {
    const {
      collection,
      query: buildQuery,
      where,
      orderBy,
      getDocs,
    } = await import('firebase/firestore');
    const db = await firestoreDb();
    const snapshot = await getDocs(
      buildQuery(
        collection(db, COLLECTIONS.groups, groupId, SUBCOLLECTIONS.joinRequests),
        where('deletedAt', '==', null),
        orderBy('createdAt', 'desc'),
      ),
    );
    const requests = fromQuery<GroupJoinRequest>(snapshot);
    for (const request of requests) void mirrorPut('joinRequests', request);
    return sortJoinRequests(requests);
  } catch (error) {
    throw translateFirestoreError(error, 'group.requests');
  }
}

/**
 * Watches a group's join requests, so a manager sees a new request without a refresh.
 * @param groupId group id
 * @param handler receives the requests in review order
 * @returns a release function
 */
export function watchJoinRequests(
  groupId: string,
  handler: (requests: readonly GroupJoinRequest[]) => void,
): Unsubscribe {
  return acquireListener(`group-requests:${groupId}`, 'joinRequests', async () => {
    const {
      collection,
      query: buildQuery,
      orderBy,
      onSnapshot,
    } = await import('firebase/firestore');
    const db = await firestoreDb();
    return onSnapshot(
      buildQuery(
        collection(db, COLLECTIONS.groups, groupId, SUBCOLLECTIONS.joinRequests),
        orderBy('createdAt', 'desc'),
      ),
      (snapshot) => {
        handler(sortJoinRequests(fromQuery<GroupJoinRequest>(snapshot)));
      },
    );
  });
}

/**
 * Reads the device-held join requests for a group, for the first paint.
 * @param groupId group id
 * @returns the cached requests
 */
export async function peekJoinRequests(groupId: string): Promise<readonly GroupJoinRequest[]> {
  return await mirrorList<GroupJoinRequest>('joinRequests', {
    where: [(request: GroupJoinRequest) => request.groupId === groupId],
  });
}

/**
 * Changes a member's role inside a group.
 * @param groupId group id
 * @param uid the member
 * @param role the role to assign
 * @returns the write outcome
 */
export async function setMemberRole(
  groupId: string,
  uid: string,
  role: GroupRole,
): Promise<WriteThroughResult> {
  const now = new Date().toISOString();
  return await writeThrough(
    'groups',
    {
      id: `${groupId}:${uid}`,
      groupId,
      uid,
      role,
      updatedAt: now,
      deletedAt: null,
    } as unknown as Group & { readonly id: string },
    {
      kind: 'group.setRole',
      entityId: `${groupId}:${uid}`,
      payload: { groupId, uid, role },
    },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, groupMemberPath(groupId, uid)), { role, updatedAt: now });
      } catch (error) {
        throw translateFirestoreError(error, 'group.role');
      }
    },
  );
}

/**
 * Removes a member from a group. Soft delete, so the recovery bin can put them back.
 * @param groupId group id
 * @param uid the member
 * @returns the write outcome
 */
export async function removeMember(groupId: string, uid: string): Promise<WriteThroughResult> {
  const now = new Date().toISOString();
  await mirrorSoftDelete('groups', `${groupId}:${uid}`, now);
  return await writeThrough(
    'groups',
    {
      id: `${groupId}:${uid}`,
      groupId,
      uid,
      deletedAt: now,
      updatedAt: now,
    } as unknown as Group & { readonly id: string },
    {
      kind: 'group.removeMember',
      entityId: `${groupId}:${uid}`,
      payload: { groupId, uid },
    },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, groupMemberPath(groupId, uid)), {
          deletedAt: now,
          updatedAt: now,
        });
      } catch (error) {
        throw translateFirestoreError(error, 'group.remove');
      }
    },
  );
}
