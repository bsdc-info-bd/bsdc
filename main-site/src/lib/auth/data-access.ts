import type { IdTokenResult, User } from 'firebase/auth';
import { readClaims } from './session-claims';

const DATA_ROLE = 'authenticated';

/**
 * A Firebase ID token is valid identity, but PostgREST also needs its reserved
 * `role` claim to select the database's authenticated role. New Firebase
 * accounts do not have custom claims yet, so mint the least-privileged member
 * claim before the first profile/database request.
 */
export class DataAccessBootstrapError extends Error {
  constructor(readonly status: number) {
    super('auth/data-access-bootstrap-failed');
    this.name = 'DataAccessBootstrapError';
  }
}

function hasDataRole(token: IdTokenResult): boolean {
  return token.claims['role'] === DATA_ROLE;
}

/**
 * Uses the role already present in a signed Firebase token when repairing a
 * legacy token. The server verifies and preserves that signed role; a browser
 * cannot choose a more privileged role in this flow.
 */
export function bootstrapRole(claims: Record<string, unknown>) {
  return readClaims(claims).role;
}

/**
 * Ensures subsequent Supabase calls run as Postgres `authenticated`. The
 * endpoint permits only a caller's own least-privileged bootstrap/repair and
 * refreshes the Firebase token before the caller continues to the data layer.
 */
async function bootstrapDataAccess(user: User): Promise<IdTokenResult> {
  const current = await user.getIdTokenResult();
  if (hasDataRole(current)) return current;

  const idToken = await user.getIdToken();
  const response = await fetch('/api/auth/claims', {
    method: 'POST',
    headers: { authorization: `Bearer ${idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      uid: user.uid,
      role: bootstrapRole(current.claims),
      // The endpoint derives vendor/staff from the signed role for this
      // self-service path; never let the browser request either privilege.
      vendor: false,
      staff: false,
    }),
  });
  if (!response.ok) throw new DataAccessBootstrapError(response.status);

  const refreshed = await user.getIdTokenResult(true);
  if (!hasDataRole(refreshed)) throw new DataAccessBootstrapError(502);
  return refreshed;
}

// Token refresh emits another auth event and many queries can start together.
// Share only in-flight work, not a resolved token (which can expire/change).
const pending = new WeakMap<User, Promise<IdTokenResult>>();

export function ensureDataAccess(user: User): Promise<IdTokenResult> {
  const existing = pending.get(user);
  if (existing) return existing;
  const request = bootstrapDataAccess(user).finally(() => pending.delete(user));
  pending.set(user, request);
  return request;
}
