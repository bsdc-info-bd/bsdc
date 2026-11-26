import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FRESHNESS,
  RELAXED_FRESHNESS,
  ageOf,
  bandOf,
  describeAge,
  freshnessNotice,
  freshnessOf,
  refreshIntervalFor,
} from './freshness';

const NOW = 1_800_000_000_000;

describe('ageOf', () => {
  it('measures the gap between a reading and now', () => {
    expect(ageOf(NOW - 4_000, NOW)).toBe(4_000);
  });

  it('accepts a Date as readily as a number', () => {
    expect(ageOf(new Date(NOW - 1_000), NOW)).toBe(1_000);
  });

  it('never reports a negative age', () => {
    // A server a few seconds ahead produces a reading "from the future". That
    // is normal and must read as zero, not as a negative number a human sees.
    expect(ageOf(NOW + 3_000, NOW)).toBe(0);
  });

  it('returns null rather than zero when the timestamp is missing', () => {
    // Zero would claim "just now", which is the one wrong answer here.
    expect(ageOf(null, NOW)).toBeNull();
    expect(ageOf(undefined, NOW)).toBeNull();
    expect(ageOf(Number.NaN, NOW)).toBeNull();
  });
});

describe('freshnessOf', () => {
  it('calls a thirty-second-old reading live', () => {
    const got = freshnessOf(NOW - 30_000, NOW);
    expect(got.band).toBe('live');
    expect(got.skewed).toBe(false);
  });

  it('walks the bands in order as a reading ages', () => {
    expect(freshnessOf(NOW - 10_000, NOW).band).toBe('live');
    expect(freshnessOf(NOW - 4 * 60_000, NOW).band).toBe('fresh');
    expect(freshnessOf(NOW - 20 * 60_000, NOW).band).toBe('aging');
    expect(freshnessOf(NOW - 3 * 60 * 60_000, NOW).band).toBe('stale');
  });

  it('honours the policy it is handed', () => {
    // Ten minutes is aging for a queue and merely fresh for a report: the same
    // age is a different statement depending on what is being read.
    const age = 10 * 60_000;
    expect(freshnessOf(NOW - age, NOW, DEFAULT_FRESHNESS).band).toBe('aging');
    expect(freshnessOf(NOW - age, NOW, RELAXED_FRESHNESS).band).toBe('fresh');
  });

  it('treats a slightly-ahead timestamp as zero rather than as an error', () => {
    const got = freshnessOf(NOW + 5_000, NOW);
    expect(got.band).toBe('live');
    expect(got.skewed).toBe(false);
  });

  it('refuses to call a badly-skewed timestamp fresh', () => {
    // Ten minutes in the future means one of the clocks is wrong. Saying "live"
    // would hide that; saying "unknown" makes the operator refresh.
    const got = freshnessOf(NOW + 10 * 60_000, NOW);
    expect(got.band).toBe('unknown');
    expect(got.skewed).toBe(true);
  });

  it('treats a missing timestamp as unknown, never as live', () => {
    expect(freshnessOf(null, NOW).band).toBe('unknown');
  });
});

describe('bandOf', () => {
  it('is inclusive at each boundary', () => {
    expect(bandOf(30_000)).toBe('live');
    expect(bandOf(30_001)).toBe('fresh');
    expect(bandOf(5 * 60_000)).toBe('fresh');
    expect(bandOf(5 * 60_000 + 1)).toBe('aging');
    expect(bandOf(30 * 60_000)).toBe('aging');
    expect(bandOf(30 * 60_000 + 1)).toBe('stale');
  });

  it('reports unknown for an impossible age', () => {
    expect(bandOf(-1)).toBe('unknown');
    expect(bandOf(Number.NaN)).toBe('unknown');
  });
});

describe('describeAge', () => {
  it('rounds to the coarsest honest unit', () => {
    expect(describeAge(1_000)).toBe('just now');
    expect(describeAge(42_000)).toBe('42s ago');
    expect(describeAge(60_000)).toBe('1 min ago');
    expect(describeAge(9 * 60_000)).toBe('9 min ago');
    expect(describeAge(3_600_000)).toBe('1 hour ago');
    expect(describeAge(5 * 3_600_000)).toBe('5 hours ago');
    expect(describeAge(86_400_000)).toBe('yesterday');
    expect(describeAge(4 * 86_400_000)).toBe('4 days ago');
    expect(describeAge(60 * 86_400_000)).toBe('2 months ago');
    expect(describeAge(800 * 86_400_000)).toBe('2 years ago');
  });

  it('never renders a number for an unknown age', () => {
    expect(describeAge(null)).toBe('at an unknown time');
    expect(describeAge(Number.NaN)).toBe('at an unknown time');
    expect(describeAge(-5)).toBe('at an unknown time');
  });
});

describe('freshnessNotice', () => {
  it('says nothing while a reading is fresh', () => {
    expect(freshnessNotice(freshnessOf(NOW - 1_000, NOW))).toBeNull();
    expect(freshnessNotice(freshnessOf(NOW - 60_000, NOW))).toBeNull();
  });

  it('asks for a refresh once a reading is aging', () => {
    const notice = freshnessNotice(freshnessOf(NOW - 20 * 60_000, NOW));
    expect(notice).toContain('20 min ago');
    expect(notice).toContain('Refresh before acting');
  });

  it('warns about a decision when a reading is stale', () => {
    const notice = freshnessNotice(freshnessOf(NOW - 3 * 3_600_000, NOW));
    expect(notice).toContain('3 hours ago');
    expect(notice).toContain('may no longer be correct');
  });

  it('explains a skewed clock instead of guessing', () => {
    const notice = freshnessNotice(freshnessOf(NOW + 30 * 60_000, NOW));
    expect(notice).toContain('ahead of your clock');
  });
});

describe('refreshIntervalFor', () => {
  it('polls at half the live window', () => {
    expect(refreshIntervalFor({ liveMs: 60_000, freshMs: 1, agingMs: 2 })).toBe(30_000);
  });

  it('clamps to a sane floor and ceiling', () => {
    expect(refreshIntervalFor({ liveMs: 1_000, freshMs: 1, agingMs: 2 })).toBe(5_000);
    expect(refreshIntervalFor({ liveMs: 10 * 60_000, freshMs: 1, agingMs: 2 })).toBe(120_000);
  });

  it('returns null when a panel must not poll', () => {
    expect(refreshIntervalFor(DEFAULT_FRESHNESS, { poll: false })).toBeNull();
    expect(refreshIntervalFor({ liveMs: 0, freshMs: 0, agingMs: 0 })).toBeNull();
  });
});
