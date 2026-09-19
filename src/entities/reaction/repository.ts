/**
 * BSDC — src/entities/reaction/repository.ts
 * Purpose : Reaction persistence: set, clear and watch.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Setting a reaction writes the mirror first, so the button updates in the same frame as
 *   the tap even on a slow connection; the remote write follows and the outbox guarantees it is
 *   not lost. Clearing is a soft delete rather than a document removal, which keeps the write
 *   idempotent and lets the undo action restore it without a round trip.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { reactionPath } from '@/core/config/collections';
import type { ReactionType } from '@/core/config/reactions';
import { firestoreDb } from '@/services/firebase/app';
import { translateFirestoreError } from '@/services/firebase/firestore';
import { acquireListener, type Unsubscribe } from '@/services/realtime/registry';
import { mirrorGet, mirrorList, mirrorPut } from '@/services/offline/mirror';
import { writeThrough, type WriteThroughResult } from '@/services/offline/sync';
import { fromQuery } from '@/services/firebase/firestore';
import { COLLECTIONS, SUBCOLLECTIONS } from '@/core/config/collections';
import { newReaction, summariseReactions, type Reaction, type ReactionSummary } from './model';

/**
 * Sets or clears the viewer's reaction on a post.
 * @param postId post id
 * @param uid viewer account id
 * @param type the chosen reaction, or null to remove it
 * @returns the write outcome
 */
export async function setReaction(
  postId: string,
  uid: string,
  type: ReactionType | null,
): Promise<WriteThroughResult> {
  const now = new Date().toISOString();
  const existing = await mirrorGet<Reaction>('reactions', `${postId}:${uid}`);
  const entity: Reaction =
    type === null
      ? {
          id: `${postId}:${uid}`,
          postId,
          uid,
          type: existing?.type ?? 'like',
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          deletedAt: now,
        }
      : { ...newReaction(postId, uid, type, new Date(now)), id: `${postId}:${uid}` };

  return await writeThrough(
    'reactions',
    entity,
    { kind: 'reaction.set', entityId: `${postId}:${uid}`, payload: { postId, uid, type } },
    async () => {
      const { doc, setDoc, deleteDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        if (type === null) await deleteDoc(doc(db, reactionPath(postId, uid)));
        else await setDoc(doc(db, reactionPath(postId, uid)), newReaction(postId, uid, type));
      } catch (error) {
        throw translateFirestoreError(error, 'reaction.set');
      }
    },
  );
}

/**
 * Reads the reactions of one post from the device mirror.
 * @param postId post id
 * @param viewerUid the viewer's account id
 * @returns the summary
 */
export async function peekReactionSummary(
  postId: string,
  viewerUid: string | null,
): Promise<ReactionSummary> {
  const reactions = await mirrorList<Reaction>('reactions', {
    where: [(reaction: Reaction) => reaction.postId === postId],
  });
  return summariseReactions(reactions, viewerUid);
}

/**
 * Watches every reaction on a post and reports the derived summary.
 * @param postId post id
 * @param viewerUid the viewer's account id
 * @param handler receives the summary
 * @returns a release function
 */
export function watchReactions(
  postId: string,
  viewerUid: string | null,
  handler: (summary: ReactionSummary) => void,
): Unsubscribe {
  return acquireListener(`reactions:${postId}`, 'reactions', async () => {
    const { collection, onSnapshot } = await import('firebase/firestore');
    const db = await firestoreDb();
    return onSnapshot(
      collection(db, COLLECTIONS.posts, postId, SUBCOLLECTIONS.reactions),
      (snapshot) => {
        const reactions = fromQuery<Reaction>(snapshot).map((reaction) => ({
          ...reaction,
          id: `${postId}:${reaction.uid}`,
          postId,
        }));
        void (async () => {
          for (const reaction of reactions) await mirrorPut('reactions', reaction);
          handler(summariseReactions(reactions, viewerUid));
        })();
      },
    );
  });
}
