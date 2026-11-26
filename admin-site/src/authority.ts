/**
 * The authority and session screens, turned into words.
 *
 * Three judgements live here, and all three are the kind that get made twice and
 * quietly disagree if they are not made once:
 *
 *   * what a `via` value means, in a sentence, for somebody who is not a DBA;
 *   * which sessions deserve an operator's attention, and in what order;
 *   * how to say "you may not see this" without implying the console is broken.
 */

/** A row of `public.person_authority(text)`. */
export interface AuthorityRow {
  permission: string;
  label: string;
  subject_kind: string;
  is_destructive: boolean;
  effective: boolean;
  via: 'role' | 'grant' | 'owner' | 'denied' | 'none';
  deny_scope: string | null;
  deny_reason: string | null;
  grant_scope: string | null;
  grant_expires_at: string | null;
  grant_reason: string | null;
  grant_by: string | null;
  role_rank: number;
  grant_rank: number;
}

/** A row of `public.person_authority_summary(text)`. */
export interface AuthoritySummary {
  uid: string;
  display_name: string;
  role: string;
  status: string;
  effective_from: number;
  granted: number;
  denied: number;
  from_role: number;
  sessions_live: number;
  last_seen_at: string | null;
  last_audited_at: string | null;
}

/** A row of `public.admin_staff_sessions(integer, boolean)`. */
export interface StaffSessionRow {
  id: string;
  uid: string;
  display_name: string;
  role_now: string;
  role_at_start: string;
  device_label: string | null;
  country: string | null;
  started_at: string;
  last_seen_at: string;
  idle_minutes: number;
  is_flagged: boolean;
  flag_reason: string | null;
}

/** A row of `public.person_timeline(text, integer)`. */
export interface TimelineRow {
  id: number;
  action: string;
  action_label: string;
  subject: string;
  reason: string | null;
  has_diff: boolean;
  actor_uid: string | null;
  actor_name: string;
  created_at: string;
}

export type AuthorityTone = 'ok' | 'warn' | 'bad' | 'neutral';

/**
 * What each route to a permission means, said plainly.
 *
 * The distinction a person actually needs is between "your role brings this" and
 * "somebody gave this to you specifically" — because the second one has a name
 * attached and an expiry date, and the first one does not.
 */
export function describeRoute(via: AuthorityRow['via']): string {
  switch (via) {
    case 'role':
      return 'Comes with the role. Changing the role changes this.';
    case 'grant':
      return 'Granted to this account specifically, on top of the role.';
    case 'owner':
      return 'The owner holds every permission, including ones nobody has catalogued yet.';
    case 'denied':
      return 'Deliberately withheld, even though the role would allow it.';
    case 'none':
      return 'Not held. Nothing has been granted, and the role does not bring it.';
  }
}

export function authorityTone(row: AuthorityRow): AuthorityTone {
  // A denial is the thing somebody opens this screen to find, so it leads.
  if (row.via === 'denied') return 'bad';
  if (row.effective && row.is_destructive) return 'warn';
  if (row.effective) return 'ok';
  return 'neutral';
}

/**
 * Whether a grant is running out soon enough to mention.
 *
 * Seven days, because a grant that expires at the end of the week is a
 * conversation somebody needs to have this week — and a grant that expired
 * yesterday is not "expiring", it is already gone and will not appear here at all.
 */
export const EXPIRING_SOON_DAYS = 7;

export function daysUntil(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.ceil((then - now.getTime()) / 86_400_000);
}

/**
 * When a grant runs out, said in the unit that is honest about it.
 *
 * A round of `Math.ceil(days)` sounds harmless and is not: a grant with eight
 * hours left rounds up to "expires tomorrow", which reads as a whole day of
 * slack to somebody deciding whether to renew it today. Anything under a day is
 * therefore stated in hours, and the day counts are whole days remaining rather
 * than a rounding of the difference.
 */
export function expiryNote(row: AuthorityRow, now: Date = new Date()): string {
  if (!row.grant_expires_at) return '';
  const then = new Date(row.grant_expires_at).getTime();
  if (!Number.isFinite(then)) return '';
  const msLeft = then - now.getTime();
  if (msLeft <= 0) return 'expired';
  const hoursLeft = Math.floor(msLeft / 3_600_000);
  if (hoursLeft < 1) return 'expires within the hour';
  if (hoursLeft < 24) return `expires in ${String(hoursLeft)}h`;
  const days = Math.floor(msLeft / 86_400_000);
  if (days === 1) return 'expires tomorrow';
  return `expires in ${String(days)} days`;
}

/**
 * The authority list, ordered so the reason somebody opened the screen is first.
 *
 * Denials, then held-and-destructive, then held, then everything else held by
 * nothing. Within a group, alphabetical: a list that reorders itself as state
 * changes is a list nobody can learn.
 */
