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
  'auth/invalid-oauth-client-id': 'auth.errors.providerMisconfigured',
  'auth/invalid-oauth-provider': 'auth.errors.providerMisconfigured',
  'auth/unauthorized-continue-uri': 'auth.errors.unauthorizedDomain',
  'auth/invalid-api-key': 'auth.errors.notConfigured',
  'auth/app-not-authorized': 'auth.errors.unauthorizedDomain',
  'auth/redirect-cancelled-by-user': 'auth.errors.popupClosed',
  'auth/missing-or-invalid-nonce': 'auth.errors.providerMisconfigured',
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
  'auth/operation-not-supported-in-this-environment': 'auth.errors.browserUnsupported',
  'auth/missing-iframe-start': 'auth.errors.browserUnsupported',
  'auth/invalid-continue-uri': 'auth.errors.unauthorizedDomain',
  'auth/api-key-not-valid': 'auth.errors.notConfigured',
  'auth/argument-error': 'auth.errors.generic',
  'auth/missing-client-identifier': 'auth.errors.generic',
};

/**
 * Storage failures are DOMExceptions, not FirebaseErrors, and they are the
 * single most common reason a phone says "something went wrong" where a tablet
 * does not: private-mode Safari, an in-app browser, a full disk. Naming them
 * turns a shrug into an instruction.
 */
const STORAGE_FAILURES = new Set([
  'QuotaExceededError',
  'SecurityError',
  'NotSupportedError',
  'AccessDeniedError',
]);

/** Translation key for any thrown value. Always returns a usable key. */
export function isStorageFailure(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return STORAGE_FAILURES.has(error.name);
  }
  if (typeof error === 'object' && error !== null) {
    const name = (error as { name?: unknown }).name;
    return typeof name === 'string' && STORAGE_FAILURES.has(name);
  }
  return false;
}

export function authErrorKey(error: unknown): string {
  if (error instanceof FirebaseNotConfiguredError) return 'auth.errors.notConfigured';
  if (error instanceof FirebaseError) {
    return CODE_MAP[error.code] ?? 'auth.errors.generic';
  }
  if (isStorageFailure(error)) return 'auth.errors.storageBlocked';
  if (error instanceof TypeError) return 'auth.errors.network';
  return 'auth.errors.generic';
}

/** True when the browser blocked the OAuth popup and redirect should be used. */
export function shouldFallbackToRedirect(error: unknown): boolean {
  if (!(error instanceof FirebaseError)) return false;
  return (
    error.code === 'auth/popup-blocked' ||
    error.code === 'auth/operation-not-supported-in-this-environment' ||
    error.code === 'auth/missing-iframe-start'
  );
}
