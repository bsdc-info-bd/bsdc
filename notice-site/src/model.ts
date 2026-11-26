import { normaliseDocCode } from '@kit';

export type NoticeAudience = 'public' | 'members' | 'staff';
export type NoticePriority = 'routine' | 'important' | 'urgent';
export type NoticeStatus = 'draft' | 'published' | 'archived';

export type NoticeRow = {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly category: string;
  readonly audience: NoticeAudience;
  readonly priority: NoticePriority;
  readonly status: NoticeStatus;
  readonly pinned: boolean;
  readonly requires_ack: boolean;
  readonly publish_at: string | null;
  readonly expires_at: string | null;
  readonly updated_at: string;
  readonly acknowledgements: number;
  readonly staff_total: number;
  readonly version?: number | undefined;
  /** 0147: the paper trail. Absent on a read that does not select it. */
  readonly withdraw_reason?: string | undefined;
  readonly withdrawn_at?: string | null | undefined;
  readonly legal_hold?: boolean | undefined;
  readonly legal_hold_scope?: string | undefined;
};

export type NoticeRevisionRow = {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly category: string;
  readonly audience: NoticeAudience;
  readonly priority: NoticePriority;
  readonly status: NoticeStatus;
  readonly pinned: boolean;
  readonly requires_ack: boolean;
  readonly publish_at: string | null;
  readonly expires_at: string | null;
  readonly edited_by: string | null;
  readonly edit_note: string;
  readonly created_at: string;
};

export type NoticeAckRosterRow = {
  readonly uid: string;
  readonly staff_no: string;
  readonly display_name: string;
  readonly department: string;
  readonly role: string;
  readonly acknowledged: boolean;
  readonly acknowledged_at: string | null;
};

export type NoticeDraft = {
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly category: string;
  readonly audience: NoticeAudience;
  readonly priority: NoticePriority;
  readonly pinned: boolean;
  readonly requiresAck: boolean;
  readonly publishAt: string;
  readonly expiresAt: string;
  readonly editNote: string;
};

export const EMPTY_DRAFT: NoticeDraft = {
  title: '',
  summary: '',
  body: '',
  category: 'general',
  audience: 'public',
  priority: 'routine',
  pinned: false,
  requiresAck: false,
  publishAt: '',
  expiresAt: '',
  editNote: '',
};

export const AUDIENCES: readonly NoticeAudience[] = ['public', 'members', 'staff'];
export const PRIORITIES: readonly NoticePriority[] = ['routine', 'important', 'urgent'];

export function audienceLabel(audience: NoticeAudience): string {
  switch (audience) {
    case 'public':
      return 'Anybody, including people who are not signed in';
    case 'members':
      return 'Signed-in members';
    default:
      return 'Staff only';
  }
}

/** Everything standing between a draft and a notice worth publishing. */
export function draftProblems(draft: NoticeDraft): readonly string[] {
  const problems: string[] = [];
  if (draft.title.trim().length < 4) problems.push('The title needs at least four characters.');
  if (draft.title.trim().length > 160) problems.push('The title is longer than 160 characters.');
  if (draft.summary.trim() === '') {
    problems.push('Write a one-line summary: it is what a reader sees in a list.');
  }
  if (draft.summary.length > 300) problems.push('The summary is longer than 300 characters.');
  if (draft.body.trim().length < 20) problems.push('The notice needs a body.');
  if (draft.requiresAck && draft.audience === 'public') {
    problems.push(
      'A public notice cannot require an acknowledgement, because readers are anonymous.',
    );
  }
  if (draft.expiresAt !== '' && Number.isNaN(Date.parse(draft.expiresAt))) {
    problems.push('The expiry must be a date and time.');
  }
  return problems;
}

export function draftToRow(draft: NoticeDraft): Record<string, unknown> {
  return {
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    body: draft.body.trim(),
    category: draft.category.trim() === '' ? 'general' : draft.category.trim().toLowerCase(),
    audience: draft.audience,
    priority: draft.priority,
    pinned: draft.pinned,
    requires_ack: draft.requiresAck,
    expires_at: draft.expiresAt === '' ? null : new Date(draft.expiresAt).toISOString(),
  };
}

export function rowToDraft(row: NoticeRow): NoticeDraft {
  return {
    title: row.title,
    summary: row.summary,
    body: row.body,
    category: row.category,
    audience: row.audience,
    priority: row.priority,
    pinned: row.pinned,
    requiresAck: row.requires_ack,
    publishAt: row.publish_at === null ? '' : row.publish_at.slice(0, 16),
    expiresAt: row.expires_at === null ? '' : row.expires_at.slice(0, 16),
    editNote: '',
  };
}

