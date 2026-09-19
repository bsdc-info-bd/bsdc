/**
 * BSDC — src/entities/comment/repository.ts
 * Purpose : Comment persistence: paging, create, edit, soft delete and live threads.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Threads are read through the device mirror like every other collection and watched
 *   through the listener registry, so a post open in two panels shares one subscription.
 *   Deleting a comment is soft: the body is replaced by a tombstone in the UI and the record is
 *   restorable for thirty days.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { QueryConstraint } from 'firebase/firestore';
import { COLLECTIONS, SUBCOLLECTIONS, commentPath } from '@/core/config/collections';
import { firestoreDb } from '@/services/firebase/app';
import { fromQuery, translateFirestoreError } from '@/services/firebase/firestore';
import { acquireListener, type Unsubscribe } from '@/services/realtime/registry';
import { mirrorGet, mirrorList, mirrorSoftDelete } from '@/services/offline/mirror';
import {
  readThrough,
  writeThrough,
  type ReadThroughResult,
  type WriteThroughResult,
} from '@/services/offline/sync';
import type { Comment } from './model';

/** Comments loaded per page before "load more" appears. */
export const COMMENT_PAGE_SIZE = 20;

/** Options for a comment page. */
export interface CommentQuery {
  readonly limit?: number | undefined;
  readonly before?: string | undefined;
}

/**
 * Loads one page of comments for a post.
 * @param postId post id
 * @param query paging options
 * @returns the page with its provenance
 */
export async function listComments(
  postId: string,
  query: CommentQuery = {},
): Promise<ReadThroughResult<Comment>> {
  return await readThrough<Comment>(
    'comments',
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
        orderBy('createdAt', 'asc'),
        limit(query.limit ?? COMMENT_PAGE_SIZE),
      ];
      if (query.before !== undefined) constraints.push(where('createdAt', '<', query.before));
      try {
        const snapshot = await getDocs(
          buildQuery(
            collection(db, COLLECTIONS.posts, postId, SUBCOLLECTIONS.comments),
            ...constraints,
          ),
        );
        return fromQuery<Comment>(snapshot);
      } catch (error) {
        throw translateFirestoreError(error, 'comment.list');
      }
    },
    {
      orderBy: 'createdAt',
      direction: 'desc',
      where: [(comment: Comment) => comment.postId === postId],
    },
  );
}

/**
 * Posts a comment.
 * @param comment the comment entity
 * @returns the write outcome
 */
export async function createComment(comment: Comment): Promise<WriteThroughResult> {
  return await writeThrough(
    'comments',
    comment,
    {
      kind: 'comment.create',
      entityId: comment.id,
      payload: comment as unknown as Readonly<Record<string, unknown>>,
    },
    async () => {
      const { doc, setDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await setDoc(doc(db, commentPath(comment.postId, comment.id)), comment);
      } catch (error) {
        throw translateFirestoreError(error, 'comment.create');
      }
    },
  );
}

/**
 * Replaces the body of a comment.
 * @param postId post id
 * @param commentId comment id
 * @param body new body
 * @returns the write outcome
 */
export async function updateComment(
  postId: string,
  commentId: string,
  body: string,
): Promise<WriteThroughResult> {
  const current = await mirrorGet<Comment>('comments', commentId);
  if (current === undefined) {
    const { AppError } = await import('@/core/errors/AppError');
    return { synced: false, queued: false, error: new AppError('BSDC-DATA-002', { commentId }) };
  }
  const now = new Date().toISOString();
  return await writeThrough(
    'comments',
    { ...current, body, editedAt: now, updatedAt: now },
    { kind: 'comment.create', entityId: commentId, payload: { body, editedAt: now } },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, commentPath(postId, commentId)), {
          body,
          editedAt: now,
          updatedAt: now,
        });
      } catch (error) {
        throw translateFirestoreError(error, 'comment.update');
      }
    },
  );
}

/**
 * Moves a comment to the recovery bin.
 * @param postId post id
 * @param commentId comment id
 * @returns the write outcome
 */
export async function softDeleteComment(
  postId: string,
  commentId: string,
): Promise<WriteThroughResult> {
  const now = new Date().toISOString();
  await mirrorSoftDelete('comments', commentId, now);
  const current = await mirrorGet<Comment>('comments', commentId);
  const next: Comment =
    current ?? ({ id: commentId, postId, deletedAt: now } as unknown as Comment);

  return await writeThrough(
    'comments',
    next,
    { kind: 'comment.delete', entityId: commentId, payload: { deletedAt: now } },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, commentPath(postId, commentId)), { deletedAt: now });
      } catch (error) {
        throw translateFirestoreError(error, 'comment.delete');
      }
    },
  );
}

/**
 * Reads comments for a post from the device mirror only.
 * @param postId post id
 * @returns the mirrored comments
 */
export async function peekComments(postId: string): Promise<readonly Comment[]> {
  return await mirrorList<Comment>('comments', {
    where: [(comment: Comment) => comment.postId === postId],
    orderBy: 'createdAt',
    direction: 'asc',
  });
}

/**
 * Watches a post's comment thread live.
 * @param postId post id
 * @param handler receives the current comments
 * @returns a release function
 */
export function watchComments(
  postId: string,
  handler: (comments: readonly Comment[]) => void,
): Unsubscribe {
  return acquireListener(`comments:${postId}`, 'comments', async () => {
    const {
      collection,
      query: buildQuery,
      where,
      orderBy,
      limit,
      onSnapshot,
    } = await import('firebase/firestore');
    const db = await firestoreDb();
    return onSnapshot(
      buildQuery(
        collection(db, COLLECTIONS.posts, postId, SUBCOLLECTIONS.comments),
        where('deletedAt', '==', null),
        orderBy('createdAt', 'asc'),
        limit(200),
      ),
      (snapshot) => {
        const comments = fromQuery<Comment>(snapshot);
        void (async () => {
          const { mirrorMerge } = await import('@/services/offline/mirror');
          await mirrorMerge('comments', comments);
          handler(comments);
        })();
      },
    );
  });
}
