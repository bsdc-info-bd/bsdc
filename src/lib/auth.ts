/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  GithubAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  updateProfile as fbUpdateProfile,
  signOut as fbSignOut,
  type User as FirebaseUser,
  type UserCredential,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, firebaseConfigured } from '@/config/firebase';
import { COL, fsDb, normalizeUser } from './firestore';
import { uniqueUsernameSeed } from './utils';
import type { UserProfile } from '@/types/user';
import { isSuperadminEmail } from './notifications';

export function authErrorMessage(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Wrong password. Try again or reset your password.';
    case 'auth/user-not-found':
      return 'No account found with this email. Create one instead?';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email. Try signing in.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 8 characters with 1 uppercase letter and 1 number.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in window was closed before completing. Please try again.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Redirecting instead…';
    case 'auth/account-exists-with-different-credential':
      return 'An account exists with this email using a different sign-in method. Try the original provider.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized in Firebase Auth. Contact the administrator.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled yet. Contact the administrator.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export async function registerWithEmail(displayName: string, email: string, password: string): Promise<FirebaseUser> {
  const cred = await createUserWithEmailAndPassword(auth(), email, password);
  await fbUpdateProfile(cred.user, { displayName });
  await sendEmailVerification(cred.user).catch(() => undefined);
  await ensureUserProfile(cred.user, displayName);
  return cred.user;
}

export async function loginWithEmail(email: string, password: string): Promise<FirebaseUser> {
  const cred = await signInWithEmailAndPassword(auth(), email, password);
  await ensureUserProfile(cred.user);
  return cred.user;
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth(), email);
}

export async function resendVerification(user: FirebaseUser): Promise<void> {
  await sendEmailVerification(user);
}

async function oauthSignIn(providerId: 'google.com' | 'github.com' | 'yahoo.com'): Promise<void> {
  const provider =
    providerId === 'google.com'
      ? new GoogleAuthProvider()
      : providerId === 'github.com'
        ? new GithubAuthProvider()
        : new OAuthProvider('yahoo.com');
  try {
    const cred = await signInWithPopup(auth(), provider);
    await ensureUserProfile(cred.user);
  } catch (e) {
    const code = (e as { code?: string }).code || '';
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth(), provider);
      return;
    }
    throw e;
  }
}

export const signInWithGoogle = () => oauthSignIn('google.com');
export const signInWithGithub = () => oauthSignIn('github.com');
export const signInWithYahoo = () => oauthSignIn('yahoo.com');

export async function completeRedirectIfPending(): Promise<void> {
  if (!firebaseConfigured) return;
  try {
    const cred = await getRedirectResult(auth());
    if (cred?.user) await ensureUserProfile(cred.user);
  } catch {
    /* redirect sign-in errors surface via onAuthStateChanged */
  }
}

export async function ensureUserProfile(user: FirebaseUser, displayNameOverride?: string): Promise<UserProfile> {
  const userDocRef = doc(fsDb(), COL.users, user.uid);
  const snap = await getDoc(userDocRef);
  const provider = user.providerData[0]?.providerId || 'password';
  const isSuperadmin = isSuperadminEmail(user.email);

  if (!snap.exists()) {
    const username = await reserveUsername(user, displayNameOverride);
    const now = Date.now();
    const profile: Record<string, unknown> = {
      uid: user.uid,
      email: user.email || '',
      username,
      displayName: user.displayName || displayNameOverride || username,
      avatar: user.photoURL || '',
      coverPhoto: '',
      bio: '',
      bioTitle: '',
      location: '',
      website: '',
      github: '',
      linkedin: '',
      twitter: '',
      skills: [],
      education: '',
      work: '',
      joinedAt: now,
      lastActive: now,
      role: isSuperadmin ? 'superadmin' : 'user',
      isVerified: isSuperadmin,
      isCreator: false,
      followerCount: 0,
      followingCount: 0,
      postCount: 0,
      bsdcPoints: 0,
      language: 'en',
      theme: 'light',
      isOnline: true,
      emailVerified: user.emailVerified || provider !== 'password',
      creatorProgramStatus: 'none',
      softwareLicenses: [],
      profileCompleted: Boolean(user.photoURL),
      onboardingStep: 0,
      provider,
      streak: 0,
      lastLoginDay: '',
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(userDocRef, profile, { merge: true });
    return normalizeUser(profile, user.uid);
  }

  const existing = normalizeUser(snap.data(), user.uid);
  const patch: Record<string, unknown> = {
    lastActive: Date.now(),
    emailVerified: user.emailVerified || provider !== 'password',
    provider,
    isOnline: true,
  };
  if (!existing.username || existing.username.length < 3) patch.username = await reserveUsername(user, displayNameOverride);
  if (isSuperadmin && existing.role !== 'superadmin') {
    patch.role = 'superadmin';
    patch.isVerified = true;
  }
  if (!existing.isVerified && isSuperadmin) patch.isVerified = true;
  if (Object.keys(patch).length > 1) await updateDoc(userDocRef, patch).catch(() => undefined);
  return { ...existing, ...(patch as Partial<UserProfile>) };
}

async function reserveUsername(user: FirebaseUser, displayNameOverride?: string): Promise<string> {
  const base =
    slugifyUsername(displayNameOverride || user.displayName || '') ||
    slugifyUsername(user.displayName || '') ||
    uniqueUsernameSeed(user.email || `${user.uid}@bsdc.local`);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}_${Math.floor(Math.random() * 9000 + 1000)}`;
    const unameRef = doc(fsDb(), COL.usernames, candidate);
    const unameSnap = await getDoc(unameRef);
    if (!unameSnap.exists()) {
      await setDoc(unameRef, { uid: user.uid, createdAt: Date.now() });
      return candidate;
    }
    if (unameSnap.data().uid === user.uid) return candidate;
  }
  const fallback = `${base}_${user.uid.slice(0, 4).toLowerCase()}`;
  await setDoc(doc(fsDb(), COL.usernames, fallback), { uid: user.uid, createdAt: Date.now() });
  return fallback;
}

function slugifyUsername(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 15);
}

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const snap = await getDoc(doc(fsDb(), COL.usernames, username.toLowerCase()));
  return !snap.exists();
}

export async function claimUsername(uid: string, newUsername: string, oldUsername: string): Promise<void> {
  const lower = newUsername.toLowerCase();
  const batch = await getDoc(doc(fsDb(), COL.usernames, lower));
  if (batch.exists() && batch.data().uid !== uid) throw new Error('Username is already taken');
  await setDoc(doc(fsDb(), COL.usernames, lower), { uid, createdAt: Date.now() });
  if (oldUsername && oldUsername !== lower) await setDoc(doc(fsDb(), COL.usernames, oldUsername), { uid, createdAt: Date.now(), released: true });
  await updateDoc(doc(fsDb(), COL.users, uid), { username: lower, updatedAt: Date.now() });
}

export function watchAuthState(cb: (user: FirebaseUser | null) => void): () => void {
  if (!firebaseConfigured) {
    cb(null);
    return () => undefined;
  }
  return onAuthStateChanged(auth(), cb);
}

export async function signOut(): Promise<void> {
  if (firebaseConfigured) await fbSignOut(auth());
}

export type { UserCredential, FirebaseUser };
