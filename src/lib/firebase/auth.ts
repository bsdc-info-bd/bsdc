import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  GoogleAuthProvider,
  GithubAuthProvider,
  linkWithPopup,
  unlink,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
  type User as FirebaseUser,
  type UserCredential,
} from 'firebase/auth';
import { getFirebaseAuth } from './index';

const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

// --- Sign In ---

export const signInWithGoogle = async (): Promise<UserCredential> => {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase is not configured');
  return signInWithPopup(auth, googleProvider);
};

export const signInWithGithub = async (): Promise<UserCredential> => {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase is not configured');
  return signInWithPopup(auth, githubProvider);
};

export const signInWithEmail = async (
  email: string,
  password: string
): Promise<UserCredential> => {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase is not configured');
  return signInWithEmailAndPassword(auth, email, password);
};

// --- Register ---

export const registerWithEmail = async (
  email: string,
  password: string,
  displayName: string
): Promise<UserCredential> => {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase is not configured');
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });
  return credential;
};

// --- Sign Out ---

export const signOut = async (): Promise<void> => {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase is not configured');
  return firebaseSignOut(auth);
};

// --- Auth State ---

export const onAuthChange = (
  callback: (user: FirebaseUser | null) => void
): (() => void) => {
  const auth = getFirebaseAuth();
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
};

// --- Password Reset ---

export const resetPassword = async (email: string): Promise<void> => {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase is not configured');
  return sendPasswordResetEmail(auth, email);
};

// --- Email Verification ---

export const sendVerificationEmail = async (): Promise<void> => {
  const auth = getFirebaseAuth();
  if (!auth || !auth.currentUser) throw new Error('No authenticated user');
  return sendEmailVerification(auth.currentUser);
};

// --- Provider Linking ---

export const linkGoogleAccount = async (): Promise<UserCredential> => {
  const auth = getFirebaseAuth();
  if (!auth || !auth.currentUser) throw new Error('No authenticated user');
  return linkWithPopup(auth.currentUser, googleProvider);
};

export const linkGithubAccount = async (): Promise<UserCredential> => {
  const auth = getFirebaseAuth();
  if (!auth || !auth.currentUser) throw new Error('No authenticated user');
  return linkWithPopup(auth.currentUser, githubProvider);
};

export const unlinkProvider = async (providerId: string): Promise<void> => {
  const auth = getFirebaseAuth();
  if (!auth || !auth.currentUser) throw new Error('No authenticated user');
  await unlink(auth.currentUser, providerId);
};

// --- Reauthentication ---

export const reauthenticateWithGoogle = async (): Promise<UserCredential> => {
  const auth = getFirebaseAuth();
  if (!auth || !auth.currentUser) throw new Error('No authenticated user');
  return reauthenticateWithPopup(auth.currentUser, googleProvider);
};

export const reauthenticateWithEmail = async (
  email: string,
  password: string
): Promise<UserCredential> => {
  const auth = getFirebaseAuth();
  if (!auth || !auth.currentUser) throw new Error('No authenticated user');
  const credential = EmailAuthProvider.credential(email, password);
  return reauthenticateWithCredential(auth.currentUser, credential);
};

// --- Account Deletion ---

export const deleteAccount = async (): Promise<void> => {
  const auth = getFirebaseAuth();
  if (!auth || !auth.currentUser) throw new Error('No authenticated user');
  return deleteUser(auth.currentUser);
};

// --- Error Mapping ---

export const mapAuthError = (errorCode: string): string => {
  const errorMap: Record<string, string> = {
    'auth/email-already-in-use': 'This email is already registered. Please sign in instead.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password must be at least 6 characters long.',
    'auth/user-not-found': 'No account found with this email address.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/invalid-credential': 'Invalid credentials. Please check your email and password.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
    'auth/popup-closed-by-user': 'Sign in was cancelled.',
    'auth/popup-blocked': 'Pop-up was blocked by your browser. Please allow pop-ups.',
    'auth/account-exists-with-different-credential':
      'An account already exists with a different sign-in method.',
    'auth/credential-already-in-use': 'This credential is already linked to another account.',
    'auth/requires-recent-login': 'Please sign in again to perform this action.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/expired-action-code': 'This link has expired. Please request a new one.',
    'auth/invalid-action-code': 'This link is invalid. Please request a new one.',
  };
  return errorMap[errorCode] || 'An unexpected error occurred. Please try again.';
};
