import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GithubAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updatePassword,
  updateProfile,
  type AuthProvider,
  type User,
  type UserCredential,
} from 'firebase/auth';
import { applyPersistence, getFirebaseAuth } from '@/lib/firebase';
import { SITE } from '@/lib/site';
import { shouldFallbackToRedirect } from './errors';

/** The exact provider set approved by the owner. No MFA, no phone sign-in. */
export const OAUTH_PROVIDERS = ['google', 'github', 'yahoo'] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDERS)[number];

function providerFor(id: OAuthProviderId): AuthProvider {
  switch (id) {
    case 'google': {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return provider;
    }
    case 'github': {
      const provider = new GithubAuthProvider();
      provider.addScope('read:user');
      provider.addScope('user:email');
      return provider;
    }
    case 'yahoo':
      return new OAuthProvider('yahoo.com');
  }
}

function verificationSettings(nextPath: string) {
  const url = new URL('/auth/verify', SITE.url);
  url.searchParams.set('next', nextPath);
  return { url: url.toString(), handleCodeInApp: false };
}

export async function signUpWithEmail(input: {
  email: string;
  password: string;
  displayName: string;
  remember: boolean;
  nextPath: string;
}): Promise<UserCredential> {
  await applyPersistence(input.remember);
  const auth = getFirebaseAuth();
  const credential = await createUserWithEmailAndPassword(auth, input.email, input.password);
  await updateProfile(credential.user, { displayName: input.displayName });
  await sendEmailVerification(credential.user, verificationSettings(input.nextPath));
  return credential;
}

export async function signInWithEmail(input: {
  email: string;
  password: string;
  remember: boolean;
}): Promise<UserCredential> {
  await applyPersistence(input.remember);
  return signInWithEmailAndPassword(getFirebaseAuth(), input.email, input.password);
}

/**
 * OAuth sign-in. Popups are used where possible; when a browser blocks them
 * the flow transparently falls back to a redirect (handled on return by
 * `startAuthListener`).
 */
export async function signInWithProvider(
  id: OAuthProviderId,
  remember = true,
): Promise<UserCredential | null> {
  await applyPersistence(remember);
  const auth = getFirebaseAuth();
  const provider = providerFor(id);
  try {
    return await signInWithPopup(auth, provider);
  } catch (error) {
    if (shouldFallbackToRedirect(error)) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw error;
  }
}

export async function resendVerificationEmail(user: User, nextPath = '/'): Promise<void> {
  await sendEmailVerification(user, verificationSettings(nextPath));
}

export async function requestPasswordReset(email: string): Promise<void> {
  const url = new URL('/auth/login', SITE.url).toString();
  await sendPasswordResetEmail(getFirebaseAuth(), email, { url, handleCodeInApp: false });
}

/** Password changes always require a fresh re-authentication. */
export async function changePassword(current: string, next: string): Promise<void> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user?.email) throw new Error('auth/requires-recent-login');
  const credential = EmailAuthProvider.credential(user.email, current);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, next);
}

export async function logout(): Promise<void> {
  await signOut(getFirebaseAuth());
}

export async function updateDisplayName(displayName: string): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('auth/no-current-user');
  await updateProfile(user, { displayName });
}

export async function updatePhotoUrl(photoURL: string): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('auth/no-current-user');
  await updateProfile(user, { photoURL });
}
