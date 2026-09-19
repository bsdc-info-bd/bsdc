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
import { COLLECTIONS, SUBCOLLECTIONS, groupMemberPath } from '@/core/config/collections';
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
} from './model';

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
