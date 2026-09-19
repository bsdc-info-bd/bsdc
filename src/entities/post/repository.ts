/**
 * BSDC — src/entities/post/repository.ts
 * Purpose : Post persistence: the feed cursor, create, edit, save, soft delete and recovery.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Reads are cursor-paginated (`createdAt` descending, then id) and read-through the
 *   device mirror, so an offline device still shows the feed it already has and a reconnecting
 *   device shows it within a frame. Deletes are soft: `deletedAt` is written, the post leaves the
 *   feed immediately and stays restorable for thirty days until the nightly purge runs.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { Query as QueryShape, QueryConstraint } from 'firebase/firestore';

import { COLLECTIONS, postPath } from '@/core/config/collections';
import { AppError } from '@/core/errors/AppError';
import { firestoreDb } from '@/services/firebase/app';
import { fromDocument, fromQuery, translateFirestoreError } from '@/services/firebase/firestore';
import { acquireListener, type Unsubscribe } from '@/services/realtime/registry';
import { mirrorGet, mirrorPut, mirrorRestore, mirrorSoftDelete } from '@/services/offline/mirror';
import {
  readThrough,
  writeThrough,
  type ReadThroughResult,
  type WriteThroughResult,
} from '@/services/offline/sync';
import type { Post, PostVisibility } from './model';

/** Feed filter. */
export interface FeedQuery {
  readonly limit?: number | undefined;
  /** ISO timestamp of the oldest item already loaded. */
  readonly before?: string | undefined;
  readonly visibility?: PostVisibility | undefined;
  readonly groupId?: string | undefined;
  readonly authorUid?: string | undefined;
  readonly tag?: string | undefined;
}

/** A page of posts plus the cursor for the next page. */
export interface PostPage {
  readonly items: readonly Post[];
  readonly source: 'remote' | 'local';
  /** ISO timestamp to pass as `before` for the next page, or null at the end. */
  readonly nextBefore: string | null;
  readonly error: AppError | null;
}

/** Default page size for the feed. */
export const FEED_PAGE_SIZE = 20;

/**
 * Builds the Firestore query for a feed page.
 * @param query feed filter
 * @returns a Firestore query
 */
async function buildFeedQuery(query: FeedQuery): Promise<QueryShape> {
  const {
    collection,
    query: buildQuery,
    where,
    orderBy,
    limit,
  } = await import('firebase/firestore');
  const db = await firestoreDb();
  const constraints: QueryConstraint[] = [
    where('deletedAt', '==', null),
    where('visibility', '==', query.visibility ?? 'public'),
  ];
  if (query.groupId !== undefined) constraints.push(where('groupId', '==', query.groupId));
  if (query.authorUid !== undefined) constraints.push(where('authorUid', '==', query.authorUid));
  if (query.tag !== undefined) constraints.push(where('tags', 'array-contains', query.tag));
  if (query.before !== undefined) constraints.push(where('createdAt', '<', query.before));
  constraints.push(orderBy('createdAt', 'desc'), limit(query.limit ?? FEED_PAGE_SIZE));
  return buildQuery(collection(db, COLLECTIONS.posts), ...constraints);
}

/**
 * Loads one page of the feed.
 * @param query feed filter
 * @returns the page with its provenance and next cursor
 */
export async function listFeedPage(query: FeedQuery = {}): Promise<PostPage> {
  const result: ReadThroughResult<Post> = await readThrough<Post>(
    'posts',
    async () => {
      const { getDocs } = await import('firebase/firestore');
      const built = await buildFeedQuery(query);
      try {
        const snapshot = await getDocs(built);
        return fromQuery<Post>(snapshot);
      } catch (error) {
        throw translateFirestoreError(error, 'feed.page');
      }
    },
    {
      orderBy: 'createdAt',
      direction: 'desc',
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
      ...(query.authorUid !== undefined
        ? { where: [(post: Post) => post.authorUid === query.authorUid] }
        : {}),
      ...(query.groupId !== undefined
        ? { where: [(post: Post) => post.groupId === query.groupId] }
        : {}),
    },
  );

  const items = result.items.filter((post) => post.visibility === (query.visibility ?? 'public'));
  const last = items[items.length - 1];
  return {
    items,
    source: result.source,
    nextBefore: items.length === (query.limit ?? FEED_PAGE_SIZE) ? (last?.createdAt ?? null) : null,
    error: result.error,
  };
}

/**
 * Reads a single post, preferring the backend.
 * @param postId post id
 * @returns the post, or undefined when it does not exist
 */
