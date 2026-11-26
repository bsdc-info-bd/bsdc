import { describe, expect, it } from 'vitest';
import {
  MIN_SAMPLES,
  VITAL_SPECS,
  type Vital,
  bundleVerdict,
  errorUrgency,
  forecastSentence,
  formatVital,
  isTrustworthy,
  isVital,
  overallVerdicts,
  rate,
  ratingTone,
  sortErrors,
  sparkline,
  trendDirection,
  worstRoutes,
  type ErrorRow,
  type TrendPoint,
  type VitalRow,
} from '@kit';
import {
  coverageSentence,
  edgeNote,
  errorRate,
  metricFromValue,
  routesByTraffic,
  shortMessage,
  summaryCsv,
  targetLabel,
  trendBounds,
  windowLabel,
  boardSentence,
  streakLabel,
  deltaLabel,
  boardSections,
  regressionSentence,
  regressionAge,
  ackProblem,
  trendHonesty,
  type BoardRow,
} from './model';

const vital = (over: Partial<VitalRow> = {}): VitalRow => ({
  route: '/p/:slug',
  metric: 'LCP',
  samples: 240,
  p75: 2100,
  p95: 3400,
  rating: 'good',
  ...over,
});

const err = (over: Partial<ErrorRow> = {}): ErrorRow => ({
  fingerprint: 'a1',
  name: 'TypeError',
  message: 'Cannot read properties of undefined (reading "slug")',
  route: '/p/:slug',
  build: 'abc1234',
  occurrences: 10,
  first_seen: '2026-09-30T00:00:00Z',
  last_seen: '2026-10-01T00:00:00Z',
  is_resolved: false,
  ...over,
});

const day = (index: number, p75: number | null): TrendPoint => ({
  day: `2026-09-${String(index).padStart(2, '0')}`,
  samples: p75 === null ? 0 : 50,
  p75,
  mobile_p75: p75,
  desktop_p75: p75 === null ? null : p75 * 0.6,
});

describe('judging a measurement', () => {
  it('uses the published Core Web Vitals boundaries', () => {
    expect(rate('LCP', 2500)).toBe('good');
    expect(rate('LCP', 2501)).toBe('fair');
    expect(rate('LCP', 4001)).toBe('poor');
    expect(rate('CLS', 0.1)).toBe('good');
    expect(rate('CLS', 0.26)).toBe('poor');
    expect(rate('INP', 200)).toBe('good');
    expect(rate('TTFB', 801)).toBe('fair');
  });

  it('refuses to judge something it does not recognise', () => {
    expect(rate('SPEED', 10)).toBe('unknown');
    expect(rate('LCP', Number.NaN)).toBe('unknown');
    expect(isVital('LCP')).toBe(true);
    expect(isVital('lcp')).toBe(false);
    expect(ratingTone('unknown')).toBe('neutral');
  });

  it('reads a measurement the way a person says it', () => {
    expect(formatVital('LCP', 2400)).toBe('2.40 s');
    expect(formatVital('INP', 180)).toBe('180 ms');
    expect(formatVital('CLS', 0.0831)).toBe('0.083');
    expect(formatVital('LCP', null)).toBe('—');
  });

  it('states the target in the same units it prints', () => {
    expect(targetLabel('LCP')).toBe('2.50 s or better');
    expect(targetLabel('CLS')).toBe('0.100 or better');
  });
});

describe('what the numbers are allowed to claim', () => {
  it('will not call three measurements evidence', () => {
    expect(isTrustworthy(vital({ samples: MIN_SAMPLES }))).toBe(true);
    expect(isTrustworthy(vital({ samples: 3 }))).toBe(false);
    expect(worstRoutes([vital({ samples: 3, p75: 9000 })], 'LCP')).toEqual([]);
  });

  it('ranks the slowest routes that have enough samples', () => {
    const rows = [
      vital({ route: '/a', p75: 1000 }),
      vital({ route: '/b', p75: 5000 }),
      vital({ route: '/c', p75: 3000 }),
    ];
    expect(worstRoutes(rows, 'LCP', 2).map((row) => row.route)).toEqual(['/b', '/c']);
  });

  it('uses the application-wide percentile supplied by the database', () => {
    const verdicts = overallVerdicts([{ metric: 'LCP', p75: 1800, p95: 5000, samples: 1000 }]);
    const lcp = verdicts.find((verdict) => verdict.metric === 'LCP');
    expect(lcp?.p75).toBe(1800);
    expect(lcp?.rating).toBe('good');
    expect(lcp?.samples).toBe(1000);
  });

  it('flags a small sample rather than describing it as conclusive', () => {
    const [first] = overallVerdicts([{ metric: 'LCP', p75: 3000, p95: 4000, samples: 3 }]);
    expect(first?.sentence).toContain('interpret cautiously');
    expect(first?.rating).toBe('unknown');
  });

  it('says plainly when nothing was measured rather than reporting a zero', () => {
    const verdicts = overallVerdicts([]);
    expect(verdicts).toHaveLength(5);
    expect(verdicts[0]?.rating).toBe('unknown');
    expect(verdicts[0]?.sentence).toContain('No ');
    expect(verdicts[0]?.p75).toBeNull();
  });

  it('explains the verdict in words, including the target', () => {
    const [first] = overallVerdicts([vital({ p75: 5000 })]);
    expect(first?.sentence).toContain('target');
    expect(VITAL_SPECS.LCP.meaning.length).toBeGreaterThan(10);
  });
});

