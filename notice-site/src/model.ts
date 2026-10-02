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
  readonly expiresAt: string;
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
  expiresAt: '',
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
    expiresAt: row.expires_at === null ? '' : row.expires_at.slice(0, 16),
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