export async function loadPost(postId: string): Promise<Post | undefined> {
  const result = await readThrough<Post>(
    'posts',
    async () => {
      const { doc, getDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        const snapshot = await getDoc(doc(db, postPath(postId)));
        const post = fromDocument<Post>(snapshot);
        return post === undefined ? [] : [post];
      } catch (error) {
        throw translateFirestoreError(error, 'post.read');
      }
    },
    { limit: 1 },
  );
  return result.items[0] ?? (await mirrorGet<Post>('posts', postId));
}

/**
 * Publishes a post.
 * @param post the post entity, built by src/entities/post/model.ts
 * @returns the write outcome
 */
export async function createPost(post: Post): Promise<WriteThroughResult> {
  if (
    post.body.trim().length === 0 &&
    post.media.length === 0 &&
    post.linkUrl.trim().length === 0
  ) {
    return {
      synced: false,
      queued: false,
      error: new AppError('BSDC-DATA-007', { postId: post.id }),
    };
  }

  return await writeThrough(
    'posts',
    post,
    {
      kind: 'post.create',
      entityId: post.id,
      payload: post as unknown as Readonly<Record<string, unknown>>,
    },
    async () => {
      const { doc, setDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await setDoc(doc(db, postPath(post.id)), post);
      } catch (error) {
        throw translateFirestoreError(error, 'post.create');
      }
    },
  );
}

/**
 * Edits the body or media of an existing post.
 * @param postId post id
 * @param patch fields to change
 * @returns the write outcome
 */
export async function updatePost(
  postId: string,
  patch: Partial<Pick<Post, 'body' | 'media' | 'tags' | 'linkUrl' | 'linkTitle' | 'visibility'>>,
): Promise<WriteThroughResult> {
  const current = await mirrorGet<Post>('posts', postId);
  if (current === undefined) {
    return {
      synced: false,
      queued: false,
      error: new AppError('BSDC-DATA-002', { postId }),
    };
  }
  const now = new Date().toISOString();
  const next: Post = { ...current, ...patch, editedAt: now, updatedAt: now };
  return await writeThrough(
    'posts',
    next,
    { kind: 'post.update', entityId: postId, payload: patch },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, postPath(postId)), { ...patch, editedAt: now, updatedAt: now });
      } catch (error) {
        throw translateFirestoreError(error, 'post.update');
      }
    },
  );
}

/**
 * Moves a post to the recovery bin. It becomes invisible at once and restorable for 30 days.
 * @param postId post id
 * @returns the write outcome
 */
export async function softDeletePost(postId: string): Promise<WriteThroughResult> {
  const now = new Date().toISOString();
  await mirrorSoftDelete('posts', postId, now);
  const current = await mirrorGet<Post>('posts', postId);
  const next: Post =
    current ?? ({ id: postId, deletedAt: now, createdAt: now, updatedAt: now } as Post);

  return await writeThrough(
    'posts',
    next,
    { kind: 'post.delete', entityId: postId, payload: { deletedAt: now } },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, postPath(postId)), { deletedAt: now, updatedAt: now });
      } catch (error) {
        throw translateFirestoreError(error, 'post.delete');
      }
    },
  );
}

/**
 * Restores a post from the recovery bin.
 * @param postId post id
 * @returns the write outcome
 */
export async function restorePost(postId: string): Promise<WriteThroughResult> {
  await mirrorRestore('posts', postId);
  const current = await mirrorGet<Post>('posts', postId);
  const next: Post =
    current ?? ({ id: postId, deletedAt: null, createdAt: '', updatedAt: '' } as Post);
  return await writeThrough(
    'posts',
    { ...next, deletedAt: null, updatedAt: new Date().toISOString() },
    { kind: 'post.update', entityId: postId, payload: { deletedAt: null } },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, postPath(postId)), { deletedAt: null });
      } catch (error) {
        throw translateFirestoreError(error, 'post.restore');
      }
    },
  );
}

/**
 * Watches a single post for live changes: edits, reaction counts and comment counts.
 * @param postId post id
 * @param handler receives the post, or null when it disappears
 * @returns a release function
 */
export function watchPost(postId: string, handler: (post: Post | null) => void): Unsubscribe {
  return acquireListener(`post:${postId}`, 'post', async () => {
    const { doc, onSnapshot } = await import('firebase/firestore');
    const db = await firestoreDb();
    return onSnapshot(doc(db, postPath(postId)), (snapshot) => {
      const post = fromDocument<Post>(snapshot);
      if (post !== undefined) void mirrorPut('posts', post);
      handler(post ?? null);
    });
  });
}
