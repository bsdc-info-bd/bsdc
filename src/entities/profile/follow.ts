/**
 * BSDC — src/entities/profile/follow.ts
 * Purpose : The follow graph: who follows whom, and the counts behind it.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A follow edge is written twice — `users/{target}/followers/{follower}` and
 *   `users/{follower}/following/{target}` — because both directions are read constantly and a join
 *   would cost more than the duplication. The counters are maintained by a Cloud Function, not by
 *   the client, because a counter the client can increment is a counter anybody can inflate.
 *   Unfollowing is a soft delete: the edge is marked so the platform can tell a person they have
 *   followed this account before, instead of pretending it is the first time.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { followerPath, followingPath } from '@/core/config/collections';
import { AppError } from '@/core/errors/AppError';
import { firestoreDb } from '@/services/firebase/app';
import { translateFirestoreError } from '@/services/firebase/firestore';
import { mirrorGet, mirrorList, mirrorPut } from '@/services/offline/mirror';
import { writeThrough, type WriteThroughResult } from '@/services/offline/sync';
import { withRemote } from '@/services/backend/gateway';
import { callFunction } from '@/services/backend/callable';

/** A follow edge, as this device remembers it. */
export interface FollowEdge {
  readonly id: string;
  readonly followerUid: string;
  readonly targetUid: string;
  readonly following: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/**
 * Builds the mirror key of a follow edge.
 * @param followerUid the follower
 * @param targetUid the account followed
 * @returns the key
 */
export function followKey(followerUid: string, targetUid: string): string {
  return `${followerUid}:${targetUid}`;
}

/**
 * Reads the follow state one person holds towards another.
 * @param followerUid the follower
 * @param targetUid the account followed
 * @returns true when the edge exists and is active
 */
export async function isFollowing(followerUid: string, targetUid: string): Promise<boolean> {
  const edge = await mirrorGet<FollowEdge>('follows', followKey(followerUid, targetUid));
  return edge !== undefined && edge.following && edge.deletedAt === null;
}

/**
 * Counts the followers this device knows about for an account.
 * @param targetUid the account
 * @returns the number of active edges
 */
export async function followerCount(targetUid: string): Promise<number> {
  const edges = await mirrorList<FollowEdge>('follows', {
    where: [
      (edge: FollowEdge) =>
        edge.targetUid === targetUid && edge.following && edge.deletedAt === null,
    ],
  });
  return edges.length;
}

/**
 * Counts the accounts one person follows, as known on this device.
 * @param followerUid the follower
 * @returns the number of active edges
 */
export async function followingCount(followerUid: string): Promise<number> {
  const edges = await mirrorList<FollowEdge>('follows', {
    where: [
      (edge: FollowEdge) =>
        edge.followerUid === followerUid && edge.following && edge.deletedAt === null,
    ],
  });
  return edges.length;
}

/**
 * Lists the accounts one person follows.
 * @param followerUid the follower
 * @returns the target account ids, newest first
 */
export async function listFollowing(followerUid: string): Promise<readonly string[]> {
  const edges = await mirrorList<FollowEdge>('follows', {
    orderBy: 'createdAt',
    direction: 'desc',
    where: [
      (edge: FollowEdge) =>
        edge.followerUid === followerUid && edge.following && edge.deletedAt === null,
    ],
  });
  return edges.map((edge) => edge.targetUid);
}

/**
 * Lists the followers of an account.
 * @param targetUid the account
 * @returns the follower account ids, newest first
 */
export async function listFollowers(targetUid: string): Promise<readonly string[]> {
  const edges = await mirrorList<FollowEdge>('follows', {
    orderBy: 'createdAt',
    direction: 'desc',
    where: [
      (edge: FollowEdge) =>
        edge.targetUid === targetUid && edge.following && edge.deletedAt === null,
    ],
  });
  return edges.map((edge) => edge.followerUid);
}

/**
 * Follows or unfollows an account.
 * The counter is moved by a Cloud Function when the backend is reachable; a direct write to both
 * edge documents carries the change when it is not, and the outbox reconciles afterwards.
 * @param followerUid the follower
 * @param targetUid the account followed
 * @param following true to follow, false to unfollow
 * @returns the write outcome
 */
export async function setFollowing(
  followerUid: string,
  targetUid: string,
  following: boolean,
): Promise<WriteThroughResult> {
  if (followerUid.length === 0 || targetUid.length === 0 || followerUid === targetUid) {
    return {
      synced: false,
      queued: false,
      error: new AppError('BSDC-DATA-007', { targetUid }),
    };
  }

  const now = new Date().toISOString();
  const edge: FollowEdge = {
    id: followKey(followerUid, targetUid),
    followerUid,
    targetUid,
    following,
    createdAt: now,
    updatedAt: now,
    deletedAt: following ? null : now,
  };
  await mirrorPut('follows', edge);

  const result = await withRemote(async () => {
    const response = await callFunction('toggleFollow', { targetUid, following });
    return response.following;
  }, 'follow.toggle');

  if (result.ok) {
    return { synced: true, queued: false, error: null };
  }

  return await writeThrough(
    'follows',
    edge,
    { kind: 'follow.toggle', entityId: edge.id, payload: { targetUid, following } },
    async () => {
      const { doc, setDoc, deleteDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        if (following) {
          await setDoc(doc(db, followerPath(targetUid, followerUid)), {
            uid: followerUid,
            followedAt: now,
          });
          await setDoc(doc(db, followingPath(followerUid, targetUid)), {
            uid: targetUid,
            followedAt: now,
          });
        } else {
          await deleteDoc(doc(db, followerPath(targetUid, followerUid)));
          await deleteDoc(doc(db, followingPath(followerUid, targetUid)));
        }
      } catch (error) {
        throw translateFirestoreError(error, 'follow.toggle');
      }
    },
  );
}