export function noticeRevisionArgs(id: string | null, draft: NoticeDraft): Record<string, unknown> {
  return {
    p_id: id,
    p_title: draft.title.trim(),
    p_summary: draft.summary.trim(),
    p_body: draft.body.trim(),
    p_category: draft.category.trim() === '' ? 'general' : draft.category.trim().toLowerCase(),
    p_audience: draft.audience,
    p_priority: draft.priority,
    p_pinned: draft.pinned,
    p_requires_ack: draft.requiresAck,
    p_publish_at: draft.publishAt === '' ? null : new Date(draft.publishAt).toISOString(),
    p_expires_at: draft.expiresAt === '' ? null : new Date(draft.expiresAt).toISOString(),
    p_edit_note: draft.editNote.trim(),
  };
}

export type LiveState = 'draft' | 'scheduled' | 'live' | 'expired' | 'archived';

/**
 * Where a notice actually stands. Publishing and being visible are two
 * different things: a notice with a future publish time is published and
 * simply waiting, which is the whole point of scheduling one.
 */
export function liveState(row: NoticeRow, now = new Date()): LiveState {
  if (row.status === 'archived') return 'archived';
  if (row.status === 'draft') return 'draft';
  if (row.publish_at === null) return 'draft';
  if (Date.parse(row.publish_at) > now.getTime()) return 'scheduled';
  if (row.expires_at !== null && Date.parse(row.expires_at) <= now.getTime()) return 'expired';
  return 'live';
}

export function liveStateTone(state: LiveState): 'ok' | 'warn' | 'neutral' {
  if (state === 'live') return 'ok';
  if (state === 'scheduled') return 'warn';
  return 'neutral';
}

/** A plain sentence about when this notice is, or was, visible. */
export function scheduleSummary(row: NoticeRow, now = new Date()): string {
  const state = liveState(row, now);
  const when = row.publish_at === null ? '' : new Date(row.publish_at).toLocaleString('en-GB');
  switch (state) {
    case 'draft':
      return 'Not published. Only editors can see it.';
    case 'scheduled':
      return `Published, visible from ${when}.`;
    case 'live':
      return row.expires_at === null
        ? `Visible since ${when}.`
        : `Visible since ${when}, until ${new Date(row.expires_at).toLocaleString('en-GB')}.`;
    case 'expired':
      return 'The window has closed, so readers no longer see it.';
    default:
      return 'Archived.';
  }
}

/** Acknowledgement progress against the active staff headcount. */
export function ackProgress(row: NoticeRow): { readonly percent: number; readonly label: string } {
  if (!row.requires_ack) return { percent: 0, label: 'No acknowledgement asked for' };
  if (row.staff_total <= 0) {
    return { percent: 0, label: `${row.acknowledgements} acknowledged` };
  }
  const percent = Math.min(100, Math.round((row.acknowledgements / row.staff_total) * 100));
  return {
    percent,
    label: `${row.acknowledgements} of ${row.staff_total} acknowledged (${percent}%)`,
  };
}

/** Pinned first, then the most recently useful. */
export function sortNotices(rows: readonly NoticeRow[], now = new Date()): readonly NoticeRow[] {
  const rank: Record<LiveState, number> = {
    live: 0,
    scheduled: 1,
    draft: 2,
    expired: 3,
    archived: 4,
  };
  return [...rows].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const byState = rank[liveState(a, now)] - rank[liveState(b, now)];
    if (byState !== 0) return byState;
    return Date.parse(b.updated_at) - Date.parse(a.updated_at);
  });
}

/** Turns the body into the paragraphs the preview and the PDF both render. */
export function paragraphs(body: string): readonly string[] {
  return body
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s*\n\s*/g, ' ').trim())
    .filter((block) => block !== '');
}

export function noticeFilename(code: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const safe = normaliseDocCode(code).replace(/[^A-Z0-9-]/g, '');
  return slug === '' ? `${safe}.pdf` : `${safe}-${slug}.pdf`;
}

export function filterNotices(
  rows: readonly NoticeRow[],
  search: string,
  stateFilter: string,
  audienceFilter: string,
  now = new Date(),
): readonly NoticeRow[] {
  const q = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (stateFilter !== 'all' && liveState(row, now) !== stateFilter) return false;
    if (audienceFilter !== 'all' && row.audience !== audienceFilter) return false;
    if (q === '') return true;
    return (
      row.title.toLowerCase().includes(q) ||
      row.code.toLowerCase().includes(q) ||
      row.summary.toLowerCase().includes(q) ||
      row.category.toLowerCase().includes(q)
    );
  });
}

// ---------------------------------------------------------------------------
// §11.2 Notices with a paper trail
// ---------------------------------------------------------------------------

/** Added to a notice row by 0147: the paper trail a reader can be shown. */
export type NoticeWithdrawal = {
  readonly withdraw_reason?: string | undefined;
  readonly withdrawn_at?: string | null | undefined;
  readonly legal_hold?: boolean | undefined;
  readonly legal_hold_scope?: string | undefined;
};

