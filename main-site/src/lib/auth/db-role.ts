import type { User } from 'firebase/auth';
import { isConfigured } from '@/lib/env';
import { getSupabase } from '@/lib/supabase/client';
import { readClaims } from './session-claims';
import type { SessionClaims, UserRole } from '@/store/auth-store';

/**
 * The database's opinion of the signed-in member, and how the browser adopts it.
 *
 * Two independent things decide what a member may do here. A Firebase custom
 * claim (`bsdc_role`, `staff`) travels inside the ID token and reaches
 * Postgres through PostgREST; a row in `public.profiles` carries the rank the
 * platform's own functions consult through `bsdc.actor_role()`. They are
 * written by different paths and can disagree — a claim minted before a
 * promotion, a rank changed after the token was issued, or (migration 0055) an
 * administrator whose address is in `bsdc.bootstrap_admins` and whose row
 * still says 'member'.
 *
 * The row wins, because it is the one the server enforces. `public.my_role()`
 * reports the effective rank in one call, and this module turns that answer
 * into the session claims the UI reads — then repairs both sides so they stop
 * disagreeing: the profile row through `claim_bootstrap_role()`, and the token
 * through the claims endpoint.
 */
export interface DatabaseRole {
  role: UserRole;
  staff: boolean;
  /** True when the bootstrap list, not the profile row, is what granted it. */
  bootstrap: boolean;
}

const ROLES: readonly UserRole[] = [
  'member',
  'creator',
  'vendor',
  'moderator',
  'manager',
  'admin',
  'owner',
];

/** The rank order, so "the database outranks the token" is a comparison. */
export const ROLE_RANK: Record<UserRole, number> = {
  member: 10,
  creator: 20,
  vendor: 30,
  moderator: 40,
  manager: 50,
  admin: 60,
  owner: 70,
};

export function asRole(value: unknown): UserRole | null {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
    ? (value as UserRole)
    : null;
}

/**
 * Session claims as the database says they should be.
 *
 * The rank is the database's; `staff` follows it rather than a stale flag, and
 * `vendor` keeps whatever the token said unless the rank itself is a vendor's.
 * A rank the database cannot name changes nothing: an unreadable answer is not
 * a demotion.
 */
export function reconcileClaims(claims: SessionClaims, database: DatabaseRole): SessionClaims {
  const role = database.role;
  return {
    role,
    staff: database.staff || ROLE_RANK[role] >= ROLE_RANK.moderator,
    vendor: claims.vendor || role === 'vendor',
  };
}

/** True when adopting the database's answer would change what the UI shows. */
export function claimsDiffer(claims: SessionClaims, database: DatabaseRole): boolean {
  const next = reconcileClaims(claims, database);
  return next.role !== claims.role || next.staff !== claims.staff || next.vendor !== claims.vendor;
}

interface MyRoleRow {
  role: string;
  staff: boolean;
  bootstrap: boolean;
}

/** The effective rank, or null when it could not be read. */
export async function fetchMyRole(): Promise<DatabaseRole | null> {
  if (!isConfigured.supabase) return null;
  const { data, error } = await getSupabase().rpc('my_role').returns<MyRoleRow[]>();
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0];
  if (row === undefined) return null;
  const role = asRole(row.role);
  if (role === null) return null;
  return { role, staff: row.staff === true, bootstrap: row.bootstrap === true };
}

/**
 * Writes the bootstrap rank onto the caller's own profile row, so the people
 * list and the audit trail agree with what they can already do. Refused by the
 * database for anybody the bootstrap list does not name; not an error here.
 */
export async function claimBootstrapRole(): Promise<UserRole | null> {
  if (!isConfigured.supabase) return null;
  const { data, error } = await getSupabase().rpc('claim_bootstrap_role').returns<string>();
  if (error) return null;
  return asRole(data);
}

/**
 * Asks the edge to mint the rank the database already grants, so the token
 * agrees with the row and the thirteen consoles — which read the claim, not
 * this site's session — see the same administrator.
 *
 * Every failure here is survivable: the endpoint may be unconfigured, or the
 * account may not be one it is allowed to elevate. Authority on this site
 * comes from the database either way, so the caller keeps the reconciled
 * claims and nothing is retried in a loop.
 */
export async function mintClaimsFor(user: User, role: UserRole): Promise<SessionClaims | null> {
  if (!isConfigured.firebase) return null;
  try {
    const idToken = await user.getIdToken();
    const response = await fetch('/api/auth/claims', {
      method: 'POST',
      headers: { authorization: `Bearer ${idToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ uid: user.uid, role, vendor: role === 'vendor', staff: false }),
    });
    if (!response.ok) return null;
    const refreshed = await user.getIdTokenResult(true);
    return readClaims(refreshed.claims);
  } catch {
    return null;
  }
}

/**
 * Adopts the database's rank for this session, repairing both sides.
 *
 * Called once per sign-in, after the profile has been read. Returns the claims
 * the session should carry — the same object it was given when there is
 * nothing to correct, so callers can compare by identity.
 */
export async function syncRoleWithDatabase(
  user: User,
  claims: SessionClaims,
): Promise<SessionClaims> {
  const database = await fetchMyRole();
  if (database === null) return claims;

  // A bootstrap administrator's row is brought up to the rank they already
  // hold, before anything else reads it.
  if (database.bootstrap) await claimBootstrapRole();

  if (!claimsDiffer(claims, database)) return claims;

  const minted = await mintClaimsFor(user, database.role);
  // The token may now carry the rank; if it does not, the database's answer is
  // still the one the UI shows.
  return minted !== null && minted.role === database.role
    ? reconcileClaims(minted, database)
    : reconcileClaims(claims, database);
}
