/**
 * BSDC — src/entities/profile/repository.ts
 * Purpose : Profile persistence: read-through, write-through and live watching.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The repository is the only module allowed to know that a profile is a Firestore
 *   document at `users/{uid}` and a mirror record in the `profiles` store. Everything above it
 *   talks in entities. Watchers go through the listener registry, so ten components reading the
 *   same profile share one Firestore listener.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { userPath } from '@/core/config/collections';
import { firestoreDb } from '@/services/firebase/app';
import { fromDocument, translateFirestoreError } from '@/services/firebase/firestore';
import { acquireListener, type Unsubscribe } from '@/services/realtime/registry';
import {
  readThrough,
  writeThrough,
  type ReadThroughResult,
  type WriteThroughResult,
} from '@/services/offline/sync';
import { mirrorGet, mirrorPut } from '@/services/offline/mirror';
import { emptyProfile, type Profile } from './model';

/** Fields a person may edit on their own profile. */
export type ProfilePatch = Partial<
  Pick<
    Profile,
    | 'username'
    | 'displayName'
    | 'displayNameBn'
    | 'photoUrl'
    | 'headline'
    | 'bio'
    | 'locale'
    | 'region'
    | 'district'
    | 'website'
    | 'skills'
    | 'socialLinks'
    | 'privacy'
    | 'onboardingComplete'
  >
>;

/**
 * Loads a profile, falling back to the device mirror.
 * @param uid account id
 * @returns the profile with its provenance; `items` is empty when the profile is not on this
 *   device and the backend did not answer, so a caller never overwrites a profile it already has
 */
export async function loadProfile(uid: string): Promise<ReadThroughResult<Profile>> {
  return await readThrough<Profile>(
    'profiles',
    async () => {
      const { doc, getDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      const snapshot = await getDoc(doc(db, userPath(uid)));
      const profile = fromDocument<Profile>(snapshot);
      return profile === undefined ? [] : [profile];
    },
    { limit: 1 },
  );
}

/**
 * Reads a profile from the device mirror without touching the network.
 * @param uid account id
 * @returns the mirrored profile, or undefined
 */
export async function peekProfile(uid: string): Promise<Profile | undefined> {
  return await mirrorGet<Profile>('profiles', uid);
}

/**
 * Saves presentation fields on the caller's own profile.
 * @param uid account id
 * @param patch fields to change
 * @returns the write outcome
 */
export async function saveProfile(uid: string, patch: ProfilePatch): Promise<WriteThroughResult> {
  const current = (await peekProfile(uid)) ?? emptyProfile(uid);
  const now = new Date().toISOString();
  const next: Profile = { ...current, ...patch, updatedAt: now };
  return await writeThrough(
    'profiles',
    next,
    {
      kind: 'profile.update',
      entityId: uid,
      payload: patch,
    },
    async () => {
      const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, userPath(uid)), {
          ...patch,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        throw translateFirestoreError(error, 'profile.update');
      }
    },
  );
}

/**
 * Watches a profile for live changes.
 * @param uid account id
 * @param handler receives the profile, or null when it does not exist
 * @returns a release function
 */
export function watchProfile(uid: string, handler: (profile: Profile | null) => void): Unsubscribe {
  return acquireListener(`profile:${uid}`, 'profile', async () => {
    const { doc, onSnapshot } = await import('firebase/firestore');
    const db = await firestoreDb();
    return onSnapshot(doc(db, userPath(uid)), (snapshot) => {
      const profile = fromDocument<Profile>(snapshot);
      if (profile !== undefined) void mirrorPut('profiles', profile);
      handler(profile ?? null);
    });
  });
}
