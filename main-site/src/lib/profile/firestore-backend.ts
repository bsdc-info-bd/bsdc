import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  type DocumentData,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import {
  profileSchema,
  usernameSchema,
  type Profile,
  type ProfileBackend,
  type ProfileDraft,
  type ProfileFields,
} from './types';

/**
 * Firestore backend: the fast profile cache plus the username uniqueness
 * index. It is the active backend only when Supabase is not configured, and
 * it is always kept in step by the facade in profile-service.ts.
 */
function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function fromDocument(uid: string, data: DocumentData): Profile | null {
  const parsed = profileSchema.safeParse({
    ...data,
    uid,
    createdAt: toIso(data['createdAt']),
    updatedAt: toIso(data['updatedAt']),
  });
  return parsed.success ? parsed.data : null;
}

async function fetchProfile(uid: string): Promise<Profile | null> {
  const snapshot = await getDoc(doc(getDb(), 'users', uid));
  if (!snapshot.exists()) return null;
  return fromDocument(uid, snapshot.data());
}

async function fetchProfileByUsername(username: string): Promise<Profile | null> {
  const normalized = username.trim().toLowerCase();
  const indexSnapshot = await getDoc(doc(getDb(), 'usernames', normalized));
  if (!indexSnapshot.exists()) return null;
  const uid = (indexSnapshot.data() as Record<string, unknown>)['uid'];
  if (typeof uid !== 'string') return null;
  return fetchProfile(uid);
}

async function isUsernameAvailable(username: string): Promise<boolean> {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) return false;
  const snapshot = await getDoc(doc(getDb(), 'usernames', parsed.data));
  return !snapshot.exists();
}

/**
 * Claims a username and writes the profile atomically, so two members can
 * never end up holding the same handle.
 */
async function saveProfile(uid: string, draft: ProfileDraft): Promise<Profile> {
  const username = usernameSchema.parse(draft.username);
  const db = getDb();
  const usernameRef = doc(db, 'usernames', username);
  const profileRef = doc(db, 'users', uid);

  await runTransaction(db, async (transaction) => {
    const [usernameSnapshot, profileSnapshot] = await Promise.all([
      transaction.get(usernameRef),
      transaction.get(profileRef),
    ]);

    const ownedByOther =
      usernameSnapshot.exists() &&
      (usernameSnapshot.data() as Record<string, unknown>)['uid'] !== uid;
    if (ownedByOther) throw new Error('profile/username-taken');

    const previousUsername = profileSnapshot.exists()
      ? ((profileSnapshot.data() as Record<string, unknown>)['username'] as string | undefined)
      : undefined;

    if (previousUsername && previousUsername !== username) {
      transaction.delete(doc(db, 'usernames', previousUsername));
    }

    transaction.set(usernameRef, { uid, updatedAt: serverTimestamp() });
    transaction.set(
      profileRef,
      {
        uid,
        username,
        displayName: draft.displayName,
        bio: draft.bio,
        avatarUrl: draft.avatarUrl,
        location: draft.location,
        website: draft.website,
        skills: draft.skills,
        interests: draft.interests,
        language: draft.language,
        onboardingComplete: draft.onboardingComplete,
        createdAt: profileSnapshot.exists()
          ? ((profileSnapshot.data() as Record<string, unknown>)['createdAt'] ?? serverTimestamp())
          : serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  const saved = await fetchProfile(uid);
  if (!saved) throw new Error('profile/save-failed');
  return saved;
}

/** Used by the settings screen for partial updates that keep the handle. */
async function updateProfileFields(uid: string, fields: ProfileFields): Promise<void> {
  await setDoc(
    doc(getDb(), 'users', uid),
    { ...fields, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export const firestoreProfileBackend: ProfileBackend = {
  name: 'firestore',
  fetchProfile,
  fetchProfileByUsername,
  isUsernameAvailable,
  saveProfile,
  updateProfileFields,
};
