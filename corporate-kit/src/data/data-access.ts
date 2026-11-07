import type { IdTokenResult, User } from 'firebase/auth';
import type { CorporateEnv } from './env';

const APP_ROLES = [
  'member',
  'creator',
  'vendor',
  'moderator',
  'manager',
  'admin',
  'owner',
] as const;
type AppRole = (typeof APP_ROLES)[number];

/** Only a role already present in the signed token may be requested for repair. */
export function signedRole(claims: Record<string, unknown>): AppRole {
  for (const value of [claims['bsdc_role'], claims['role']]) {
    if (typeof value === 'string' && (APP_ROLES as readonly string[]).includes(value)) {
      return value as AppRole;
    }
  }
  return 'member';
}

export class CorporateDataAccessError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'CorporateDataAccessError';
  }
}

/** Never send a Firebase bearer token to an insecure remote URL. */
function claimsUrl(siteUrl: string): string {
  let url: URL;
  try {
    url = new URL('/api/auth/claims', siteUrl);
  } catch {
    throw new CorporateDataAccessError(
      'The main-site address for staff sign-in is not configured.',
    );
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password
  ) {
    throw new CorporateDataAccessError('The main-site address for staff sign-in must use HTTPS.');
  }
  return url.href;
}

async function bootstrap(env: CorporateEnv, user: User): Promise<IdTokenResult> {
  const current = await user.getIdTokenResult();
  if (current.claims['role'] === 'authenticated') return current;

  let response: Response;
  try {
    response = await fetch(claimsUrl(env.siteUrl), {
      method: 'POST',
      headers: { authorization: `Bearer ${current.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        uid: user.uid,
        role: signedRole(current.claims),
        // The server verifies the token and derives staff/vendor permissions;
        // the browser must not request those flags or another account's role.
        vendor: false,
        staff: false,
      }),
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    });
  } catch (error) {
    if (error instanceof CorporateDataAccessError) throw error;
    throw new CorporateDataAccessError(
      'The staff sign-in service could not be reached. Check the connection or the main-site deployment.',
    );
  }
  if (!response.ok) {
    const message =
      response.status === 401
        ? 'Your sign-in could not be verified. Sign out and sign in again.'
        : response.status === 403
          ? 'The staff sign-in service refused to prepare this account. Ask an owner to check its access.'
          : 'The staff sign-in service could not prepare database access. Check the corporate Firebase configuration and try again.';
    throw new CorporateDataAccessError(message, response.status);
  }

  const refreshed = await user.getIdTokenResult(true);
  if (refreshed.claims['role'] !== 'authenticated') {
    throw new CorporateDataAccessError(
      'The refreshed sign-in token still lacks database access. Check the corporate Firebase configuration.',
      502,
    );
  }
  return refreshed;
}

// Token refresh causes another Firebase event, and several RPCs may start at
// once. Share only pending work; never cache an expired or replaced token.
const pending = new WeakMap<User, Promise<IdTokenResult>>();
export function ensureCorporateDataAccess(env: CorporateEnv, user: User): Promise<IdTokenResult> {
  const existing = pending.get(user);
  if (existing) return existing;
  const request = bootstrap(env, user).finally(() => pending.delete(user));
  pending.set(user, request);
  return request;
}