describe('the trend line', () => {
  const points = [day(1, 2000), day(2, 2100), day(3, null), day(4, 2200), day(5, 2300)];

  it('breaks the line on a day nobody was measured', () => {
    const path = sparkline(points, 100, 10);
    expect(path.match(/M/g)).toHaveLength(2);
    expect(path).not.toContain('NaN');
  });

  it('draws nothing when there is nothing to draw', () => {
    expect(sparkline([day(1, 2000)], 100, 10)).toBe('');
    expect(sparkline([], 100, 10)).toBe('');
  });

  it('compares the halves of the window rather than the endpoints', () => {
    const rising = [1000, 1000, 1000, 2000, 2000, 2000].map((value, index) =>
      day(index + 1, value),
    );
    expect(trendDirection(rising).change).toBeCloseTo(100, 0);
    expect(trendDirection(rising).sentence).toContain('slower');
    const falling = [2000, 2000, 2000, 1000, 1000, 1000].map((value, index) =>
      day(index + 1, value),
    );
    expect(trendDirection(falling).sentence).toContain('faster');
  });

  it('refuses to compare when there are too few days', () => {
    expect(trendDirection([day(1, 1000), day(2, 2000)]).change).toBeNull();
  });

  it('names the worst day and the ends of the window', () => {
    const bounds = trendBounds(points);
    expect(bounds.from).toBe('2026-09-01');
    expect(bounds.to).toBe('2026-09-05');
    expect(bounds.peak).toContain('2026-09-05');
  });
});

describe('the console summaries', () => {
  it('counts the measured audience', () => {
    expect(coverageSentence([])).toContain('No measurements');
    expect(coverageSentence([vital(), vital({ route: '/x', metric: 'INP' })])).toBe(
      '480 measurements across 2 routes.',
    );
  });

  it('lists routes by how much traffic they carry', () => {
    const rows = [
      vital({ route: '/a', samples: 10 }),
      vital({ route: '/b', samples: 100 }),
      vital({ route: '/a', metric: 'INP', samples: 10 }),
    ];
    expect(routesByTraffic(rows)).toEqual(['/b', '/a']);
  });

  it('writes CSV that survives a comma in a route', () => {
    const csv = summaryCsv([vital({ route: '/search?q=a,b' })]);
    expect(csv.split('\r\n')[0]).toBe('route,metric,samples,p75,p95,rating');
    expect(csv).toContain('"/search?q=a,b"');
  });

  it('names the window the way the control does', () => {
    expect(windowLabel(28)).toBe('last 28 days');
    expect(windowLabel(5)).toBe('last 5 days');
  });

  it('chooses a safe metric when the control holds something unexpected', () => {
    expect(metricFromValue('INP')).toBe('INP');
    expect(metricFromValue('')).toBe('LCP');
  });
});

describe('the edge table', () => {
  it('leads with failure, then slowness, then volume', () => {
    expect(edgeNote({ endpoint: '/api/x', calls: 10, p50: 10, p95: 20, error_rate: 2 })).toContain(
      'failing',
    );
    expect(
      edgeNote({ endpoint: '/api/x', calls: 10, p50: 10, p95: 1500, error_rate: 0 }),
    ).toContain('over a second');
    expect(
      edgeNote({ endpoint: '/api/x', calls: 20000, p50: 10, p95: 20, error_rate: 0 }),
    ).toContain('20,000 calls');
  });
});

