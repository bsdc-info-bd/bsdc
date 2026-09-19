/**
 * BSDC — src/entities/admin/audit.ts
 * Purpose : The audit trail: what was done, to whom, by whom, and what it looked like before.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every privileged action writes one row, and the row carries the previous value as well
 *   as the next one, because "who suspended this account" is only half a question — the other half
 *   is "what was it before, and can we put it back". Rows are never edited and never deleted by a
 *   client: firestore.rules allows a create only from the server, and an update or delete not at
 *   all. Retention is two years (RETENTION.auditRetentionDays), long enough to matter and short
 *   enough to be an honest promise.
 *   The actor's email is not stored. The account id plus the role they held at the time is enough
 *   to answer any question the trail exists to answer, and an email in an audit log is an email in
 *   every backup and every export thereafter.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { RETENTION } from '@/core/config/limits';

/** Actions that leave a trail. */
export const AUDIT_ACTIONS = [
  'role.assign',
  'suspension.set',
  'flag.toggle',
  'flag.schedule',
  'passkey.verified',
  'report.decide',
  'appeal.decide',
  'content.remove',
  'content.restore',
  'content.purge',
  'broadcast.send',
  'group.role',
  'group.removeMember',
  'group.reviewRequest',
  'order.refund',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** One row of the trail. */
export interface AuditEntry {
  readonly id: string;
  readonly action: AuditAction;
  /** Account that did it. */
  readonly actorUid: string;
  /** Role the actor held at the time, so a later demotion does not rewrite history. */
  readonly actorRole: string;
  /** Account or entity acted upon. */
  readonly targetUid: string;
  /** Entity type when the target is not an account, e.g. `post`, `flag`. */
  readonly targetType: string;
  /** Entity id when the target is not an account. */
  readonly targetId: string;
  /** The value before, as a short string. Empty when there was none. */
  readonly before: string;
  /** The value after, as a short string. */
  readonly after: string;
  /** Why. Required in practice for anything that changes somebody's standing. */
  readonly reason: string;
  readonly createdAt: string;
  /**
   * Equals `createdAt`, and stays equal to it: an audit row is never edited. The field exists
   * because the device mirror keys every row on a last-modified instant, and an audit trail that
   * cannot be mirrored is an audit trail an operator cannot read offline.
   */
  readonly updatedAt: string;
}

/** Filters an operator can apply to the trail. */
export interface AuditFilter {
  readonly action?: AuditAction | undefined;
  readonly actorUid?: string | undefined;
  readonly targetUid?: string | undefined;
  readonly query?: string | undefined;
}

/**
 * Reports whether an action requires a written reason.
 *
 * Anything that changes a person's standing, takes their content down, or turns a feature off for
 * everybody needs a sentence explaining why. A toggle of a cosmetic flag does not, and demanding
 * one there would train operators to write "as requested" in every box.
 *
 * @param action the action
 * @returns true when a reason is required
 */
export function requiresReason(action: AuditAction): boolean {
  return (
    action === 'role.assign' ||
    action === 'suspension.set' ||
    action === 'content.remove' ||
    action === 'content.purge' ||
    action === 'report.decide' ||
    action === 'appeal.decide'
  );
}

/**
 * Labels an action for the operator's screen, in both languages.
 * @param action the action
 * @returns the Bangla and English labels
 */
export function auditActionLabel(action: AuditAction): {
  readonly bn: string;
  readonly en: string;
} {
  const labels: Record<AuditAction, { readonly bn: string; readonly en: string }> = {
    'role.assign': { bn: 'ভূমিকা পরিবর্তন', en: 'Role changed' },
    'suspension.set': { bn: 'সাময়িক নিষেধ', en: 'Suspension' },
    'flag.toggle': { bn: 'ফিচার চালু বা বন্ধ', en: 'Feature toggled' },
    'flag.schedule': { bn: 'ফিচারের সময়সূচি', en: 'Feature scheduled' },
    'passkey.verified': { bn: 'পাসকি যাচাই', en: 'Passkey verified' },
    'report.decide': { bn: 'রিপোর্টের সিদ্ধান্ত', en: 'Report decided' },
    'appeal.decide': { bn: 'আপিলের সিদ্ধান্ত', en: 'Appeal decided' },
    'content.remove': { bn: 'কনটেন্ট সরানো', en: 'Content removed' },
    'content.restore': { bn: 'কনটেন্ট ফেরত', en: 'Content restored' },
    'content.purge': { bn: 'কনটেন্ট মুছে ফেলা', en: 'Content purged' },
    'broadcast.send': { bn: 'ব্রডকাস্ট পাঠানো', en: 'Broadcast sent' },
    'group.role': { bn: 'গ্রুপের ভূমিকা', en: 'Group role' },
    'group.removeMember': { bn: 'গ্রুপ থেকে সরানো', en: 'Removed from group' },
    'group.reviewRequest': { bn: 'যোগদানের আবেদন', en: 'Join request reviewed' },
    'order.refund': { bn: 'অর্ডার ফেরত', en: 'Order refunded' },
  };
  return labels[action];
}

/**
 * Filters the trail. Every comparison is a substring match on the fields an operator would
 * actually remember: the account id, the target, or a word from the reason.
 * @param entries the trail
 * @param filter the filter
 * @returns the matching entries, newest first
 */
export function filterAudit(
  entries: readonly AuditEntry[],
  filter: AuditFilter = {},
): readonly AuditEntry[] {
  const needle = (filter.query ?? '').trim().toLowerCase();
  return entries
    .filter((entry) => {
      if (filter.action !== undefined && entry.action !== filter.action) return false;
      if (filter.actorUid !== undefined && entry.actorUid !== filter.actorUid) return false;
      if (filter.targetUid !== undefined && entry.targetUid !== filter.targetUid) return false;
      if (needle.length === 0) return true;
      return (
        entry.actorUid.toLowerCase().includes(needle) ||
        entry.targetUid.toLowerCase().includes(needle) ||
        entry.targetType.toLowerCase().includes(needle) ||
        entry.targetId.toLowerCase().includes(needle) ||
        entry.reason.toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Groups the trail into one line per action, for the summary strip.
 * @param entries the trail
 * @returns action to count, most frequent first
 */
export function summariseAudit(
  entries: readonly AuditEntry[],
): readonly { readonly action: AuditAction; readonly count: number }[] {
  const counts = new Map<AuditAction, number>();
  for (const entry of entries) counts.set(entry.action, (counts.get(entry.action) ?? 0) + 1);
  return [...counts.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Reports whether an entry is still inside the retention window.
 * @param entry the entry
 * @param now the instant
 * @returns true while the entry is retained
 */
export function isRetained(entry: AuditEntry, now: Date = new Date()): boolean {
  const ageDays = (now.getTime() - Date.parse(entry.createdAt)) / 86_400_000;
  return ageDays < RETENTION.auditRetentionDays;
}

/**
 * Builds the audit row a client proposes. The client does not write the trail — the Cloud Function
 * does — but the client must send the same shape, and building it here is what keeps the two in
 * step instead of trusting a hand-written object at the call site.
 * @param action the action
 * @param actorUid who did it
 * @param actorRole the role they held
 * @param target what it was done to
 * @param before the prior value
 * @param after the new value
 * @param reason why
 * @param now the instant
 * @returns the entry
 */
export function newAuditEntry(
  action: AuditAction,
  actorUid: string,
  actorRole: string,
  target: { readonly uid?: string; readonly type?: string; readonly id?: string },
  before: string,
  after: string,
  reason: string,
  now: Date = new Date(),
): AuditEntry {
  return {
    id: `${Date.parse(now.toISOString())}-${actorUid}-${action}`,
    action,
    actorUid,
    actorRole,
    targetUid: target.uid ?? '',
    targetType: target.type ?? '',
    targetId: target.id ?? '',
    before,
    after,
    reason,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
