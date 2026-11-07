/**
 * Stored reports, and what a stored report is for.
 *
 * `create_report_snapshot()` freezes the numbers of a period into a JSON payload
 * and `report_snapshots_list()` lists them. Both existed and neither was called by
 * anything: the only way to answer "what did the queue look like the week of the
 * flood of spam reports" was to remember, because the live numbers are live.
 *
 * A snapshot is the difference between a report and a dashboard. The dashboard is
 * always now; a report says what the numbers were when somebody signed their name
 * to them, which is what an incident review and a monthly handover need.
 */

/** The kinds `bsdc_report_kind` declares. */
export const REPORT_KINDS = ['moderation', 'growth', 'revenue', 'trust'] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];

/** A row of `report_snapshots_list(p_limit)`. */
export interface SnapshotRow {
  id: string;
  kind: string;
  title: string;
  period_from: string;
  period_to: string;
  created_by: string;
  created_at: string;
}

/** One number inside a stored payload. */
export interface SnapshotTotal {
  readonly label: string;
  readonly value: string;
}

/**
 * What a kind means, so a chooser is not a list of four words.
 *
 * "Growth" and "trust" are the platform's own vocabulary; somebody who has been a
 * moderator for a week does not know which one holds certificate issuance.
 */
export function kindDescription(kind: ReportKind): string {
  switch (kind) {
    case 'moderation':
      return 'Reports opened and closed, actions taken, and how long a report waited.';
    case 'growth':
      return 'Members and posts over the period, and the days they arrived on.';
    case 'revenue':
      return 'Orders, gross sales, commission and advertising spend.';
    case 'trust':
      return 'Verification and certificate activity, by kind and by day.';
  }
}

/**
 * A title the operator does not have to invent.
 *
 * An untitled snapshot is one nobody can find again, and 'Report' is a title that
 * every snapshot would have. This names the period, which is how somebody looks
 * for one.
 */
export function suggestedTitle(kind: ReportKind, days: number, today = new Date()): string {
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const name = kind.charAt(0).toUpperCase() + kind.slice(1);
  return `${name} report ${start} to ${end}`;
}

/** What is wrong with a snapshot request before it is sent. */
export function snapshotProblems(title: string, days: number): readonly string[] {
  const problems: string[] = [];
  if (title.trim().length < 4) {
    problems.push('Give it a title you will recognise in three months.');
  }
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    problems.push('A period is between 1 and 365 days.');
  }
  return problems;
}

/**
 * A stored payload, flattened into rows a table can draw.
 *
 * The payload is `jsonb` with a `totals` object and, depending on the kind, a
 * series. It is deliberately shown as key/value rather than as a bespoke chart per
 * kind: a snapshot is evidence, and evidence is read, not interpreted. Nested
 * objects are summarised by their length, because a table cell is not the place for
 * a hundred-day series.
 */
export function flattenPayload(payload: unknown): readonly SnapshotTotal[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const rows: SnapshotTotal[] = [];
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (key === 'generated_at') continue;
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      rows.push({ label: humanise(key), value: `${String(value.length)} entries` });
      continue;
    }
    if (typeof value === 'object') {
      for (const [innerKey, innerValue] of Object.entries(value as Record<string, unknown>)) {
        if (innerValue === null || innerValue === undefined) continue;
        rows.push({
          label: humanise(innerKey),
          value: Array.isArray(innerValue)
            ? `${String(innerValue.length)} entries`
            : formatValue(innerValue),
        });
      }
      continue;
    }
    rows.push({ label: humanise(key), value: formatValue(value) });
  }
  return rows;
}

/** `members_period` reads as "Members period", which is a sentence a person reads. */
export function humanise(key: string): string {
  const spaced = key.replace(/[_-]+/g, ' ').trim();
  if (spaced.length === 0) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatValue(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toLocaleString('en-US') : value.toFixed(2);
  }
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value as string);
}

/**
 * The period a snapshot covers, in one line.
 *
 * `report_snapshots_list` returns dates already truncated to the day, so this does
 * no time-zone arithmetic: it would be a chance to be wrong about a value the
 * database has already decided.
 */
export function periodLabel(row: SnapshotRow): string {
  if (row.period_from === row.period_to) return row.period_from;
  return `${row.period_from} → ${row.period_to}`;
}

/** Oldest first would bury the one somebody is looking for; newest first is the default. */
export function newestFirst(rows: readonly SnapshotRow[]): SnapshotRow[] {
  return [...rows].sort((left, right) => {
    const a = Date.parse(left.created_at);
    const b = Date.parse(right.created_at);
    if (Number.isNaN(a) || Number.isNaN(b)) return 0;
    return b - a;
  });
}
