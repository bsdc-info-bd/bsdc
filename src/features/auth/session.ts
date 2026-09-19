/**
 * BSDC — src/features/auth/session.ts
 * Purpose : The session model: what the app knows about the person using it.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   :
 *   A session has a source. `remote` means Firebase Authentication vouches for the person and
 *   their claims are authoritative. `device` means the person is using BSDC on this device only:
 *   their profile and content are real, durable on the device, and clearly labelled as local.
 *   The device path exists because a platform must never lose what someone wrote just because a
 *   network was unavailable; it is not a demo mode, it holds no fabricated content, and the
 *   banner says exactly which source is active.
 *   Privilege always comes from claims. A device session carries the `member` role and nothing
 *   more, and the server would reject every privileged write it attempted.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { GUEST_CLAIMS, type BsdcClaims, type Role } from '@/core/config/permissions';
import { roleFromClaim } from '@/core/config/permissions';

/** Lifecycle of a session. */
export type SessionStatus = 'unknown' | 'signed-out' | 'authenticating' | 'signed-in';

/** Where the identity comes from. */
export type SessionSource = 'remote' | 'device';

/** An authenticated or device-local session. */
export interface Session {
  readonly status: SessionStatus;
  readonly source: SessionSource;
  readonly uid: string | null;
  readonly email: string | null;
  readonly displayName: string;
  readonly emailVerified: boolean;
  readonly claims: BsdcClaims;
}

/** Identity of a device-local member. */
export interface DeviceIdentity {
  readonly uid: string;
  readonly displayName: string;
  readonly createdAt: string;
}

/** The session of a signed-out visitor. */
export const SIGNED_OUT: Session = {
  status: 'signed-out',
  source: 'remote',
  uid: null,
  email: null,
  displayName: '',
  emailVerified: false,
  claims: GUEST_CLAIMS,
};

/** The session before the first check completes. */
export const SESSION_UNKNOWN: Session = {
  status: 'unknown',
  source: 'remote',
  uid: null,
  email: null,
  displayName: '',
  emailVerified: false,
  claims: GUEST_CLAIMS,
};

/**
 * Builds a session from a Firebase Authentication user and its token claims.
 * @param uid account id
 * @param email primary email
 * @param displayName display name
 * @param emailVerified whether the address has been verified
 * @param claims custom claims from the token
 * @returns the session
 */
export function sessionFromAuth(
  uid: string,
  email: string | null,
  displayName: string,
  emailVerified: boolean,
  claims: Partial<BsdcClaims> = {},
): Session {
  return {
    status: 'signed-in',
    source: 'remote',
    uid,
    email,
    displayName,
    emailVerified,
    claims: {
      role: roleFromClaim(claims.role),
      root: claims.root === true,
      suspended: claims.suspended === true,
      verifiedCreator: claims.verifiedCreator === true,
    },
  };
}

/**
 * Builds a session for a device-local member.
 * @param identity the device identity
 * @returns the session
 */
export function sessionFromDevice(identity: DeviceIdentity): Session {
  return {
    status: 'signed-in',
    source: 'device',
    uid: identity.uid,
    email: null,
    displayName: identity.displayName,
    emailVerified: true,
    claims: { role: 'member', root: false, suspended: false, verifiedCreator: false },
  };
}

/**
 * Creates a fresh device identity.
 * @param displayName name the person chose
 * @param uid identifier to use; generated when omitted
 * @returns the identity
 */
export function newDeviceIdentity(displayName: string, uid?: string): DeviceIdentity {
  return {
    uid: uid ?? `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    displayName: displayName.trim().slice(0, 60),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Reports the role a session carries.
 * @param session the session
 * @returns the role, `guest` when signed out
 */
export function sessionRole(session: Session): Role {
  return session.status === 'signed-in' ? session.claims.role : 'guest';
}

/**
 * Reports whether a session is usable for privileged surfaces.
 * @param session the session
 * @returns true when signed in and not suspended
 */
export function isActiveSession(session: Session): boolean {
  return session.status === 'signed-in' && !session.claims.suspended;
}

/**
 * Reports whether a session may publish: signed in, unsuspended and, for remote sessions,
 * verified by email.
 * @param session the session
 * @returns true when publishing is allowed
 */
export function canPublish(session: Session): boolean {
  if (!isActiveSession(session)) return false;
  return session.source === 'device' || session.emailVerified;
}
