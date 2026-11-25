import type { DayCheck, ServiceState, ServiceSummary } from '@kit';

export type UptimeRow = {
  readonly service_key: string;
  readonly name: string;
  readonly category: string;
  readonly state: ServiceState;
  readonly uptime_pct: number | string;
  readonly avg_latency: number;
  readonly open_incident: boolean;
};

export type CheckRow = {
  readonly service_key: string;
  readonly day: string;
  readonly ok_count: number;
  readonly fail_count: number;
};

export type IncidentUpdate = {
  readonly body: string;
  readonly state: string;
  readonly created_at: string;
};

export type IncidentRow = {
  readonly id: string;
  readonly service_key: string | null;
  readonly title: string;
  readonly impact: 'none' | 'minor' | 'major' | 'critical';
  readonly started_at: string;
  readonly resolved_at: string | null;
  readonly updates: readonly IncidentUpdate[];
};

/** The calendar days a 90-day timeline covers, oldest first. */
export function dayWindow(days: number, today: Date): readonly string[] {
  const result: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today.getTime());
    date.setUTCDate(date.getUTCDate() - offset);
    result.push(date.toISOString().slice(0, 10));
  }
  return result;
}

/**
 * Builds one timeline per service over a fixed window. A day with no
 * recorded check is kept as an empty day rather than dropped, so the bars
 * stay aligned across services and a monitoring gap is visible as a gap.
 */
export function buildTimelines(
  services: readonly UptimeRow[],
  checks: readonly CheckRow[],
  days: number,
  today = new Date(),
): readonly ServiceSummary[] {
  const window = dayWindow(days, today);
  const byService = new Map<string, Map<string, CheckRow>>();
  for (const check of checks) {
    let bucket = byService.get(check.service_key);
    if (!bucket) {
      bucket = new Map<string, CheckRow>();
      byService.set(check.service_key, bucket);
    }
    bucket.set(check.day, check);
  }

  return services.map((service) => {
    const bucket = byService.get(service.service_key);
    const timeline: DayCheck[] = window.map((day) => {
      const row = bucket?.get(day);
      return {
        day,
        okCount: row?.ok_count ?? 0,
        failCount: row?.fail_count ?? 0,
      };
    });
    return { slug: service.service_key, name: service.name, state: service.state, days: timeline };
  });
}

/** PostgREST returns numerics as strings; the page needs a number. */
export function uptimeOf(row: UptimeRow): number {
  const value = typeof row.uptime_pct === 'number' ? row.uptime_pct : Number(row.uptime_pct);
  return Number.isFinite(value) ? value : 100;
}

export function impactTone(impact: IncidentRow['impact']): 'neutral' | 'warn' | 'bad' {
  if (impact === 'critical' || impact === 'major') return 'bad';
  if (impact === 'minor') return 'warn';
  return 'neutral';
}

/** Open incidents first, then the most recent, which is how people read them. */
export function sortIncidents(incidents: readonly IncidentRow[]): readonly IncidentRow[] {
  return [...incidents].sort((a, b) => {
    if ((a.resolved_at === null) !== (b.resolved_at === null))
      return a.resolved_at === null ? -1 : 1;
    return Date.parse(b.started_at) - Date.parse(a.started_at);
  });
}

/** Services grouped by category, so related things sit together. */
export function byCategory(rows: readonly UptimeRow[]): ReadonlyArray<{
  readonly category: string;
  readonly rows: readonly UptimeRow[];
}> {
  const order: string[] = [];
  const buckets = new Map<string, UptimeRow[]>();
  for (const row of rows) {
    let bucket = buckets.get(row.category);
    if (!bucket) {
      bucket = [];
      buckets.set(row.category, bucket);
      order.push(row.category);
    }
    bucket.push(row);
  }
  return order.map((category) => ({ category, rows: buckets.get(category) ?? [] }));
}

/**
 * What a service check should say, before it is recorded.
 *
 * `record_service_check()` accepts a key, a verdict and a latency and nothing
 * else — no message, no status code. That means a console which lets an operator
 * type free text would be writing it nowhere, so the panel asks only for the three
 * fields the routine takes, and this decides what they mean.
 */
