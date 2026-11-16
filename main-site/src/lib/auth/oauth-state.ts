/**
 * Lightweight sessionStorage marker for an in-flight OAuth redirect.
 *
 * On mobile browsers that partition third-party storage (iOS Safari ITP,
 * Android Chrome Privacy Sandbox, Firefox ETP) or in-app webviews, a redirect
 * back from `*.firebaseapp.com` can return with `getRedirectResult(auth) === null`
 * and no signed-in user. Without recording that an OAuth redirect started, the
 * member lands back on `/auth/login` with zero feedback and loops forever.
 *
 * Kept dependency-free so `session.ts` and `auth-service.ts` share it without
 * dragging `firebase/auth` into unrelated test mocks.
 */

const PENDING_OAUTH_KEY = 'bsdc.oauth.pending';
const PENDING_TTL_MS = 10 * 60_000;

interface PendingOAuthRecord {
  provider: string;
  at: number;
}

function safeSessionStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function markPendingOAuthRedirect(provider: string, now: number = Date.now()): void {
  const storage = safeSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(PENDING_OAUTH_KEY, JSON.stringify({ provider, at: now }));
  } catch {
    // Private mode or full quota: redirect itself proceeds without the marker.
  }
}

export function clearPendingOAuthRedirect(): void {
  const storage = safeSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(PENDING_OAUTH_KEY);
  } catch {
    // Storage access refused; nothing to clear.
  }
}

export function hasPendingOAuthRedirect(now: number = Date.now()): boolean {
  const storage = safeSessionStorage();
  if (!storage) return false;
  try {
    const raw = storage.getItem(PENDING_OAUTH_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<PendingOAuthRecord> | null;
    return (
      typeof parsed?.at === 'number' && now - parsed.at >= 0 && now - parsed.at <= PENDING_TTL_MS
    );
  } catch {
    return false;
  }
}

/**
 * Returns the pending provider name once and removes the marker so a reload on
 * `/auth/login` never shows a stale error twice.
 */
export function consumePendingOAuthRedirect(now: number = Date.now()): string | null {
  const storage = safeSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PENDING_OAUTH_KEY);
    storage.removeItem(PENDING_OAUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingOAuthRecord> | null;
    if (
      typeof parsed?.provider === 'string' &&
      typeof parsed.at === 'number' &&
      now - parsed.at >= 0 &&
      now - parsed.at <= PENDING_TTL_MS
    ) {
      return parsed.provider;
    }
    return null;
  } catch {
    return null;
  }
}
