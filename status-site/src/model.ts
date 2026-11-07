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
