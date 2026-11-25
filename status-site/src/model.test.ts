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
  checkIsHumanEntered,
  checkProblems,
  dayWindow,
  impactTone,
  openFor,
  resolutionProblems,
  sortIncidents,
  type IncidentRow,
  type UptimeRow,
  uptimeOf,
  publicTitle,
  boardSentence,
  declareProblems,
  actionState,
  openActions,
  postmortemProblem,
  drillLabel,
  type IncidentRowV2,
  type IncidentAction,
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

describe('an incident on the board', () => {
  const incident = (overrides: Partial<IncidentRow> = {}): IncidentRow => ({
    id: 'inc-1',
    service_key: 'api',
    title: 'API is slow',
    impact: 'major',
    started_at: '2026-11-06T10:00:00.000Z',
    resolved_at: null,
    updates: [],
    ...overrides,
  });

  it('says how long an open incident has been open, in the units an operator uses', () => {
    const now = Date.parse('2026-11-06T10:45:00.000Z');
    expect(openFor(incident(), now)).toBe('45m');
    expect(openFor(incident({ started_at: '2026-11-06T07:30:00.000Z' }), now)).toBe('3h 15m');
    expect(openFor(incident({ started_at: '2026-11-04T10:00:00.000Z' }), now)).toBe('2d 0h');
  });

  it('uses a resolved incident’s own window, not the clock at the time of reading', () => {
    const resolved = incident({ resolved_at: '2026-11-06T11:30:00.000Z' });
    expect(openFor(resolved, Date.parse('2027-01-01T00:00:00.000Z'))).toBe('1h 30m');
  });

  it('refuses a closing update that says nothing, because it is published', () => {
    expect(resolutionProblems('')).toHaveLength(1);
    expect(resolutionProblems('fixed')).toHaveLength(1);
    expect(resolutionProblems('A bad deploy; rolled back and verified.')).toEqual([]);
  });

  it('treats an unreadable start as unknown rather than as zero', () => {
    expect(openFor(incident({ started_at: 'not a date' }))).toBe('unknown');
  });
});

describe('a service check', () => {
  const services = ['api', 'web', 'db'];

  it('accepts the three fields the routine actually takes', () => {
    expect(checkProblems({ serviceKey: 'api', ok: true, latencyMs: 120 }, services)).toEqual([]);
    expect(checkProblems({ serviceKey: 'api', ok: false, latencyMs: 0 }, services)).toEqual([]);
  });

  it('refuses a key the board does not know, which would be a check nobody sees', () => {
    const problems = checkProblems({ serviceKey: 'nope', ok: true, latencyMs: 100 }, services);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('nope');
  });

  it('refuses a latency that is not a plausible number of milliseconds', () => {
    expect(checkProblems({ serviceKey: 'api', ok: true, latencyMs: -1 }, services)).toHaveLength(1);
    expect(
      checkProblems({ serviceKey: 'api', ok: true, latencyMs: 120_001 }, services),
    ).toHaveLength(1);
    expect(
      checkProblems({ serviceKey: 'api', ok: true, latencyMs: Number.NaN }, services),
    ).toHaveLength(1);
  });

  it('never mistakes a hand-written check for a measurement', () => {
    // Uptime is computed from these rows. A row with no measured latency is a
    // note, not a probe, and must not be recorded as one.
    expect(checkIsHumanEntered({ serviceKey: 'api', ok: true, latencyMs: 0 })).toBe(true);
    expect(checkIsHumanEntered({ serviceKey: '', ok: true, latencyMs: 12 })).toBe(true);
    expect(checkIsHumanEntered({ serviceKey: 'api', ok: true, latencyMs: 87 })).toBe(false);
  });
});

