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
