/**
 * BSDC — src/features/auth/useSession.ts
 * Purpose : Hooks over the session context: identity, role checks and permission checks.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : `useCan` is the only way a component should ask about privilege. It answers from
 *   claims, never from a hardcoded role list, and it never claims to enforce anything — the
 *   server does that. Components use it to decide what to render; rules decide what succeeds.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useContext } from 'react';
import type { Profile } from '@/entities/profile/model';
import { can, type Permission, type Role } from '@/core/config/permissions';
import { SessionContext, type SessionContextValue } from './SessionProvider';
import { sessionRole, type Session } from './session';

/**
 * Reads the session context.
 * @returns the context value
 */
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error('useSession must be used inside a SessionProvider.');
  }
  return value;
}

/**
 * Reads the session model only, avoiding re-renders driven by profile changes.
 * @returns the session
 */
export function useSessionState(): Session {
  return useSession().session;
}

/**
 * Resolves the role of the current session.
 * @returns the role, `guest` when signed out
 */
export function useRole(): Role {
  return sessionRole(useSession().session);
}

/**
 * Decides whether the current session satisfies a permission.
 * @param permission capability to test
 * @returns true when the session's role is at or above the required rank
 */
export function useCan(permission: Permission): boolean {
  return can(useRole(), permission);
}

/**
 * Decides whether the current session satisfies every one of several permissions.
 * @param permissions capabilities to test
 * @returns true only when every permission is satisfied
 */
export function useCanAll(permissions: readonly Permission[]): boolean {
  const role = useRole();
  return permissions.every((permission) => can(role, permission));
}

/**
 * Reads the profile in view of the signed-in account.
 * @returns the profile, or null when signed out
 */
export function useProfile(): Profile | null {
  return useSession().profile;
}

/**
 * Reports whether the session is signed in and unsuspended.
 * @returns true for a usable session
 */
export function useIsSignedIn(): boolean {
  const { session } = useSession();
  return session.status === 'signed-in' && !session.claims.suspended;
}

/**
 * Reports whether the session is a device-local session.
 * @returns true when the identity exists only on this device
 */
export function useIsDeviceSession(): boolean {
  return useSession().session.source === 'device';
}
