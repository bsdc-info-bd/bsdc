import { describe, expect, it } from 'vitest';
import {
  STALE_AFTER_SECONDS,
  ageInSeconds,
  deltaArrow,
  formatValue,
  freshness,
  freshnessLabel,
  isAlarming,
  needsAttention,
  orderMetrics,
  pageFreshness,
  provenance,
  trend,
  type MetricRow,
} from './telemetry';

const NOW = new Date('2026-06-01T12:00:00Z');

function metric(over: Partial<MetricRow> = {}): MetricRow {
  return {
    key: 'audit.events_24h',
    label: 'Audit events',
    unit: 'count',
    direction: 'neutral',
    alert_above: null,
    source_table: 'audit_log',
    source_rpc: null,
    current_value: 100,
    previous_value: 90,
    delta: 10,
    measured_at: '2026-06-01T11:59:30Z',
    window_minutes: 60,
    ...over,
  };
}

describe('ageInSeconds', () => {
  it('measures from the timestamp rather than assuming now', () => {
    expect(ageInSeconds('2026-06-01T11:59:00Z', NOW)).toBe(60);
  });

  it('never returns a negative age if the clock disagrees', () => {
    expect(ageInSeconds('2026-06-01T13:00:00Z', NOW)).toBe(0);
  });

  it('returns infinity for an unparseable timestamp, so it fails towards stale', () => {
    expect(ageInSeconds('not a date', NOW)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('freshness', () => {
  it('is fresh at one second', () => {
    expect(freshness('2026-06-01T11:59:59Z', NOW).stale).toBe(false);
  });

  it('is still fresh exactly at the boundary', () => {
    const at = new Date(NOW.getTime() - STALE_AFTER_SECONDS * 1000).toISOString();
    expect(freshness(at, NOW).stale).toBe(false);
  });

  it('is stale one second past it', () => {
    const at = new Date(NOW.getTime() - (STALE_AFTER_SECONDS + 1) * 1000).toISOString();
    expect(freshness(at, NOW).stale).toBe(true);
  });

  it('is stale rather than fresh when the age cannot be read', () => {
    expect(freshness('garbage', NOW).stale).toBe(true);
  });
});

describe('freshnessLabel', () => {
  it('says just now for the first few seconds', () => {
    expect(freshnessLabel(3)).toBe('just now');
  });

  it('counts seconds, then minutes, then hours, then days', () => {
    expect(freshnessLabel(45)).toBe('45 s ago');
    expect(freshnessLabel(60)).toBe('1 min ago');
    expect(freshnessLabel(60 * 90)).toBe('1 h ago');
    expect(freshnessLabel(60 * 60 * 50)).toBe('2 days ago');
  });

  it('tells the reader what to do when the age is unknown', () => {
    expect(freshnessLabel(Number.POSITIVE_INFINITY)).toContain('treat this number as unread');
  });
});

describe('trend and deltaArrow', () => {
  it('reads direction from the sign only', () => {
    expect(trend(5)).toBe('up');
    expect(trend(-5)).toBe('down');
    expect(trend(0)).toBe('flat');
  });

  it('uses a neutral glyph for no movement rather than a dash that looks like missing data', () => {
    expect(deltaArrow(0)).toBe('·');
  });

  it('points the way the number moved', () => {
    expect(deltaArrow(3)).toBe('↑');
    expect(deltaArrow(-3)).toBe('↓');
  });
});

describe('isAlarming', () => {
  it('is false when the metric has no threshold', () => {
    expect(isAlarming(metric({ alert_above: null, current_value: 9999 }))).toBe(false);
  });

  it('compares against the metric own threshold, not a global one', () => {
    expect(isAlarming(metric({ alert_above: 0, current_value: 1 }))).toBe(true);
    expect(isAlarming(metric({ alert_above: 50, current_value: 10 }))).toBe(false);
  });

  it('is not alarming at exactly the threshold', () => {
    expect(isAlarming(metric({ alert_above: 10, current_value: 10 }))).toBe(false);
  });
});

describe('needsAttention', () => {
  it('does not raise a neutral metric that moved a lot', () => {
    expect(
      needsAttention(metric({ direction: 'neutral', current_value: 200, previous_value: 100, delta: 100 })),
    ).toBe(false);
  });

  it('raises a bad-up metric that moved by a tenth', () => {
    expect(
      needsAttention(metric({ direction: 'up_is_bad', current_value: 12, previous_value: 10, delta: 2 })),
    ).toBe(true);
  });

  it('does not raise a bad-up metric that barely moved', () => {
    expect(
      needsAttention(metric({ direction: 'up_is_bad', current_value: 1001, previous_value: 1000, delta: 1 })),
    ).toBe(false);
  });

  it('raises anything that is already alarming', () => {
    expect(needsAttention(metric({ alert_above: 0, current_value: 1, delta: 0 }))).toBe(true);
  });
});

describe('provenance', () => {
  it('names the RPC when the number is computed', () => {
    expect(provenance(metric({ source_table: null, source_rpc: 'admin_deck' }))).toBe(
      'computed by admin_deck()',
    );
  });

  it('names the table when the number is counted', () => {
    expect(provenance(metric({ source_rpc: null, source_table: 'audit_log' }))).toBe(
      'counted from audit_log',
    );
  });

  it('says so rather than inventing a source', () => {
    expect(provenance(metric({ source_table: null, source_rpc: null }))).toBe('source not recorded');
  });
});

describe('orderMetrics', () => {
  it('puts an alarming metric above one that merely moved', () => {
    const ordered = orderMetrics([
      metric({ key: 'b.moved', direction: 'up_is_bad', current_value: 12, previous_value: 10, delta: 2 }),
      metric({ key: 'a.alarm', alert_above: 0, current_value: 1 }),
    ]);
    expect(ordered.map((r) => r.key)).toEqual(['a.alarm', 'b.moved']);
  });

  it('falls back to the key so the panel does not reshuffle between reads', () => {
    const ordered = orderMetrics([metric({ key: 'z' }), metric({ key: 'a' })]);
    expect(ordered.map((r) => r.key)).toEqual(['a', 'z']);
  });

  it('does not mutate the input', () => {
    const input = [metric({ key: 'b' }), metric({ key: 'a' })];
    const copy = [...input];
    orderMetrics(input);
    expect(input).toEqual(copy);
  });
});

describe('formatValue', () => {
  it('rounds a percentage, because a console percentage is a glance', () => {
    expect(formatValue(12.6, 'percent')).toBe('13%');
  });

  it('spells out seconds', () => {
    expect(formatValue(90, 'seconds')).toBe('90 s');
  });

  it('leaves a count alone', () => {
    expect(formatValue(1234, 'count')).toBe('1234');
  });
});

describe('pageFreshness', () => {
  it('is the oldest number on the page, not the newest', () => {
    const page = pageFreshness(
      [
        metric({ measured_at: '2026-06-01T11:59:59Z' }),
        metric({ measured_at: '2026-06-01T11:50:00Z' }),
      ],
      NOW,
    );
    expect(page.seconds).toBe(600);
    expect(page.stale).toBe(true);
  });

  it('is stale when there is nothing to measure', () => {
    expect(pageFreshness([], NOW).label).toBe('nothing measured yet');
  });
});