export interface CheckDraft {
  readonly serviceKey: string;
  readonly ok: boolean;
  readonly latencyMs: number;
}

export const EMPTY_CHECK: CheckDraft = { serviceKey: '', ok: true, latencyMs: 0 };

/** The problems with a check before it is recorded, in the order they are read. */
export function checkProblems(
  draft: CheckDraft,
  knownServices: readonly string[],
): readonly string[] {
  const problems: string[] = [];
  if (draft.serviceKey.trim() === '') {
    problems.push('Choose the service this check is about.');
  } else if (knownServices.length > 0 && !knownServices.includes(draft.serviceKey)) {
    // A key the board does not know would be recorded and never shown, which is a
    // check that exists only in the database.
    problems.push(`“${draft.serviceKey}” is not one of the services on the board.`);
  }
  if (!Number.isFinite(draft.latencyMs) || draft.latencyMs < 0 || draft.latencyMs > 120_000) {
    problems.push('A latency is a number of milliseconds between 0 and 120000.');
  }
  return problems;
}

/**
 * Why a check must not be recorded by a person.
 *
 * This is the rule that stops the uptime figure from becoming a lie. Uptime is
 * computed from these rows, and a row written by hand is a row that says a service
 * was up because somebody looked at it. The scheduler probes from four regions and
 * writes what it saw; a console writes a note, not a measurement.
 */
export function checkIsHumanEntered(draft: CheckDraft): boolean {
  // A missing key is not a measurement either.
  return draft.serviceKey.trim() === '' || draft.latencyMs === 0;
}

/**
 * How long an incident has been open, in words, for the board's own header.
 *
 * A resolved incident uses its own window. An open one uses now, which is the
 * number an operator is looking at when they decide whether to escalate.
 */
export function openFor(incident: IncidentRow, now = Date.now()): string {
  const start = Date.parse(incident.started_at);
  if (Number.isNaN(start)) return 'unknown';
  const end = incident.resolved_at === null ? now : Date.parse(incident.resolved_at);
  if (Number.isNaN(end)) return 'unknown';
  const minutes = Math.max(0, Math.floor((end - start) / 60_000));
  if (minutes < 60) return `${String(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ${String(minutes % 60)}m`;
  return `${String(Math.floor(hours / 24))}d ${String(hours % 24)}h`;
}

/**
 * Whether a resolution note is acceptable.
 *
 * `resolve_incident()` appends the body as the closing update on the public board,
 * so an empty one publishes "resolved" with no explanation — the exact thing a
 * status page exists to avoid.
 */
export function resolutionProblems(body: string): readonly string[] {
  return body.trim().length < 12
    ? [
        'Say what happened and what was done. This is the last update anybody reading the board will see.',
      ]
    : [];
}

/** Whether an incident update is acceptable, whatever it is being used for. */
export function noteProblems(body: string, minimum = 12): readonly string[] {
  return body.trim().length < minimum ? [`Write at least ${String(minimum)} characters.`] : [];
}

// ---------------------------------------------------------------------------
// §13.2 Incidents that survive their own resolution
// ---------------------------------------------------------------------------

/**
 * An incident as 0149 returns it, with the public and internal sides kept
 * apart. The distinction is the whole point of the response: an engineer's
 * "we think it was the cache" is not a customer-facing statement.
 */
export type IncidentRowV2 = IncidentRow & {
  readonly public_title?: string | undefined;
  readonly public_slug?: string | undefined;
  readonly summary?: string | undefined;
  readonly postmortem?: string | undefined;
  readonly postmortem_at?: string | null | undefined;
  readonly is_drill?: boolean | undefined;
  readonly declared_at?: string | undefined;
  readonly channel_id?: string | null | undefined;
  readonly updates_v2?: readonly PublicUpdate[] | undefined;
};

export type PublicUpdate = {
  readonly body: string;
  readonly state: string;
  readonly at: string;
};

export type IncidentAction = {
  readonly id: string;
  readonly body: string;
  readonly owner_uid: string | null;
  readonly due_on: string;
  readonly done_at: string | null;
  readonly done_note: string;
};