export function orderAuthority(rows: readonly AuthorityRow[]): readonly AuthorityRow[] {
  const rank = (row: AuthorityRow): number => {
    if (row.via === 'denied') return 0;
    if (row.effective && row.is_destructive) return 1;
    if (row.effective) return 2;
    return 3;
  };
  return [...rows].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return a.permission.localeCompare(b.permission);
  });
}

export interface AuthorityCounts {
  readonly effective: number;
  readonly granted: number;
  readonly denied: number;
  readonly destructive: number;
}

export function countAuthority(rows: readonly AuthorityRow[]): AuthorityCounts {
  return {
    effective: rows.filter((row) => row.effective).length,
    granted: rows.filter((row) => row.via === 'grant').length,
    denied: rows.filter((row) => row.via === 'denied').length,
    destructive: rows.filter((row) => row.effective && row.is_destructive).length,
  };
}

/**
 * Whether this account can hand this permission to somebody else.
 *
 * Three conditions, and all three are the database's rules restated so the UI can
 * disable a control rather than offer one that will be refused. The rules are
 * enforced server-side; this only avoids the pointless round trip.
 */
export function canGrantFrom(
  actor: { role_rank: number; via: AuthorityRow['via']; effective: boolean; grant_rank: number },
  permission: { is_destructive: boolean; grant_rank: number },
): boolean {
  if (!actor.effective) return false;
  if (permission.grant_rank > actor.role_rank && actor.via !== 'owner') return false;
  // A destructive permission is never handed out by somebody who merely holds it;
  // the database requires the owner for those, and the UI says so.
  if (permission.is_destructive) return actor.via === 'owner';
  return true;
}

/**
 * Sessions, worst first.
 *
 * A flagged session is by definition the reason the screen was opened, so it
 * sorts above everything, then by how long it has been idle — an abandoned
 * console is more interesting than a busy one.
 */
export function orderSessions(rows: readonly StaffSessionRow[]): readonly StaffSessionRow[] {
  return [...rows].sort((a, b) => {
    if (a.is_flagged !== b.is_flagged) return a.is_flagged ? -1 : 1;
    return b.idle_minutes - a.idle_minutes;
  });
}

export function idleNote(minutes: number): string {
  if (minutes < 1) return 'active now';
  if (minutes < 60) return `idle ${String(minutes)}m`;
  if (minutes < 1440) return `idle ${String(Math.floor(minutes / 60))}h`;
  return `idle ${String(Math.floor(minutes / 1440))}d`;
}

/** A session's country as a readable pair, without pretending to be a map. */
export function countryNote(session: StaffSessionRow): string {
  if (!session.country) return 'origin unknown';
  return session.country.toUpperCase();
}

/**
 * The one-sentence summary of a flagged session, for a row that has room for one.
 *
 * The database's `flag_reason` is already written for a human; this adds the
 * thing the database cannot know, which is whether the flag is about the session
 * or about the account's history.
 */
export function flagSummary(session: StaffSessionRow): string {
  if (!session.is_flagged) return '';
  const reason = session.flag_reason ?? 'flagged for review';
  if (session.role_at_start !== session.role_now) {
    return `${reason} — the console they have open may be showing stale controls.`;
  }
  return reason;
}

/**
 * Whether a session should be ended with a warning rather than a click.
 *
 * Ending your own current session is a sign-out; ending somebody else's is a
 * revocation, and the difference matters enough to change the button.
 */
export function endAction(session: StaffSessionRow, currentUid: string): 'sign-out' | 'revoke' {
  return session.uid === currentUid ? 'sign-out' : 'revoke';
}

/**
 * Why a timeline is empty, which is not the same as why it failed.
 *
 * An account three minutes old has no history; that is not a fault, and saying
 * "no activity" would be technically true and practically unhelpful.
 */
export function emptyTimelineNote(accountAgeDays: number | null): string {
  if (accountAgeDays === null) return 'Nothing has been recorded about this account yet.';
  if (accountAgeDays <= 1) return 'New account: nothing has happened to it yet.';
  return 'Nothing has been recorded about this account. That is itself worth a look.';
}

/** The Bangla and English label for a route, for a console in either language. */
export function routeLabel(via: AuthorityRow['via'], language: 'en' | 'bn' = 'en'): string {
  const en: Record<AuthorityRow['via'], string> = {
    role: 'from role',
    grant: 'granted',
    owner: 'owner',
    denied: 'denied',
    none: 'not held',
  };
  const bn: Record<AuthorityRow['via'], string> = {
    role: 'ভূমিকা থেকে',
    grant: 'অনুদান',
    owner: 'মালিক',
    denied: 'নিষিদ্ধ',
    none: 'নেই',
  };
  return language === 'bn' ? bn[via] : en[via];
}
