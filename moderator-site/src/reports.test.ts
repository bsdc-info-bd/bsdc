import { describe, expect, it } from 'vitest';
import {
  REPORT_KINDS,
  flattenPayload,
  humanise,
  kindDescription,
  newestFirst,
  periodLabel,
  snapshotProblems,
  suggestedTitle,
  type SnapshotRow,
} from './reports';

/**
 * The report archive, pinned.
 *
 * A snapshot is evidence, so the properties being tested are about not corrupting
 * it: the payload is flattened without losing a number, a nested series is
 * summarised rather than truncated silently, an unreadable date does not reorder
 * the archive, and a title is never so short that nobody can find it again.
 */

const row = (overrides: Partial<SnapshotRow> = {}): SnapshotRow => ({
  id: 'snap-1',
  kind: 'moderation',
  title: 'Moderation report 2026-10-01 to 2026-10-30',
  period_from: '2026-10-01',
  period_to: '2026-10-30',
  created_by: 'uid-owner',
  created_at: '2026-10-31T10:00:00.000Z',
  ...overrides,
});

describe('asking for a snapshot', () => {
  it('refuses a title nobody could find again', () => {
    expect(snapshotProblems('', 30)).toHaveLength(1);
    expect(snapshotProblems('ok', 30)).toHaveLength(1);
    expect(snapshotProblems('October moderation', 30)).toEqual([]);
  });

  it('refuses a period that is not a number of days', () => {
    expect(snapshotProblems('October moderation', 0)).toHaveLength(1);
    expect(snapshotProblems('October moderation', 366)).toHaveLength(1);
    expect(snapshotProblems('October moderation', 12.5)).toHaveLength(1);
    expect(snapshotProblems('October moderation', Number.NaN)).toHaveLength(1);
    expect(snapshotProblems('October moderation', 365)).toEqual([]);
  });

  it('suggests a title that names the period, because a period is how it is found', () => {
    const title = suggestedTitle('moderation', 30, new Date('2026-11-06T12:00:00.000Z'));
    expect(title).toBe('Moderation report 2026-10-08 to 2026-11-06');
  });

  it('describes each kind, so a chooser is not four unexplained words', () => {
    for (const kind of REPORT_KINDS) {
      expect(kindDescription(kind).length).toBeGreaterThan(20);
    }
    expect(kindDescription('revenue')).toContain('commission');
    expect(kindDescription('trust')).toContain('certificate');
  });
});

describe('reading a frozen payload', () => {
  it('flattens totals into labelled rows without losing a number', () => {
    const rows = flattenPayload({
      generated_at: '2026-10-31T10:00:00.000Z',
      days: 30,
      totals: { members_total: 12480, posts_total: 3021, reports_opened: 412 },
    });
    expect(rows).toEqual([
      { label: 'Days', value: '30' },
      { label: 'Members total', value: '12,480' },
      { label: 'Posts total', value: '3,021' },
      { label: 'Reports opened', value: '412' },
    ]);
  });

  it('summarises a series rather than pretending a table cell can hold it', () => {
    const rows = flattenPayload({ series: Array.from({ length: 30 }, (_, index) => index) });
    expect(rows[0]).toEqual({ label: 'Series', value: '30 entries' });
  });

  it('renders a boolean as a word, not as true', () => {
    expect(flattenPayload({ clamped: true })[0]?.value).toBe('yes');
    expect(flattenPayload({ clamped: false })[0]?.value).toBe('no');
  });

  it('formats a fraction without inventing precision', () => {
    expect(flattenPayload({ median_hours: 3.14159 })[0]?.value).toBe('3.14');
  });

  it('returns nothing for a payload that is not an object', () => {
    expect(flattenPayload(null)).toEqual([]);
    expect(flattenPayload('nope')).toEqual([]);
    expect(flattenPayload(42)).toEqual([]);
  });

  it('skips a null rather than printing "null" in a table', () => {
    expect(flattenPayload({ a: null, b: 1 })).toEqual([{ label: 'B', value: '1' }]);
  });
});

describe('labels', () => {
  it('turns a database key into a sentence a person reads', () => {
    expect(humanise('members_period')).toBe('Members period');
    expect(humanise('median-hours')).toBe('Median hours');
    expect(humanise('')).toBe('');
  });

  it('shows a single-day period as one date, not as a range of the same date', () => {
    expect(periodLabel(row({ period_from: '2026-10-01', period_to: '2026-10-01' }))).toBe(
      '2026-10-01',
    );
    expect(periodLabel(row())).toBe('2026-10-01 → 2026-10-30');
  });
});

describe('the archive order', () => {
  it('is newest first, because that is the one being looked for', () => {
    const sorted = newestFirst([
      row({ id: 'old', created_at: '2026-01-01T00:00:00.000Z' }),
      row({ id: 'new', created_at: '2026-10-01T00:00:00.000Z' }),
      row({ id: 'mid', created_at: '2026-06-01T00:00:00.000Z' }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(['new', 'mid', 'old']);
  });

  it('does not make an unreadable date jump to the top', () => {
    const sorted = newestFirst([
      row({ id: 'broken', created_at: 'sometime' }),
      row({ id: 'real', created_at: '2026-10-01T00:00:00.000Z' }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(['broken', 'real']);
  });
});
