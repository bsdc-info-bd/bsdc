/**
 * BSDC — src/entities/story/repository.ts
 * Purpose : Story persistence: publish, read the live rail, record a view, expire and recover.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Stories are the one collection the reader filters on the client with confidence,
 *   because expiry is a value in the document, not an opinion on the server: every reader computes
 *   the same instant from `expiresAt`. Expired stories stay in the mirror until the nightly purge
 *   so a person can still see their own day in the archive the platform keeps for them alone.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { COLLECTIONS, storyPath, storyViewPath } from '@/core/config/collections';
import { firestoreDb } from '@/services/firebase/app';
import { fromQuery, translateFirestoreError } from '@/services/firebase/firestore';
import { acquireListener, type Unsubscribe } from '@/services/realtime/registry';
import { mirrorGet, mirrorList, mirrorPut, mirrorSoftDelete } from '@/services/offline/mirror';
import { readThrough, writeThrough, type WriteThroughResult } from '@/services/offline/sync';
import { isExpired, type Story } from './model';

/**
 * Publishes a story.
 * @param story the story entity, built by src/entities/story/model.ts
 * @returns the write outcome
 */
export async function publishStory(story: Story): Promise<WriteThroughResult> {
  return await writeThrough(
    'stories',
    story,
    {
      kind: 'story.create',
      entityId: story.id,
      payload: story as unknown as Readonly<Record<string, unknown>>,
    },
    async () => {
      const { doc, setDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await setDoc(doc(db, storyPath(story.id)), story);
      } catch (error) {
        throw translateFirestoreError(error, 'story.create');
      }
    },
  );
}

/**
 * Reads the stories that are still live, newest first.
 * @param now optional instant, injected by tests
 * @returns the live stories and where they came from
 */
export async function listLiveStories(
  now: Date = new Date(),
): Promise<{ readonly items: readonly Story[]; readonly source: 'remote' | 'local' }> {
  const result = await readThrough<Story>(
    'stories',
    async () => {
      const { collection, query, where, orderBy, limit, getDocs } =
        await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        const snapshot = await getDocs(
          query(
            collection(db, COLLECTIONS.stories),
            where('deletedAt', '==', null),
            orderBy('createdAt', 'desc'),
            limit(60),
          ),
        );
        return fromQuery<Story>(snapshot);
      } catch (error) {
        throw translateFirestoreError(error, 'story.list');
      }
    },
    { orderBy: 'createdAt', direction: 'desc', limit: 60 },
  );
  return {
    items: result.items.filter((story) => !isExpired(story, now)),
    source: result.source,
  };
}

/**
 * Reads the stories one person has posted, including their expired own.
 * @param authorUid the author
 * @returns the stories, newest first
 */
export async function listStoriesByAuthor(authorUid: string): Promise<readonly Story[]> {
  return await mirrorList<Story>('stories', {
    orderBy: 'createdAt',
    direction: 'desc',
    where: [(story: Story) => story.authorUid === authorUid],
  });
}

/**
 * Records that a person has seen a story. One document per viewer, so a view is never double
 * counted and never reveals who watched to anybody but the author.
 * @param storyId story id
 * @param uid viewer account id
 * @returns true when the view was recorded
 */
export async function markStoryViewed(storyId: string, uid: string): Promise<boolean> {
  const story = await mirrorGet<Story>('stories', storyId);
  if (story === undefined) return false;
  const now = new Date().toISOString();
  await mirrorPut('stories', { ...story, viewCount: story.viewCount + 1, updatedAt: now });
  try {
    const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
    const db = await firestoreDb();
    await setDoc(doc(db, storyViewPath(storyId, uid)), { viewedAt: serverTimestamp() });
    return true;
  } catch (error) {
    throw translateFirestoreError(error, 'story.view');
  }
}

/**
 * Removes a story immediately. The author may retract a story at any moment, which is the other
 * half of the promise that a story does not follow you.
 * @param storyId story id
 * @returns the write outcome
 */
export async function retractStory(storyId: string): Promise<WriteThroughResult> {
  const now = new Date().toISOString();
  await mirrorSoftDelete('stories', storyId, now);
  const current = await mirrorGet<Story>('stories', storyId);
  const next: Story =
    current ??
    ({ id: storyId, deletedAt: now, createdAt: now, updatedAt: now } as unknown as Story);
  return await writeThrough(
    'stories',
    next,
    { kind: 'story.delete', entityId: storyId, payload: { deletedAt: now } },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, storyPath(storyId)), { deletedAt: now, updatedAt: now });
      } catch (error) {
        throw translateFirestoreError(error, 'story.delete');
      }
    },
  );
}

/**
 * Watches the live story rail so a frame somebody posts while you read appears without a reload.
 * @param handler receives the stories, newest first
 * @returns a release function
 */
export function watchStories(handler: (stories: readonly Story[]) => void): Unsubscribe {
  return acquireListener('stories:live', 'story', async () => {
    const { collection, query, where, orderBy, limit, onSnapshot } =
      await import('firebase/firestore');
    const db = await firestoreDb();
    return onSnapshot(
      query(
        collection(db, COLLECTIONS.stories),
        where('deletedAt', '==', null),
        orderBy('createdAt', 'desc'),
        limit(60),
      ),
      (snapshot) => {
        const stories = fromQuery<Story>(snapshot);
        for (const story of stories) void mirrorPut('stories', story);
        handler(stories);
      },
    );
  });
}
