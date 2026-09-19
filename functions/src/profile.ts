/**
 * BSDC — functions/src/profile.ts
 * Purpose : Account provisioning: user document and username reservation on first sign-in.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A profile is created by the server, not by the client, so the `role` field can never
 *           be self-granted and the `usernames` index can never drift from the profile.
 *           Usernames are derived from the email local part and de-duplicated deterministically;
 *           no account is ever left without one.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { applyClaims, effectiveRole } from './claims';
import { ROOT_ADMIN_EMAIL } from './env';

const USERNAME_PATTERN = /^[a-z0-9._]+$/;
const RESERVED = new Set([
  'admin',
  'root',
  'bsdc',
  'rrc',
  'support',
  'help',
  'moderator',
  'about',
  'settings',
  'market',
  'ads',
  'api',
  'status',
  'security',
  'legal',
  'contact',
  'news',
  'wiki',
  'docs',
  'cloud',
  'team',
  'press',
  'brand',
  'partners',
  'changelog',
  'roadmap',
  'guidelines',
  'terms',
  'privacy',
]);

/**
 * Normalises an arbitrary string into a legal username stem.
 * @param raw source text (usually the email local part)
 * @returns a stem of at most 30 characters containing only a-z, 0-9, dot and underscore
 */
export function usernameStem(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .replace(/^[._]+/, '')
    .replace(/[._]+$/g, '')
    .slice(0, 24);
  if (cleaned.length >= 3 && !RESERVED.has(cleaned)) return cleaned;
  const padded = `bsdc${cleaned.replace(/[^a-z0-9]/g, '')}`.slice(0, 24);
  return padded.length >= 3 ? padded : 'bsdc';
}

/**
 * Claims the first free username for a stem.
 * @param stem normalised stem
 * @param uid account that will own it
 * @returns the reserved username
 */
export async function reserveUsername(stem: string, uid: string): Promise<string> {
  const db = getFirestore();
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const candidate = attempt === 0 ? stem : `${stem}${attempt + 1}`;
    const ref = db.doc(`usernames/${candidate}`);
    const taken = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) return true;
      transaction.set(ref, { uid, claimedAt: FieldValue.serverTimestamp() });
      return false;
    });
    if (!taken) return candidate;
  }
  return `${stem}${Date.now()}`;
}

/**
 * Provisions a profile for a newly created account.
 * @param uid account id
 * @param email primary email, when present
 * @param displayName name supplied by the identity provider, when present
 * @returns the reserved username
 */
export async function provisionProfile(
  uid: string,
  email: string | undefined,
  displayName: string | undefined,
): Promise<string> {
  const db = getFirestore();
  const stemSource =
    displayName !== undefined && displayName.length >= 3
      ? displayName
      : (email?.split('@')[0] ?? uid);
  const stem = usernameStem(stemSource);
  const username = await reserveUsername(stem, uid);
  const role =
    email !== undefined && email.toLowerCase() === ROOT_ADMIN_EMAIL.value().toLowerCase()
      ? 'root'
      : 'member';

  await db.doc(`users/${uid}`).set(
    {
      uid,
      username,
      displayName: displayName ?? username,
      displayNameBn: '',
      photoUrl: '',
      headline: '',
      bio: '',
      locale: 'bn',
      region: '',
      district: '',
      website: '',
      role,
      socialLinks: {},
      skills: [],
      onboardingComplete: false,
      privacy: { profileVisibility: 'public', showEmail: false, showRegion: true },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await applyClaims(uid, role, uid);
  return username;
}

/**
 * Removes a profile and frees its username when an account is deleted.
 * @param uid account id
 */
export async function teardownProfile(uid: string): Promise<void> {
  const db = getFirestore();
  const snapshot = await db.doc(`users/${uid}`).get();
  const username = snapshot.get('username');
  await db.doc(`users/${uid}`).delete();
  if (typeof username === 'string' && USERNAME_PATTERN.test(username)) {
    const claim = await db.doc(`usernames/${username}`).get();
    if (claim.get('uid') === uid) await db.doc(`usernames/${username}`).delete();
  }
}

/** Re-exported so the index module needs a single import for profile and claims work. */
export { effectiveRole };