/** The customer-facing title, falling back to the internal one for old rows. */
export function publicTitle(incident: IncidentRowV2): string {
  const title = incident.public_title ?? '';
  return title.trim() === '' ? incident.title : title;
}

/**
 * What the board says about an open incident, in one sentence.
 *
 * "Investigating" is the sentence §13.2 is written against: it tells a reader
 * nothing and is the same on every incident. This says what is affected, how
 * long it has been happening, and whether anything has changed recently.
 */
export function boardSentence(incident: IncidentRowV2, now = Date.now()): string {
  const started = new Date(incident.started_at).getTime();
  const hours = Number.isNaN(started) ? null : Math.floor((now - started) / 3_600_000);
  const span = hours === null ? 'for a while' : hours < 1 ? 'for less than an hour' : hours < 24 ? `for ${String(hours)} hour${hours === 1 ? '' : 's'}` : `for ${String(Math.floor(hours / 24))} day${Math.floor(hours / 24) === 1 ? '' : 's'}`;
  const scope =
    incident.impact === 'critical'
      ? 'The service is unavailable'
      : incident.impact === 'major'
        ? 'Parts of the service are unavailable'
        : incident.impact === 'minor'
          ? 'The service is slower than usual'
          : 'There is no customer impact';
  const last = (incident.updates_v2 ?? [])[(incident.updates_v2 ?? []).length - 1];
  const trailing =
    last === undefined
      ? '.'
      : `. The last update was ${relativeSpan(last.at, now)}.`;
  return `${scope}${incident.is_drill === true ? ' (drill)' : ''} ${span}${trailing}`;
}

function relativeSpan(iso: string, now: number): string {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return 'at an unrecorded time';
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${String(minutes)} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} hour${hours === 1 ? '' : 's'} ago`;
  return `${String(Math.floor(hours / 24))} day${Math.floor(hours / 24) === 1 ? '' : 's'} ago`;
}

/** What a declaration needs before it can be made. */
export function declareProblems(input: {
  readonly title: string;
  readonly publicTitle: string;
  readonly publicBody: string;
}): readonly string[] {
  const problems: string[] = [];
  if (input.title.trim().length < 4) {
    problems.push('Give the incident an internal title, so the staff channel says what it is about.');
  }
  if (input.publicTitle.trim().length < 4) {
    problems.push('Give it a public title. The status board shows it without any context around it.');
  }
  if (input.publicBody.trim().length < 10) {
    problems.push('Write the sentence a customer will read. "Investigating" is not one.');
  }
  return problems;
}

/**
 * An action is late when its due date has passed and nobody has closed it. It
 * is not "overdue" the day before, and it is not late because it is old.
 */
export function actionState(action: IncidentAction, now = new Date()): 'done' | 'late' | 'due' | 'open' {
  if (action.done_at !== null) return 'done';
  const due = new Date(`${action.due_on.slice(0, 10)}T23:59:59Z`).getTime();
  if (Number.isNaN(due)) return 'open';
  const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  if (due < today) return 'late';
  if (due - today <= 86_400_000) return 'due';
  return 'open';
}

/** The list of things nobody has done yet, oldest due date first. */
export function openActions(actions: readonly IncidentAction[]): readonly IncidentAction[] {
  return actions
    .filter((action) => action.done_at === null)
    .slice()
    .sort((a, b) => a.due_on.localeCompare(b.due_on));
}

/** A post-mortem is only worth writing after the fact, and only if it says something. */
export function postmortemProblem(body: string, resolvedAt: string | null): string {
  if (resolvedAt === null) {
    return 'A post-mortem is written after the incident is resolved, not during it.';
  }
  const trimmed = body.trim();
  if (trimmed.length === 0) return 'Write what happened, why, and what would have caught it.';
  if (trimmed.length < 40) return 'That is a sentence, not a post-mortem. What would have caught it?';
  return '';
}

/** Drills are labelled wherever they appear, because a rehearsal mistaken for an outage is worse than neither. */
export function drillLabel(incident: IncidentRowV2): string {
  return incident.is_drill === true ? 'Drill — no customer impact' : '';
}
