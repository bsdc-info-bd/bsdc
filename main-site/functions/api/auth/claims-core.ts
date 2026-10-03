/**
 * The pure decisions behind POST /api/auth/claims, kept free of Cloudflare
 * and Web Crypto types so they can be unit-tested directly.
 *
 * The claim contract is load-bearing for the whole platform:
 *
 *   role      — reserved by PostgREST. It always carries "authenticated" so
 *               Supabase's third-party auth maps the request onto the
 *               `authenticated` Postgres role. It must never carry an
 *               application role again.
 *   bsdc_role — the application role (member … owner), read inside the
 *               database by `bsdc.current_role_name()`.
 *   staff     — true for moderator and above; read by `bsdc.is_staff()`.
 *   vendor    — true for marketplace vendors; read where selling is allowed.
 *
 * Two Firebase projects mint claims here: `bsdc-bd` (members and the Android
 * app) and `bsdc-second` (the thirteen consoles). They stay separate on
 * purpose, so each has its own service account and its own owner allowlist —
 * an owner in one project cannot mint claims in the other.
 */

export const APP_ROLES = [
  'member',
  'creator',
  'vendor',
  'moderator',
  'manager',
  'admin',
  'owner',
] as const;

export type AppRole = (typeof APP_ROLES)[number];

/** The only value PostgREST is allowed to see in the `role` claim. */
export const PG_AUTHENTICATED_ROLE = 'authenticated' as const;

export interface CustomClaims {
  role: typeof PG_AUTHENTICATED_ROLE;
  bsdc_role: AppRole;
  vendor: boolean;
  staff: boolean;
}

export type TargetProject = 'main' | 'second';

export interface ProjectCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export interface ClaimsEnv {
  FB_PROJECT_ID?: string;
  FB_CLIENT_EMAIL?: string;
  FB_PRIVATE_KEY?: string;
  FB2_PROJECT_ID?: string;
  FB2_CLIENT_EMAIL?: string;
  FB2_PRIVATE_KEY?: string;
  BSDC_OWNER_UIDS?: string;
  BSDC2_OWNER_UIDS?: string;
}

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (APP_ROLES as readonly string[]).includes(value);
}

/** Roles above a plain member make the caller staff in the database. */
export function isStaffRole(role: AppRole): boolean {
  return ['moderator', 'manager', 'admin', 'owner'].includes(role);
}

/**
 * Builds the claims document. The application role is placed in `bsdc_role`;
 * `role` is always "authenticated" so PostgREST can switch roles. Explicit
 * flags win, otherwise they follow the role — a vendor claim marks a seller
 * even before the role column catches up, and staff follows the rank.
 */
export function buildClaims(role: AppRole, vendorFlag = false, staffFlag = false): CustomClaims {
  return {
    role: PG_AUTHENTICATED_ROLE,
    bsdc_role: role,
    vendor: vendorFlag || role === 'vendor',
    staff: staffFlag || isStaffRole(role),
  };
}

/** Splits a comma-separated uid allowlist into clean entries. */
export function parseOwners(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((owner) => owner.trim())
    .filter((owner) => owner.length > 0);
}

/**
 * Which configured project a caller's token belongs to, decided from the
 * (as yet unverified) audience it carries. The full verification against that
 * project's issuer happens afterwards; this only picks the credentials.
 */
export function targetFromAudience(env: ClaimsEnv, audience: string): TargetProject | null {
  if (audience !== '' && audience === env.FB_PROJECT_ID) return 'main';
  if (audience !== '' && audience === env.FB2_PROJECT_ID) return 'second';
  return null;
}

/** The service-account credentials and issuer for one project, if configured. */
export function credentialsFor(env: ClaimsEnv, target: TargetProject): ProjectCredentials | null {
  const projectId = target === 'main' ? env.FB_PROJECT_ID : env.FB2_PROJECT_ID;
  const clientEmail = target === 'main' ? env.FB_CLIENT_EMAIL : env.FB2_CLIENT_EMAIL;
  const privateKey = target === 'main' ? env.FB_PRIVATE_KEY : env.FB2_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

/** The owner allowlist that guards one project's claims. */
export function ownersFor(env: ClaimsEnv, target: TargetProject): string[] {
  return parseOwners(target === 'main' ? env.BSDC_OWNER_UIDS : env.BSDC2_OWNER_UIDS);
}

export interface ClaimsRequest {
  uid: string;
  role: AppRole;
  vendor: boolean;
  staff: boolean;
}

/** Validates a parsed JSON body into a claims request, or null when invalid. */
export function toClaimsRequest(body: unknown): ClaimsRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const candidate = body as { uid?: unknown; role?: unknown; vendor?: unknown; staff?: unknown };
  if (typeof candidate.uid !== 'string' || candidate.uid.length === 0) return null;
  if (!isAppRole(candidate.role)) return null;
  return {
    uid: candidate.uid,
    role: candidate.role,
    vendor: candidate.vendor === true,
    staff: candidate.staff === true,
  };
}