describe('the error board', () => {
  it('ranks a fast new fault above an old grumbling one', () => {
    const now = new Date('2026-10-01T06:00:00Z');
    const fresh = err({
      fingerprint: 'new',
      occurrences: 60,
      first_seen: '2026-10-01T00:00:00Z',
      last_seen: '2026-10-01T06:00:00Z',
    });
    const old = err({
      fingerprint: 'old',
      occurrences: 500,
      first_seen: '2026-01-01T00:00:00Z',
      last_seen: '2026-09-01T00:00:00Z',
    });
    expect(errorUrgency(fresh, now)).toBeGreaterThan(errorUrgency(old, now));
    expect(sortErrors([old, fresh], now)[0]?.fingerprint).toBe('new');
  });

  it('describes a rate rather than a total where it can', () => {
    expect(errorRate(err({ occurrences: 48 }))).toBe('2.0 an hour');
    expect(errorRate(err({ occurrences: 2 }))).toBe('2.0 a day');
  });

  it('shortens a message without losing what it was', () => {
    expect(shortMessage(err())).toContain('Cannot read properties');
    expect(shortMessage(err({ message: 'x'.repeat(200) })).endsWith('…')).toBe(true);
    expect(shortMessage(err({ message: 'x'.repeat(200) })).length).toBe(80);
  });
});

describe('build weight', () => {
  it('says how much of the budget a build uses and which way it moved', () => {
    const verdict = bundleVerdict({
      recorded_at: '2026-10-01T00:00:00Z',
      commit_sha: 'abc',
      bytes_gzip: 204800,
      budget_gzip: 256000,
      delta_bytes: 2048,
    });
    expect(verdict).toContain('200.0 KB');
    expect(verdict).toContain('up 2.0 KB');
    expect(verdict).toContain('80% of the budget');
  });

  it('says so plainly when a build is over budget', () => {
    expect(
      bundleVerdict({
        recorded_at: '2026-10-01T00:00:00Z',
        commit_sha: 'abc',
        bytes_gzip: 300000,
        budget_gzip: 256000,
        delta_bytes: null,
      }),
    ).toContain('over the budget by');
  });
});

describe('capacity', () => {
  it('refuses to forecast from a fortnight of nothing', () => {
    expect(forecastSentence(null)).toContain('not enough days');
    expect(
      forecastSentence({
        days_observed: 7,
        daily_now: 10,
        daily_in_30: 20,
        growth_per_day: 1,
        correlation: 0.9,
        confidence: 'the trend is consistent',
      }),
    ).toContain('not enough days');
  });

  it('calls noise noise', () => {
    expect(
      forecastSentence({
        days_observed: 28,
        daily_now: 100,
        daily_in_30: 130,
        growth_per_day: 1,
        correlation: 0.2,
        confidence: 'there is no trend, only noise',
      }),
    ).toContain('no reliable trend');
  });

  it('projects when the trend is consistent', () => {
    const sentence = forecastSentence({
      days_observed: 28,
      daily_now: 100,
      daily_in_30: 400,
      growth_per_day: 10,
      correlation: 0.92,
      confidence: 'the trend is consistent',
    });
    expect(sentence).toContain('rising');
    expect(sentence).toContain('400 a day');
  });
});

