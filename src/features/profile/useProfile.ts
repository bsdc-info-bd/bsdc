/**
 * BSDC — src/features/profile/useProfile.ts
 * Purpose : Resolves a handle or an account id into a profile, with follow state and counts.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A profile screen is reachable two ways — /u/{handle} from a link, and by account id
 *   from inside the app. One hook resolves both, keeps the numbers beside the record so the header
 *   never renders a count the device does not have, and re-resolves when the handle changes so a
 *   person navigating between profiles never sees the previous person's name for a frame.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useState } from 'react';
import { COLLECTIONS } from '@/core/config/collections';
import { firestoreDb } from '@/services/firebase/app';
import { fromQuery } from '@/services/firebase/firestore';
import { mirrorList } from '@/services/offline/mirror';
import { loadProfile, peekProfile, watchProfile } from '@/entities/profile/repository';
import { followerCount, followingCount, isFollowing } from '@/entities/profile/follow';
import { loadReputation } from '@/entities/reputation/repository';
import type { Profile } from '@/entities/profile/model';
import type { Reputation } from '@/entities/reputation/model';

/** A profile together with the numbers a header shows beside it. */
export interface ProfileView {
  readonly profile: Profile | null;
  readonly reputation: Reputation | null;
  readonly followers: number;
  readonly following: number;
  readonly viewerFollows: boolean;
  readonly loading: boolean;
}

const EMPTY: ProfileView = {
  profile: null,
  reputation: null,
  followers: 0,
  following: 0,
  viewerFollows: false,
  loading: true,
};

/**
 * Loads a profile by handle from Firestore, falling back to the device mirror.
 * @param handle the handle
 * @returns the profile, or undefined when nobody holds the handle
 */
async function byHandle(handle: string): Promise<Profile | undefined> {
  if (handle.length === 0) return undefined;
  const mirrored = await mirrorList<Profile>('profiles', {
    limit: 1,
    where: [(profile: Profile) => profile.username === handle],
  });
  const local = mirrored[0];
  try {
    const { collection, query, where, limit, getDocs } = await import('firebase/firestore');
    const db = await firestoreDb();
    const snapshot = await getDocs(
      query(collection(db, COLLECTIONS.users), where('username', '==', handle), limit(1)),
    );
    const remote = fromQuery<Profile>(snapshot)[0];
    if (remote !== undefined) return remote;
  } catch {
    // The backend is not answering. The mirror result, if any, is what we have.
  }
  return local;
}

/**
 * Resolves and subscribes to a profile.
 * @param target the handle or the account id
 * @param viewerUid the signed-in viewer, used for the follow state
 * @returns the profile view
 */
export function useProfile(target: string, viewerUid: string): ProfileView {
  const [view, setView] = useState<ProfileView>(EMPTY);
  const [generation, setGeneration] = useState(0);

  const refresh = useCallback((): void => setGeneration((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;
    setView((current) => ({ ...current, loading: true }));

    void (async () => {
      const isUid = target.length > 24 && !target.includes('.');
      const profile = isUid ? ((await peekProfile(target)) ?? undefined) : await byHandle(target);
      if (cancelled) return;
      if (profile === undefined) {
        setView({ ...EMPTY, loading: false });
        return;
      }
      const uid = profile.uid;
      const [reputation, followers, following, viewerFollows] = await Promise.all([
        loadReputation(uid),
        followerCount(uid),
        followingCount(uid),
        viewerUid.length > 0 && viewerUid !== uid ? isFollowing(viewerUid, uid) : false,
      ]);
      if (cancelled) return;
      setView({ profile, reputation, followers, following, viewerFollows, loading: false });
    })();

    return () => {
      cancelled = true;
    };
  }, [target, viewerUid, generation]);

  useEffect(() => {
    if (view.profile === null) return;
    const uid = view.profile.uid;
    return watchProfile(uid, (next) => {
      if (next === null) return;
      setView((current) => (current.profile === null ? current : { ...current, profile: next }));
    });
  }, [view.profile]);

  return { ...view, refresh } as ProfileView & { readonly refresh: () => void };
}

/**
 * Loads a profile by account id, forcing a backend read once.
 * @param uid account id
 * @returns the profile, or undefined when there is none
 */
export async function profileById(uid: string): Promise<Profile | undefined> {
  const result = await loadProfile(uid);
  return result.items[0] ?? (await peekProfile(uid));
}
