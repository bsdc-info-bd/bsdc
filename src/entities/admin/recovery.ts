/**
 * BSDC — src/entities/admin/recovery.ts
 * Purpose : The recovery bin: what was soft-deleted, when it disappears, and what can come back.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Deleting is a soft delete first (LAW-19). For thirty days the thing is recoverable by
 *   the person who owns it or by staff; after that a nightly Cloud Function purges it. The bin
 *   states the date rather than a countdown in days, because "12 days left" is a number a person
 *   has to re-derive every time they look at it, and a date they can put in their own calendar.
 *   Purging is immediate and irreversible, and it is presented as such: a platform that quietly
 *   makes something unrecoverable is not being careful, it is being lucky.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { RETENTION } from '@/core/config/limits';

/** Kinds of thing that can land in the bin. */
export const RECOVERY_KINDS = [
  'post',
  'comment',
  'group',
  'message',
  'story',
  'event',
  'job',
  'project',
  'gig',
] as const;
export type RecoveryKind = (typeof RECOVERY_KINDS)[number];

/** One item in the bin. */
export interface RecoveryEntry {
  readonly id: string;
  readonly kind: RecoveryKind;
  /** The entity's own id, so a restore is a single write against the original path. */
  readonly entityId: string;
  /** What the owner would call it. Empty when the thing has no title of its own. */
  readonly label: string;
  /** Account that owns it, and therefore the one who may restore it without staff. */
  readonly ownerUid: string;
  readonly deletedAt: string;
  /** Instant after which the nightly purge may remove it. */
  readonly purgeAt: string;
  /**
   * Last change to this row. Equals `deletedAt` for the whole life of the entry: an item either
   * sits in the bin, or it is restored and leaves. The mirror keys every row on this instant.
   */
  readonly updatedAt: string;
  /** Account that deleted it, when that was somebody other than the owner. */
  readonly deletedByUid: string;
}

/** How a bin is being viewed. */
export type RecoveryScope = 'mine' | 'all';

/**
 * Computes the purge instant from the delete instant.
 * @param deletedAt ISO instant of the soft delete
 * @returns the instant the recovery window closes
 */
export function purgeAtFor(deletedAt: string): string {
  const at = Date.parse(deletedAt);
  if (Number.isNaN(at)) return deletedAt;
  return new Date(at + RETENTION.softDeleteRecoveryDays * 86_400_000).toISOString();
}

/**
 * Builds a bin entry from a soft-deleted entity.
 * @param kind what kind of thing it is
 * @param entityId the entity id
 * @param ownerUid the owner
 * @param deletedAt when it was deleted
 * @param label what to call it
 * @param deletedByUid who deleted it
 * @returns the entry
 */
export function newRecoveryEntry(
  kind: RecoveryKind,
  entityId: string,
  ownerUid: string,
  deletedAt: string,
  label = '',
  deletedByUid = '',
): RecoveryEntry {
  return {
    id: `${kind}:${entityId}`,
    kind,
    entityId,
    label,
    ownerUid,
    deletedAt,
    purgeAt: purgeAtFor(deletedAt),
    updatedAt: deletedAt,
    deletedByUid: deletedByUid === '' ? ownerUid : deletedByUid,
  };
}

/**
 * Reports whether the item can still be brought back.
 * @param entry the bin entry
 * @param now the instant
 * @returns true while the window is open
 */
export function isRecoverable(entry: RecoveryEntry, now: Date = new Date()): boolean {
  return Date.parse(entry.purgeAt) > now.getTime();
}

/**
 * Reports how many whole days are left before the purge.
 * @param entry the bin entry
 * @param now the instant
 * @returns the days remaining, rounded up so "1 day left" is still a warning and not a zero
 */
export function daysLeft(entry: RecoveryEntry, now: Date = new Date()): number {
  const remaining = Date.parse(entry.purgeAt) - now.getTime();
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / 86_400_000);
}

/**
 * Reports whether the item is inside its last three days, which is when the bin starts warning.
 * @param entry the bin entry
 * @param now the instant
 * @returns true when it is nearly gone
 */
export function isExpiringSoon(entry: RecoveryEntry, now: Date = new Date()): boolean {
  const left = daysLeft(entry, now);
  return left > 0 && left <= 3;
}

/**
 * Reports whether a viewer may restore an item: the owner, or staff.
 * @param entry the bin entry
 * @param uid the viewer
 * @param isStaff whether the viewer holds support claims or above
 * @returns true when they may restore it
 */
export function mayRestore(entry: RecoveryEntry, uid: string, isStaff = false): boolean {
  if (!isRecoverable(entry)) return false;
  return isStaff || entry.ownerUid === uid;
}

/**
 * Reports whether a viewer may purge an item early. Purging is irreversible, so it is staff-only
 * unless the owner is throwing away their own thing.
 * @param entry the bin entry
 * @param uid the viewer
 * @param isStaff whether the viewer holds support claims or above
 * @returns true when they may purge it
 */
export function mayPurge(entry: RecoveryEntry, uid: string, isStaff = false): boolean {
  return isStaff || entry.ownerUid === uid;
}

/**
 * Sorts the bin: whatever is about to disappear first, then newest deletions.
 * @param entries the bin
 * @param now the instant
 * @returns the sorted entries
 */
export function sortRecovery(
  entries: readonly RecoveryEntry[],
  now: Date = new Date(),
): readonly RecoveryEntry[] {
  return [...entries]
    .filter((entry) => Date.parse(entry.purgeAt) > now.getTime())
    .sort((a, b) => Date.parse(a.purgeAt) - Date.parse(b.purgeAt));
}

/**
 * Narrows the bin to one person's things.
 * @param entries the bin
 * @param uid the owner
 * @returns their items
 */
export function ownedBy(entries: readonly RecoveryEntry[], uid: string): readonly RecoveryEntry[] {
  return entries.filter((entry) => entry.ownerUid === uid);
}

/**
 * Counts how many items are about to be purged, which is the number the bin should lead with.
 * @param entries the bin
 * @param now the instant
 * @returns the count inside the warning window
 */
export function countExpiringSoon(
  entries: readonly RecoveryEntry[],
  now: Date = new Date(),
): number {
  return entries.filter((entry) => isExpiringSoon(entry, now)).length;
}

/**
 * Labels a kind for the operator's screen, in both languages.
 * @param kind the kind
 * @returns the Bangla and English labels
 */
export function recoveryKindLabel(kind: RecoveryKind): {
  readonly bn: string;
  readonly en: string;
} {
  const labels: Record<RecoveryKind, { readonly bn: string; readonly en: string }> = {
    post: { bn: 'পোস্ট', en: 'Post' },
    comment: { bn: 'মন্তব্য', en: 'Comment' },
    group: { bn: 'গ্রুপ', en: 'Group' },
    message: { bn: 'বার্তা', en: 'Message' },
    story: { bn: 'স্টোরি', en: 'Story' },
    event: { bn: 'ইভেন্ট', en: 'Event' },
    job: { bn: 'চাকরি', en: 'Job' },
    project: { bn: 'প্রকল্প', en: 'Project' },
    gig: { bn: 'গিগ', en: 'Gig' },
  };
  return labels[kind];
}