describe('a board that leads to an action (§13.1)', () => {
  const row = (over: Partial<BoardRow> = {}): BoardRow => ({
    route: '/',
    metric: 'LCP',
    samples: 400,
    p75: 3100,
    p95: 5200,
    rating: 'over budget',
    target: 2500,
    over_budget: true,
    insufficient: false,
    streak: 1,
    build: 'b1',
    open_regression: null,
    ...over,
  });

  it('says when a metric is over but has not reached the streak', () => {
    const sentence = boardSentence(row({ streak: 1 }));
    expect(sentence).toContain('not yet an alert');
    expect(sentence).toContain('1 of the required windows');
  });

  it('says when there is an open regression, because that is a different job', () => {
    expect(boardSentence(row({ open_regression: 'r1' }))).toContain('open regression');
  });

  it('refuses to call a thin window a trend', () => {
    const sentence = boardSentence(row({ samples: 4, insufficient: true, rating: 'insufficient' }));
    expect(sentence).toContain('Too few');
    expect(sentence).not.toContain('over');
  });

  it('says plainly when a metric has no budget and is therefore unwatched', () => {
    expect(boardSentence(row({ rating: 'no budget', target: null, over_budget: false }))).toContain(
      'nothing is being watched',
    );
  });

  it('says inside budget with the number it beat', () => {
    const sentence = boardSentence(row({ over_budget: false, rating: 'within budget', p75: 900 }));
    expect(sentence).toContain('Inside its budget');
    expect(sentence).toContain('2.50 s');
  });

  it('counts down to the alert rather than saying "over"', () => {
    expect(streakLabel(row({ streak: 1 }), 3)).toBe('2 more windows');
    expect(streakLabel(row({ streak: 2 }), 3)).toBe('one more window');
    expect(streakLabel(row({ streak: 3 }), 3)).toBe('alerting');
    expect(streakLabel(row({ open_regression: 'r1', streak: 1 }), 3)).toBe('alerting');
    expect(streakLabel(row({ over_budget: false }), 3)).toBe('');
  });

  it('states the delta as a signed share of the budget', () => {
    expect(deltaLabel(row({ p75: 3100, target: 2500 }))).toBe('+24%');
    expect(deltaLabel(row({ p75: 2000, target: 2500 }))).toBe('-20%');
    expect(deltaLabel(row({ p75: 2500, target: 2500 }))).toBe('on budget');
    expect(deltaLabel(row({ target: null }))).toBe('');
  });

  it('puts alerting before approaching before blind before fine', () => {
    const sections = boardSections([
      row({ route: '/fine', over_budget: false, rating: 'within budget' }),
      row({ route: '/alert', open_regression: 'r1' }),
      row({ route: '/near' }),
      row({
        route: '/thin',
        insufficient: true,
        over_budget: false,
        samples: 3,
        rating: 'insufficient',
      }),
    ]);
    expect(sections.map((s) => s.title.split(' (')[0])).toEqual([
      'Alerting',
      'Approaching',
      'Not enough measurements',
      'Inside budget',
    ]);
  });

  it('does not invent a blind section out of routes that were never measured', () => {
    const sections = boardSections([
      row({ samples: 0, insufficient: true, over_budget: false, rating: 'insufficient' }),
    ]);
    expect(sections.some((s) => s.title.startsWith('Not enough'))).toBe(false);
  });

  it('names the release and the correlation in a regression sentence', () => {
    const sentence = regressionSentence({
      id: 'r1',
      app: 'main-site',
      route: '/shop',
      metric: 'LCP',
      target: 2500,
      observed: 3600,
      delta_share: 0.44,
      samples: 900,
      streak: 4,
      build: 'b9',
      error_fingerprint: 'fp1',
      first_seen: '',
      last_seen: '',
      acknowledged_at: null,
      ack_note: '',
    });
    expect(sentence).toContain('release b9');
    expect(sentence).toContain('+44%');
    expect(sentence).toContain('correlated');
    expect(sentence).toContain('not the same as caused');
  });

  it('does not claim a correlation when there is no error to point at', () => {
    const sentence = regressionSentence({
      id: 'r1',
      app: 'main-site',
      route: '/shop',
      metric: 'LCP',
      target: 2500,
      observed: 3600,
      delta_share: 0.44,
      samples: 900,
      streak: 4,
      build: '',
      error_fingerprint: null,
      first_seen: '',
      last_seen: '',
      acknowledged_at: null,
      ack_note: '',
    });
    expect(sentence).toContain('unrecorded release');
    expect(sentence).not.toContain('correlated');
  });

  it('says how long a regression has been open', () => {
    const now = new Date('2026-11-23T12:00:00Z');
    const base = {
      id: 'r1',
      app: 'main-site',
      route: '/',
      metric: 'LCP' as Vital,
      target: 1,
      observed: 2,
      delta_share: 1,
      samples: 1,
      streak: 1,
      build: '',
      error_fingerprint: null,
      last_seen: '',
      acknowledged_at: null,
      ack_note: '',
    };
    expect(regressionAge({ ...base, first_seen: '2026-11-23T11:30:00Z' }, now)).toBe(
      'started within the hour',
    );
    expect(regressionAge({ ...base, first_seen: '2026-11-23T06:00:00Z' }, now)).toBe(
      'open for 6 hours',
    );
    expect(regressionAge({ ...base, first_seen: '2026-11-20T12:00:00Z' }, now)).toBe(
      'open for 3 days',
    );
  });

  it('asks for a note that explains what was done, not one that dismisses it', () => {
    expect(ackProblem('')).toContain('Say what was done');
    expect(ackProblem('ok')).toContain('A few more words');
    expect(ackProblem('Reverted the image change')).toBe('');
  });

  it('states the sample floor rather than implying a trend from four points', () => {
    expect(trendHonesty(4, 30)).toContain('under the 30');
    expect(trendHonesty(0, 30)).toContain('No measurements');
    expect(trendHonesty(120, 30)).toBe('');
  });
});
