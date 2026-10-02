import { describe, expect, it } from 'vitest';
import {
  dayBand,
  dayRatio,
  formatDuration,
  overallState,
  stateLabel,
  uptimePercent,
  type DayCheck,
} from '@kit';
import {
  buildTimelines,
  byCategory,
  dayWindow,
  impactTone,
  sortIncidents,
  uptimeOf,
  type IncidentRow,
  type UptimeRow,
} from './model';

const service = (over: Partial<UptimeRow> = {}): UptimeRow => ({
  service_key: 'web',
  name: 'Main site',
  category: 'app',
  state: 'operational',
  uptime_pct: '99.985',
  avg_latency: 120,
  open_incident: false,
  ...over,
});

const incident = (over: Partial<IncidentRow> = {}): IncidentRow => ({
  id: 'i1',
  service_key: 'web',
  title: 'Slow responses',
  impact: 'minor',
  started_at: '2026-03-01T00:00:00Z',
  resolved_at: '2026-03-01T01:00:00Z',
  updates: [],
  ...over,
});

describe('uptime arithmetic', () => {
  it('computes a percentage from the checks that were recorded', () => {
    const days: DayCheck[] = [
      { day: '2026-03-01', okCount: 1440, failCount: 0 },
      { day: '2026-03-02', okCount: 1430, failCount: 10 },
    ];
    expect(uptimePercent(days)).toBe(99.65);
  });

  it('says nothing rather than claiming a hundred per cent with no data', () => {
    expect(uptimePercent([])).toBeNull();
    expect(uptimePercent([{ day: '2026-03-01', okCount: 0, failCount: 0 }])).toBeNull();
  });

  it('distinguishes a day with no checks from a day that failed', () => {
    expect(dayRatio({ day: 'd', okCount: 0, failCount: 0 })).toBeNull();
    expect(dayRatio({ day: 'd', okCount: 0, failCount: 5 })).toBe(0);
    expect(dayBand({ day: 'd', okCount: 0, failCount: 0 })).toBe('none');
    expect(dayBand({ day: 'd', okCount: 1000, failCount: 0 })).toBe('good');
    expect(dayBand({ day: 'd', okCount: 95, failCount: 5 })).toBe('partial');
    expect(dayBand({ day: 'd', okCount: 5, failCount: 95 })).toBe('bad');
  });

  it('reads a numeric that arrived as a string', () => {
    expect(uptimeOf(service())).toBeCloseTo(99.985, 3);
    expect(uptimeOf(service({ uptime_pct: 99.5 }))).toBe(99.5);
    expect(uptimeOf(service({ uptime_pct: 'not a number' }))).toBe(100);
  });
});

describe('the overall banner', () => {
  it('takes the worst state of any service', () => {
    const summaries = [
      { slug: 'a', name: 'A', state: 'operational' as const, days: [] },
      { slug: 'b', name: 'B', state: 'degraded' as const, days: [] },
      { slug: 'c', name: 'C', state: 'down' as const, days: [] },
    ];
    expect(overallState(summaries)).toBe('down');
    expect(overallState(summaries.slice(0, 2))).toBe('degraded');
    expect(overallState([])).toBe('operational');
  });

  it('puts maintenance below a degradation, because it was planned', () => {
    expect(
      overallState([
        { slug: 'a', name: 'A', state: 'maintenance', days: [] },
        { slug: 'b', name: 'B', state: 'degraded', days: [] },
      ]),
    ).toBe('degraded');
  });

  it('has wording for every state', () => {
    expect(stateLabel('operational')).toBe('All systems operational');
    expect(stateLabel('partial')).toBe('Partial outage');
    expect(stateLabel('down')).toBe('Major outage');
  });
});

describe('timelines', () => {
  const today = new Date('2026-03-10T12:00:00Z');

  it('covers the whole window, oldest day first', () => {
    const window = dayWindow(5, today);
    expect(window).toEqual(['2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10']);
  });

  it('keeps a day with no checks as a gap rather than dropping it', () => {
    const timelines = buildTimelines(
      [service()],
      [{ service_key: 'web', day: '2026-03-09', ok_count: 100, fail_count: 0 }],
      3,
      today,
    );
    expect(timelines[0]?.days).toHaveLength(3);
    expect(timelines[0]?.days.map((day) => dayBand(day))).toEqual(['none', 'good', 'none']);
  });

  it('keeps each service to its own checks', () => {
    const timelines = buildTimelines(
      [service(), service({ service_key: 'api', name: 'API' })],
      [
        { service_key: 'web', day: '2026-03-10', ok_count: 10, fail_count: 0 },
        { service_key: 'api', day: '2026-03-10', ok_count: 0, fail_count: 10 },
      ],
      1,
      today,
    );
    expect(timelines[0]?.days[0]?.okCount).toBe(10);
    expect(timelines[1]?.days[0]?.failCount).toBe(10);
  });
});

describe('incidents', () => {
  it('shows open incidents before resolved ones, newest first within each', () => {
    const rows = [
      incident({ id: 'old-resolved', started_at: '2026-01-01T00:00:00Z' }),
      incident({ id: 'open', resolved_at: null, started_at: '2026-02-01T00:00:00Z' }),
      incident({ id: 'new-resolved', started_at: '2026-03-01T00:00:00Z' }),
    ];
    expect(sortIncidents(rows).map((row) => row.id)).toEqual([
      'open',
      'new-resolved',
      'old-resolved',
    ]);
  });

  it('colours an impact the way the legend promises', () => {
    expect(impactTone('critical')).toBe('bad');
    expect(impactTone('minor')).toBe('warn');
    expect(impactTone('none')).toBe('neutral');
  });

  it('reads a duration in the units people use', () => {
    expect(formatDuration('2026-03-01T00:00:00Z', '2026-03-01T00:42:00Z')).toBe('42m');
    expect(formatDuration('2026-03-01T00:00:00Z', '2026-03-01T03:30:00Z')).toBe('3h 30m');
    expect(formatDuration('2026-03-01T00:00:00Z', '2026-03-03T06:00:00Z')).toBe('2d 6h');
    expect(formatDuration('2026-03-05T00:00:00Z', '2026-03-01T00:00:00Z')).toBe('—');
  });
});

describe('grouping', () => {
  it('keeps categories in the order the database returned them', () => {
    const grouped = byCategory([
      service({ service_key: 'web', category: 'app' }),
      service({ service_key: 'db', category: 'data' }),
      service({ service_key: 'admin', category: 'app' }),
    ]);
    expect(grouped.map((group) => group.category)).toEqual(['app', 'data']);
    expect(grouped[0]?.rows).toHaveLength(2);
  });
});
