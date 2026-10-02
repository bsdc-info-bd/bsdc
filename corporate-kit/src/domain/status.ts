/**
 * Status-page arithmetic. Uptime is derived from recorded checks, never
 * typed in by hand, so the number on the public page cannot drift from what
 * the monitors actually saw.
 */

export type ServiceState = 'operational' | 'degraded' | 'partial' | 'down' | 'maintenance';

export type DayCheck = {
  readonly day: string;
  readonly okCount: number;
  readonly failCount: number;
};

export type ServiceSummary = {
  readonly slug: string;
  readonly name: string;
  readonly state: ServiceState;
  readonly days: readonly DayCheck[];
};

const SEVERITY: Record<ServiceState, number> = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  partial: 3,
  down: 4,
};

/** Percentage of successful checks, or null when nothing was ever recorded. */
export function uptimePercent(days: readonly DayCheck[]): number | null {
  let ok = 0;
  let total = 0;
  for (const day of days) {
    ok += day.okCount;
    total += day.okCount + day.failCount;
  }
  if (total === 0) return null;
  return Math.round((ok / total) * 10000) / 100;
}

/** Per-day health in 0..1, or null for a day with no checks (a gap, not a failure). */
export function dayRatio(day: DayCheck): number | null {
  const total = day.okCount + day.failCount;
  return total === 0 ? null : day.okCount / total;
}

/** The bar colour band for a day, matching what the legend explains. */
export function dayBand(day: DayCheck): 'none' | 'good' | 'partial' | 'bad' {
  const ratio = dayRatio(day);
  if (ratio === null) return 'none';
  if (ratio >= 0.999) return 'good';
  if (ratio >= 0.9) return 'partial';
  return 'bad';
}

/** The overall banner takes the worst state of any service. */
export function overallState(services: readonly ServiceSummary[]): ServiceState {
  let worst: ServiceState = 'operational';
  for (const service of services) {
    if (SEVERITY[service.state] > SEVERITY[worst]) worst = service.state;
  }
  return worst;
}

export function stateLabel(state: ServiceState): string {
  switch (state) {
    case 'operational':
      return 'All systems operational';
    case 'maintenance':
      return 'Scheduled maintenance';
    case 'degraded':
      return 'Degraded performance';
    case 'partial':
      return 'Partial outage';
    case 'down':
      return 'Major outage';
    default:
      return 'Unknown';
  }
}

/** Compact duration between two timestamps, for "resolved in 42m". */
export function formatDuration(startIso: string, endIso: string | null): string {
  const start = Date.parse(startIso);
  const end = endIso === null ? Date.now() : Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '—';
  const minutes = Math.floor((end - start) / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
