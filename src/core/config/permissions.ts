/**
 * BSDC — src/core/config/permissions.ts
 * Purpose : The single entitlement matrix: who may do what (PART 05.02, LAW-03).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   :
 *   The matrix is a minimum-rank table. A role satisfies a permission when its rank is at or
 *   above the minimum rank of that permission. This makes the matrix auditable in one screen and
 *   impossible to contradict: there is no second place where privilege is decided.
 *   The client consults this matrix to *render* affordances; Firestore rules and Cloud Functions
 *   remain the authority that *enforces* them. A hidden button is never a security control.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Every role in the platform, ordered from least to most privileged. */
export const ROLES = [
  'guest',
  'member',
  'creator',
  'vendor',
  'support',
  'moderator',
  'admin',
  'root',
] as const;

export type Role = (typeof ROLES)[number];

/** Role rank. Higher outranks lower. */
export const ROLE_RANK: Readonly<Record<Role, number>> = {
  guest: 0,
  member: 1,
  creator: 2,
  vendor: 3,
  support: 4,
  moderator: 5,
  admin: 6,
  root: 7,
};

/**
 * Returns the rank of a role, treating unknown strings as `member`.
 * @param role role name
 * @returns the rank
 */
export function rankOf(role: Role): number {
  return ROLE_RANK[role] ?? ROLE_RANK.member;
}

/** Every capability the platform knows about. */
export const PERMISSIONS = [
  'feed.read',
  'feed.create',
  'feed.schedule',
  'feed.pin',
  'comment.create',
  'comment.moderate',
  'reaction.create',
  'group.create',
  'group.manage',
  'group.moderate',
  'message.send',
  'message.voiceNote',
  'message.moderate',
  'profile.editOwn',
  'profile.editAny',
  'profile.verifyBadge',
  'media.upload',
  'media.moderate',
  'report.create',
  'report.review',
  'moderation.queue',
  'moderation.act',
  'moderation.appeal',
  'marketplace.sell',
  'marketplace.reviewVendor',
  'marketplace.refund',
  'ads.purchase',
  'ads.review',
  'ads.configure',
  'analytics.viewOwn',
  'analytics.viewAny',
  'flag.read',
  'flag.toggle',
  'flag.schedule',
  'passkey.verify',
  'role.assign',
  'user.suspend',
  'content.purge',
  'audit.read',
  'event.create',
  'event.manage',
  'event.moderate',
  'job.post',
  'job.apply',
  'job.manageAny',
  'project.create',
  'project.manageOwn',
  'gig.create',
  'gig.order',
  'gig.manageOwn',
  'story.create',
  'follow.create',
  'search.advanced',
  'notify.broadcast',
  'licence.issue',
  'licence.revoke',
  'report.exportPdf',
  'branding.generate',
  'platform.configure',
  'platform.maintenance',
  'platform.rotateKeys',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Minimum role required for each permission. */
export const PERMISSION_MIN_ROLE: Readonly<Record<Permission, Role>> = {
  'feed.read': 'guest',
  'feed.create': 'member',
  'feed.schedule': 'creator',
  'feed.pin': 'moderator',
  'comment.create': 'member',
  'comment.moderate': 'moderator',
  'reaction.create': 'member',
  'group.create': 'member',
  'group.manage': 'member',
  'group.moderate': 'moderator',
  'message.send': 'member',
  'message.voiceNote': 'member',
  'message.moderate': 'moderator',
  'profile.editOwn': 'member',
  'profile.editAny': 'support',
  'profile.verifyBadge': 'admin',
  'media.upload': 'member',
  'media.moderate': 'moderator',
  'report.create': 'member',
  'report.review': 'support',
  'moderation.queue': 'support',
  'moderation.act': 'moderator',
  'moderation.appeal': 'member',
  'marketplace.sell': 'vendor',
  'marketplace.reviewVendor': 'support',
  'marketplace.refund': 'admin',
  'ads.purchase': 'member',
  'ads.review': 'support',
  'ads.configure': 'admin',
  'analytics.viewOwn': 'member',
  'analytics.viewAny': 'support',
  'flag.read': 'guest',
  'flag.toggle': 'admin',
  'flag.schedule': 'admin',
  'passkey.verify': 'admin',
  'role.assign': 'root',
  'user.suspend': 'moderator',
  'content.purge': 'admin',
  'audit.read': 'admin',
  'event.create': 'member',
  'event.manage': 'member',
  'event.moderate': 'moderator',
  'job.post': 'creator',
  'job.apply': 'member',
  'job.manageAny': 'support',
  'project.create': 'member',
  'project.manageOwn': 'member',
  'gig.create': 'vendor',
  'gig.order': 'member',
  'gig.manageOwn': 'vendor',
  'story.create': 'member',
  'follow.create': 'member',
  'search.advanced': 'guest',
  'notify.broadcast': 'admin',
  'licence.issue': 'admin',
  'licence.revoke': 'admin',
  'report.exportPdf': 'support',
  'branding.generate': 'admin',
  'platform.configure': 'admin',
  'platform.maintenance': 'admin',
  'platform.rotateKeys': 'root',
};

/** Custom claims carried on the Firebase Auth token. Mirrors functions/src/claims.ts. */
export interface BsdcClaims {
  readonly role: Role;
  readonly root: boolean;
  readonly suspended: boolean;
  readonly verifiedCreator: boolean;
}

/** Claims of an unauthenticated visitor. */
export const GUEST_CLAIMS: BsdcClaims = {
  role: 'guest',
  root: false,
  suspended: false,
  verifiedCreator: false,
};

/**
 * Decides whether a role satisfies a permission.
 * @param role role to test
 * @param permission capability to test
 * @returns true when the role is at or above the required rank
 */
export function can(role: Role, permission: Permission): boolean {
  return rankOf(role) >= rankOf(PERMISSION_MIN_ROLE[permission]);
}

/**
 * Decides whether a role may perform every one of several permissions.
 * @param role role to test
 * @param permissions capabilities to test
 * @returns true only when every permission is satisfied
 */
export function canAll(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => can(role, permission));
}

