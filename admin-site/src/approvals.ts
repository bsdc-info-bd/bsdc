/**
 * A console row, as a person reads it.
 *
 * These are pure functions rather than JSX so they can be tested without a DOM,
 * and so the same wording is used on the dashboard, in the queue and in the
 * historical report — a badge that says "3 waiting" next to a list that says
 * "3 pending" is the sort of drift that makes an operator stop trusting both.
 */

/** What a decision needs before it can be made. */
export interface DecisionDraft {
  /** Empty means "decide without a note", which some decisions allow. */
  readonly note: string;
}

export const EMPTY_DECISION: DecisionDraft = { note: '' };

/** A row of `admin_pending_shops()`, named exactly as the function returns it. */
export interface PendingShopRow {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  city: string;
  owner_uid: string;
  owner_name: string;
  created_at: string;
}

/** A row of `admin_pending_campaigns()`, named exactly as the function returns it. */
export interface PendingCampaignRow {
  id: string;
  name: string;
  pricing: string;
  bid: number;
  total_budget: number;
  daily_budget: number;
  owner_uid: string;
  owner_name: string;
  creative_count: number;
  created_at: string;
}

/**
 * The note a rejection must carry.
 *
 * Approving silently is fine — the applicant gets their shop, which is the whole
 * answer. Rejecting silently is not: the applicant is left with a refusal and no
 * reason, and the only way to find out why is to ask a stranger on the internet.
 * Postgres refuses an empty note for the same reason, so this is the browser
 * half of a rule the database already enforces.
 */
export function decisionProblems(approve: boolean, draft: DecisionDraft): readonly string[] {
  if (approve) return [];
  return draft.note.trim().length < 4
    ? ['Say why it was refused. The applicant sees this note.']
    : [];
}

/** The label on the button that makes the decision. */
export function decisionLabel(approve: boolean): string {
  return approve ? 'Approve' : 'Refuse';
}

/**
 * How long something has been waiting, in the words an operator uses.
 *
 * A queue sortable by "waiting since" is a queue that gets worked oldest-first,
 * which is the only order that is fair to the applicants.
 */
export function waitingFor(createdAt: string, now = Date.now()): string {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return 'unknown';
  const minutes = Math.floor((now - created) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${String(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${String(days)} days`;
}

/**
 * Oldest first, with an unparseable date last.
 *
 * The queue is sorted in the browser as well as in Postgres because a console
 * refreshes a page at a time; a sort that only exists in the query would reorder
 * itself under an operator who is halfway down the list.
 */
export function oldestFirst<T extends { created_at: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((left, right) => {
    const a = Date.parse(left.created_at);
    const b = Date.parse(right.created_at);
    if (Number.isNaN(a) && Number.isNaN(b)) return 0;
    if (Number.isNaN(a)) return 1;
    if (Number.isNaN(b)) return -1;
    return a - b;
  });
}

/**
 * Money as an operator reads it, from the integer the database stores.
 *
 * Ad budgets are stored in the currency's smallest unit, so a total of 5000 is
 * ৳50. A console that showed 5000 next to a "৳" would be off by two orders of
 * magnitude in the one number an advertiser will check.
 */
export function money(cents: number): string {
  if (!Number.isFinite(cents) || cents < 0) return '—';
  return `৳${(cents / 100).toLocaleString('en-BD', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * What a decision on a shop or a campaign will produce, in one sentence, before
 * the operator presses anything.
 *
 * The confirmation is the difference between a mis-click and a review: a console
 * that decides on the first click decides by accident.
 */
export function confirmDecision(kind: 'shop' | 'campaign', approve: boolean, name: string): string {
  const subject = kind === 'shop' ? 'shop' : 'advertisement';
  return approve
    ? `Approve the ${subject} “${name}”? It goes live straight away.`
    : `Refuse the ${subject} “${name}”? It stays on record and the owner is told why.`;
}

/**
 * What the console says when a queue is empty.
 *
 * An empty list is the normal state of a working queue, and saying so is the
 * difference between "there is nothing to do" and "this screen is broken".
 */
export function emptyQueueMessage(kind: 'shop' | 'campaign'): string {
  return kind === 'shop'
    ? 'No shops are waiting for review. A new one appears here the moment somebody opens a shop.'
    : 'No advertisements are waiting for review. A campaign appears here when an advertiser submits it.';
}
