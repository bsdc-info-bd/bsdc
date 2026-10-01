import { FirebaseError } from 'firebase/app';
import { FirebaseNotConfiguredError } from '@/lib/firebase';

/**
 * Every Firebase auth error code is mapped to a friendly bilingual message
 * key. Raw codes are never shown to a member, and the messaging is
 * enumeration-safe: wrong password and unknown email produce the same text.
 */
const CODE_MAP: Record<string, string> = {
  'auth/invalid-email': 'auth.errors.invalidEmail',
  'auth/missing-email': 'auth.errors.invalidEmail',
  'auth/user-disabled': 'auth.errors.userDisabled',
  'auth/user-not-found': 'auth.errors.invalidCredentials',
  'auth/wrong-password': 'auth.errors.invalidCredentials',
  'auth/invalid-credential': 'auth.errors.invalidCredentials',
  'auth/invalid-login-credentials': 'auth.errors.invalidCredentials',
  'auth/email-already-in-use': 'auth.errors.emailInUse',
  'auth/weak-password': 'auth.errors.weakPassword',
  'auth/missing-password': 'auth.errors.weakPassword',
  'auth/too-many-requests': 'auth.errors.tooManyRequests',
  'auth/network-request-failed': 'auth.errors.network',
  'auth/popup-closed-by-user': 'auth.errors.popupClosed',
  'auth/cancelled-popup-request': 'auth.errors.popupClosed',
  'auth/popup-blocked': 'auth.errors.popupBlocked',
  'auth/operation-not-allowed': 'auth.errors.providerDisabled',
  'auth/unauthorized-domain': 'auth.errors.unauthorizedDomain',
  'auth/account-exists-with-different-credential': 'auth.errors.accountExists',
  'auth/credential-already-in-use': 'auth.errors.credentialInUse',
  'auth/requires-recent-login': 'auth.errors.requiresRecentLogin',
  'auth/provider-already-linked': 'auth.errors.providerAlreadyLinked',
  'auth/no-such-provider': 'auth.errors.noSuchProvider',
  'auth/invalid-action-code': 'auth.errors.invalidActionCode',
  'auth/expired-action-code': 'auth.errors.expiredActionCode',
  'auth/internal-error': 'auth.errors.generic',
  'auth/timeout': 'auth.errors.network',
  'auth/quota-exceeded': 'auth.errors.tooManyRequests',
  'auth/rejected-credential': 'auth.errors.generic',
  'auth/web-storage-unsupported': 'auth.errors.storageUnsupported',
};

/** Translation key for any thrown value. Always returns a usable key. */
export function authErrorKey(error: unknown): string {
  if (error instanceof FirebaseNotConfiguredError) return 'auth.errors.notConfigured';
  if (error instanceof FirebaseError) {
    return CODE_MAP[error.code] ?? 'auth.errors.generic';
  }
  if (error instanceof TypeError) return 'auth.errors.network';
  return 'auth.errors.generic';
}

/** True when the browser blocked the OAuth popup and redirect should be used. */
export function shouldFallbackToRedirect(error: unknown): boolean {
  return (
    error instanceof FirebaseError &&
    (error.code === 'auth/popup-blocked' ||
      error.code === 'auth/operation-not-supported-in-this-environment' ||
      error.code === 'auth/web-storage-unsupported')
  );
}
