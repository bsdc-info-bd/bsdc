/**
 * BSDC — functions/src/claims.ts
 * Purpose : Custom-claim authority: the only code allowed to grant or revoke privilege (LAW-03).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The browser reads claims but can never set them. A claim is mirrored into the user
 *           document so the audit trail shows who changed what, and every grant writes an entry
 *           to `auditLogs`. The root administrator is derived from the configured root email and
 *           additionally carries the `root` boolean, which no other account may hold.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { ROOT_ADMIN_EMAIL } from './env';

/** The role ladder. Order matters: a higher role includes every lower capability. */
export const ROLES = [
  'member',
  'creator',
  'vendor',
  'support',
  'moderator',
  'admin',
  'root',
] as const;
export type Role = (typeof ROLES)[number];

/**
 * Compares two roles.
 * @param a first role
 * @param b second role
 * @returns a positive number when `a` outranks `b`
 */
export function rankOf(a: Role): number {
  return ROLES.indexOf(a);
}

/**
 * Reports whether a role is a staff role.
 * @param role role to test
 * @returns true for support, moderator, admin and root
 */
export function isStaffRole(role: Role): boolean {
  return rankOf(role) >= rankOf('support');
}

/**
 * Resolves the effective role of an account, upgrading the configured root address.
 * @param email primary email, when the provider supplies one
 * @param current role currently stored on the account
 * @returns the role the account must hold
 */
export function effectiveRole(email: string | undefined, current: Role): Role {
  if (email !== undefined && email.toLowerCase() === ROOT_ADMIN_EMAIL.value().toLowerCase()) {
    return 'root';
  }
  return current;
}

/** Claims written onto the Firebase Auth token. */
export interface BsdcClaims {
  readonly role: Role;
  readonly root: boolean;
  readonly suspended: boolean;
  readonly verifiedCreator: boolean;
}

/**
 * Writes claims for an account and records the change.
 * @param uid account id
 * @param role role to grant
 * @param actor uid of the account performing the grant
 * @param options optional flags (suspension, creator status)
 */
export async function applyClaims(
  uid: string,
  role: Role,
  actor: string,
  options: { readonly suspended?: boolean; readonly verifiedCreator?: boolean } = {},
): Promise<BsdcClaims> {
  const claims: BsdcClaims = {
    role,
    root: role === 'root',
    suspended: options.suspended ?? false,
    verifiedCreator: options.verifiedCreator ?? false,
  };

  await getAuth().setCustomUserClaims(uid, { ...claims });
  await getFirestore().doc(`auditLogs/${uid}-${Date.now()}`).set({
    action: 'claims.updated',
    targetUid: uid,
    actorUid: actor,
    role,
    root: claims.root,
    suspended: claims.suspended,
    verifiedCreator: claims.verifiedCreator,
    createdAt: FieldValue.serverTimestamp(),
  });

  return claims;
}