/**
 * Decides whether a role may perform at least one of several permissions.
 * @param role role to test
 * @param permissions capabilities to test
 * @returns true when any permission is satisfied
 */
export function canAny(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => can(role, permission));
}

/**
 * Reports whether a role is staff (support or above).
 * @param role role to test
 * @returns true for support, moderator, admin and root
 */
export function isStaff(role: Role): boolean {
  return rankOf(role) >= ROLE_RANK.support;
}

/**
 * Reports whether a role may enter moderation surfaces.
 * @param role role to test
 * @returns true for moderator, admin and root
 */
export function isModerator(role: Role): boolean {
  return rankOf(role) >= ROLE_RANK.moderator;
}

/**
 * Reports whether a role is administrative.
 * @param role role to test
 * @returns true for admin and root
 */
export function isAdmin(role: Role): boolean {
  return rankOf(role) >= ROLE_RANK.admin;
}

/**
 * Normalises an unknown claim string into a known role.
 * @param value raw claim value
 * @returns a known role, defaulting to member for anything signed in
 */
export function roleFromClaim(value: string | undefined): Role {
  if (value === undefined) return 'member';
  return (ROLES as readonly string[]).includes(value) ? (value as Role) : 'member';
}

/** Human-readable role labels, bilingual so the matrix screen needs no dictionary. */
export const ROLE_LABELS: Readonly<Record<Role, { readonly bn: string; readonly en: string }>> = {
  guest: { bn: 'অতিথি', en: 'Guest' },
  member: { bn: 'সদস্য', en: 'Member' },
  creator: { bn: 'ক্রিয়েটর', en: 'Creator' },
  vendor: { bn: 'বিক্রেতা', en: 'Vendor' },
  support: { bn: 'সাপোর্ট', en: 'Support' },
  moderator: { bn: 'মডারেটর', en: 'Moderator' },
  admin: { bn: 'অ্যাডমিন', en: 'Admin' },
  root: { bn: 'রুট অ্যাডমিন', en: 'Root admin' },
};

/**
 * Roles an administrator may hand to somebody else.
 *
 * `guest` is not a role anybody is given, and `root` cannot be delegated: the Cloud Function
 * refuses it, and offering it on a form would be offering something the platform will not do.
 */
export const ASSIGNABLE_ROLES = [
  'member',
  'creator',
  'vendor',
  'support',
  'moderator',
  'admin',
] as const satisfies readonly Role[];

/**
 * Labels a role in the viewer's language.
 * @param role the role
 * @param locale the viewer's locale
 * @returns the label
 */
export function roleLabel(role: Role, locale: 'bn' | 'en'): string {
  return locale === 'bn' ? ROLE_LABELS[role].bn : ROLE_LABELS[role].en;
}
