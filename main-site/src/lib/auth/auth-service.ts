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
import { prefersRedirectFlow, readDeviceSignals } from './device';
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

export interface SignupResult {
  credential: UserCredential;
  /** False when the account exists but the verification mail did not go out. */
  verificationSent: boolean;
}

/**
 * Creates the account, names it, and asks for the address to be verified.
 *
 * The verification mail is the one step here that can fail without the signup
 * having failed: an action URL whose domain is not on Firebase's list, a
 * mailbox provider refusing the send, a handset offline at that exact moment.
 * It used to throw the whole flow away — the member saw "something went wrong",
 * tried again, and got "an account already exists", which is a worse lie than
 * the first. The account is real; only the mail is missing, and the member is
 * told so and can ask for it again from the banner on every screen.
 */
export async function signUpWithEmail(input: {
  email: string;
  password: string;
  displayName: string;
  remember: boolean;
  nextPath: string;
}): Promise<SignupResult> {
  await applyPersistence(input.remember);
  const auth = getFirebaseAuth();
  const credential = await createUserWithEmailAndPassword(auth, input.email, input.password);
  await updateProfile(credential.user, { displayName: input.displayName });
  const verificationSent = await sendEmailVerification(
    credential.user,
    verificationSettings(input.nextPath),
  ).then(
    () => true,
    () => false,
  );
  return { credential, verificationSent };
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
/**
 * Which flow this device gets, decided before anything is opened.
 *
 * Pure so it can be tested; `readDeviceSignals` is the only part that touches
 * a browser.
 */
export function oauthFlowFor(signals: ReturnType<typeof readDeviceSignals>): 'redirect' | 'popup' {
  return signals !== null && prefersRedirectFlow(signals) ? 'redirect' : 'popup';
}

export async function signInWithProvider(
  id: OAuthProviderId,
  remember = true,
): Promise<UserCredential | null> {
  await applyPersistence(remember);
  const auth = getFirebaseAuth();
  const provider = providerFor(id);

  // A phone or an in-app browser gets the redirect first: a popup there is
  // either refused or opened somewhere it cannot come back from.
  if (oauthFlowFor(readDeviceSignals()) === 'redirect') {
    await signInWithRedirect(auth, provider);
    return null;
  }

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