/**
 * The complete roster, not the staff-only one.
 *
 * `notice_ack_roster` counts `staff_records`, so a notice addressed to members shows a
 * denominator of the staff who must sign it — which is the right question for a policy
 * bulletin and the wrong one for a fire drill. `notice_ack_roster_full` counts the
 * audience the notice was actually addressed to, and adds the reminder count.
 */
export type NoticeRosterFullRow = {
  readonly uid: string;
  readonly display_name: string;
  readonly acknowledged: boolean;
  readonly acknowledged_at: string | null;
  readonly reminders_sent: number;
  readonly last_reminded_at: string | null;
};

export type RosterSummary = {
  readonly total: number;
  readonly acknowledged: number;
  readonly outstanding: number;
  /** Percentage acknowledged, rounded down so 99.6% never reads as 100%. */
  readonly percent: number;
  /** How many reminder rounds the notice has been through. */
  readonly rounds: number;
  readonly canRemind: boolean;
};

export function summariseRoster(rows: readonly NoticeRosterFullRow[]): RosterSummary {
  const total = rows.length;
  const acknowledged = rows.filter((r) => r.acknowledged).length;
  const outstanding = total - acknowledged;
  return {
    total,
    acknowledged,
    outstanding,
    percent: total === 0 ? 0 : Math.floor((acknowledged / total) * 100),
    rounds: rows.reduce((max, r) => (r.reminders_sent > max ? r.reminders_sent : max), 0),
    // A reminder to nobody is refused by the database; offering the button anyway
    // would teach the operator that the control is decorative.
    canRemind: outstanding > 0,
  };
}

/** The sentence a reminder action promises, so the operator knows what will happen. */
export function reminderPlan(summary: RosterSummary, nextRound: number): string {
  if (!summary.canRemind)
    return 'Everybody has acknowledged this notice. There is nobody to remind.';
  const people = summary.outstanding === 1 ? 'one person' : `${summary.outstanding} people`;
  const past =
    summary.rounds === 0 ? 'This is the first reminder' : `This would be reminder ${nextRound}`;
  return `${past}: ${people} will be notified, and the round is recorded against the notice.`;
}

export const MAX_WITHDRAW_REASON = 300;
export const MIN_WITHDRAW_REASON = 10;

/** Withdrawal needs a reason the reader will be shown, so the floor is not decoration. */
export function withdrawProblems(reason: string, status: string): readonly string[] {
  const problems: string[] = [];
  const trimmed = reason.trim();
  if (status !== 'published') {
    problems.push('Only a published notice can be withdrawn. A draft is deleted instead.');
  }
  if (trimmed.length < MIN_WITHDRAW_REASON) {
    problems.push(
      `Say why in at least ${MIN_WITHDRAW_REASON} characters — the reader is shown this sentence, not a dead link.`,
    );
  } else if (trimmed.length > MAX_WITHDRAW_REASON) {
    problems.push(`Keep the withdrawal reason to ${MAX_WITHDRAW_REASON} characters or fewer.`);
  }
  return problems;
}

export const MIN_LEGAL_HOLD_SCOPE = 10;

/**
 * A hold names its scope. "Everything" is a hold nobody can release, so the scope is
 * required both when it is set and when it is lifted — the reason for lifting is what
 * a dispute reads years later.
 */
export function legalHoldProblems(scope: string, holding: boolean): readonly string[] {
  const trimmed = scope.trim();
  if (trimmed.length < MIN_LEGAL_HOLD_SCOPE) {
    return [
      holding
        ? `Name what this hold covers, in at least ${MIN_LEGAL_HOLD_SCOPE} characters. A hold nobody can describe is a hold nobody can lift.`
        : `Say why the hold is being released, in at least ${MIN_LEGAL_HOLD_SCOPE} characters.`,
    ];
  }
  return [];
}

/** Why a notice cannot be deleted, or '' when it can. */
export function deleteBlockedReason(row: NoticeRow & NoticeWithdrawal): string {
  if (row.legal_hold === true) {
    const scope = (row.legal_hold_scope ?? '').trim();
    return scope === ''
      ? 'This notice is under a legal hold.'
      : `This notice is under a legal hold: ${scope}`;
  }
  if (row.status !== 'draft' && row.publish_at !== null) {
    return 'This notice has been published. Readers saw it, so it is withdrawn rather than deleted.';
  }
  return '';
}

/** What a reader is told when a notice they saw has since been withdrawn. */
export function withdrawnNoticeBanner(reason: string): string {
  const trimmed = reason.trim();
  return trimmed === ''
    ? 'This notice has been withdrawn. The desk did not record a reason.'
    : `This notice has been withdrawn: ${trimmed}`;
}