describe('an incident that survives its own resolution (§13.2)', () => {
  const incident = (over: Partial<IncidentRowV2> = {}): IncidentRowV2 => ({
    id: 'i1',
    service_key: 'main-site',
    title: 'Cache cluster degraded (internal)',
    impact: 'major',
    started_at: '2026-11-23T09:00:00Z',
    resolved_at: null,
    updates: [],
    public_title: 'Slower pages across the site',
    public_slug: 'slower-pages-20261123',
    summary: '',
    postmortem: '',
    postmortem_at: null,
    is_drill: false,
    declared_at: '2026-11-23T09:00:00Z',
    channel_id: 'c1',
    updates_v2: [],
    ...over,
  });
  const now = new Date('2026-11-23T12:00:00Z').getTime();

  it('shows the public title, not the internal one', () => {
    expect(publicTitle(incident())).toBe('Slower pages across the site');
  });

  it('falls back to the internal title rather than showing nothing', () => {
    expect(publicTitle(incident({ public_title: '' }))).toContain('internal');
  });

  it('says what is affected and for how long, instead of "investigating"', () => {
    const sentence = boardSentence(incident(), now);
    expect(sentence).toContain('Parts of the service are unavailable');
    expect(sentence).toContain('3 hours');
    expect(sentence).not.toContain('Investing');
  });

  it('counts in days once an incident is old enough', () => {
    expect(boardSentence(incident({ started_at: '2026-11-20T09:00:00Z' }), now)).toContain('3 days');
  });

  it('says when the last update was, because silence is information', () => {
    const withUpdate = incident({ updates_v2: [{ body: 'Restarting', state: 'degraded', at: '2026-11-23T11:20:00Z' }] });
    expect(boardSentence(withUpdate, now)).toContain('40 minutes ago');
  });

  it('does not claim a customer impact for an impact of none', () => {
    expect(boardSentence(incident({ impact: 'none' }), now)).toContain('no customer impact');
  });

  it('labels a drill wherever it appears', () => {
    expect(drillLabel(incident({ is_drill: true }))).toContain('Drill');
    expect(drillLabel(incident())).toBe('');
    expect(boardSentence(incident({ is_drill: true }), now)).toContain('(drill)');
  });

  it('needs a public title and a public body before it can be declared', () => {
    const problems = declareProblems({ title: 'Cache', publicTitle: '', publicBody: 'Down' });
    expect(problems.length).toBe(2);
    expect(problems[0]).toContain('public title');
    expect(problems[1]).toContain('Investigating');
  });

  it('accepts a declaration a customer could read', () => {
    expect(
      declareProblems({
        title: 'Cache cluster degraded',
        publicTitle: 'Slower pages across the site',
        publicBody: 'Pages are taking longer than usual while we restart the cache.',
      }),
    ).toEqual([]);
  });

  const action = (over: Partial<IncidentAction> = {}): IncidentAction => ({
    id: 'a1',
    body: 'Move the cache to a managed cluster',
    owner_uid: 'u1',
    due_on: '2026-11-25',
    done_at: null,
    done_note: '',
    ...over,
  });

  it('calls an action late only after its due date has passed', () => {
    const today = new Date('2026-11-23T08:00:00Z');
    expect(actionState(action({ due_on: '2026-11-22' }), today)).toBe('late');
    expect(actionState(action({ due_on: '2026-11-23' }), today)).toBe('due');
    expect(actionState(action({ due_on: '2026-11-30' }), today)).toBe('open');
    expect(actionState(action({ done_at: '2026-11-22T00:00:00Z' }), today)).toBe('done');
  });

  it('lists what is open, soonest due first, and hides what is done', () => {
    const rows = openActions([
      action({ id: 'a', due_on: '2026-12-10' }),
      action({ id: 'b', due_on: '2026-11-24' }),
      action({ id: 'c', due_on: '2026-11-01', done_at: '2026-11-02T00:00:00Z' }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('refuses a post-mortem during the incident and one that says nothing', () => {
    expect(postmortemProblem('Long enough but too early', null)).toContain('after the incident is resolved');
    expect(postmortemProblem('It broke.', '2026-11-23T14:00:00Z')).toContain('not a post-mortem');
    expect(postmortemProblem('', '2026-11-23T14:00:00Z')).toContain('what happened');
    expect(
      postmortemProblem(
        'The cache ran on a single node since October. A config rollout doubled the key count and saturated it.',
        '2026-11-23T14:00:00Z',
      ),
    ).toBe('');
  });
});
