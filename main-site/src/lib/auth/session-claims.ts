import type { SessionClaims, UserRole } from '@/store/auth-store';

/**
 * Reads the Firebase custom claims the platform mints. This is the client
 * half of the contract that functions/api/auth/claims-core.ts writes: the
 * application role travels in `bsdc_role`, while `role` is reserved by
 * PostgREST and always carries "authenticated".
 *
 * The legacy `role` slot is still honoured so a session minted before the
 * move keeps its real role until it is re-minted and the token refreshes.
 * "authenticated" is not an application role, so a new token never leaks a
 * Postgres role name into the UI.
 */

const ROLES: readonly UserRole[] = [
  'member',
  'creator',
  'vendor',
  'moderator',
  'manager',
  'admin',
  'owner',
];

function asRole(value: unknown): UserRole | null {
  return ROLES.includes(value as UserRole) ? (value as UserRole) : null;
}

/** Maps a decoded ID token onto the session's claims. */
export function readClaims(raw: Record<string, unknown>): SessionClaims {
  const role = asRole(raw['bsdc_role']) ?? asRole(raw['role']) ?? 'member';
  return {
    role,
    vendor: raw['vendor'] === true,
    staff: raw['staff'] === true,
  };
}
