import { describe, expect, it } from 'vitest';
import {
  formatConfigValue,
  groupConfig,
  parseConfigInput,
  validateConfigValue,
  type ConfigEntry,
} from '@kit';
import {
  MIN_REASON,
  describeBlastRadius,
  describeChange,
  editableText,
  feedWeightDrift,
  plannedRoute,
  provenanceOf,
  reasonProblems,
  routeSummary,
  secretState,
  stagedState,
  toEntry,
  type ConfigRow,
  type ConsoleRow,
  type StagedRow,
} from './model';

const row = (over: Partial<ConfigRow> = {}): ConfigRow => ({
  key: 'market.commission_bps',
  value: 500,
  value_type: 'number',
  group_name: 'market',
  label: 'Default commission (bps)',
  help: 'Applied to new shops.',
  min_value: '0',
  max_value: '3000',
  options: [],
  is_public: false,
  updated_at: '2026-03-01T10:00:00Z',
  ...over,
});

const entry = (over: Partial<ConfigEntry> = {}): ConfigEntry => ({ ...toEntry(row()), ...over });

describe('reading configuration rows', () => {
  it('turns PostgREST numeric strings into numbers', () => {
    const mapped = toEntry(row());
    expect(mapped.minValue).toBe(0);
    expect(mapped.maxValue).toBe(3000);
  });

  it('treats an empty options array as no choice list at all', () => {
    expect(toEntry(row()).options).toBeNull();
    expect(toEntry(row({ options: ['bn', 'en'] })).options).toEqual(['bn', 'en']);
  });

  it('falls back to the key when a row has no label', () => {
    expect(toEntry(row({ label: '' })).label).toBe('market.commission_bps');
  });

  it('pretty-prints json for editing but leaves scalars alone', () => {
    expect(editableText(entry())).toBe('500');
    expect(editableText(entry({ valueType: 'json', value: { a: 1 } }))).toBe('{\n  "a": 1\n}');
  });
});

describe('validation matches what the database would accept', () => {
  it('refuses a number outside the declared bounds', () => {
    expect(validateConfigValue(entry(), 500).ok).toBe(true);
    expect(validateConfigValue(entry(), 4000)).toEqual({
      ok: false,
      reason: 'must be at most 3000',
    });
    expect(validateConfigValue(entry(), -1)).toEqual({ ok: false, reason: 'must be at least 0' });
  });

  it('refuses a string where a number belongs instead of coercing it', () => {
    expect(validateConfigValue(entry(), '500').ok).toBe(false);
  });

  it('holds options to the declared list', () => {
    const language = entry({
      valueType: 'string',
      options: ['bn', 'en'],
      minValue: null,
      maxValue: null,
    });
    expect(validateConfigValue(language, 'bn').ok).toBe(true);
    expect(validateConfigValue(language, 'fr')).toEqual({
      ok: false,
      reason: 'must be one of: bn, en',
    });
  });

  it('checks colours and dates by shape', () => {
    const colour = entry({ valueType: 'color' });
    expect(validateConfigValue(colour, '#1b4332').ok).toBe(true);
    expect(validateConfigValue(colour, '1b4332').ok).toBe(false);
    const date = entry({ valueType: 'date' });
    expect(validateConfigValue(date, '2026-03-26').ok).toBe(true);
    expect(validateConfigValue(date, '26-03-2026').ok).toBe(false);
    expect(validateConfigValue(date, '2026-13-45').ok).toBe(false);
  });

  it('accepts only objects and arrays as json', () => {
    const json = entry({ valueType: 'json' });
    expect(validateConfigValue(json, { weights: [1] }).ok).toBe(true);
    expect(validateConfigValue(json, 'text').ok).toBe(false);
  });
});

describe('parsing what an operator typed', () => {
  it('reads the words people actually type for a switch', () => {
    expect(parseConfigInput('boolean', 'Yes')).toBe(true);
    expect(parseConfigInput('boolean', 'off')).toBe(false);
    expect(parseConfigInput('boolean', 'maybe')).toBeUndefined();
  });

  it('rejects a number that is not one', () => {
    expect(parseConfigInput('number', ' 42 ')).toBe(42);
    expect(parseConfigInput('number', '')).toBeUndefined();
    expect(parseConfigInput('number', '4b')).toBeUndefined();
  });

  it('rejects json that parses to a scalar', () => {
    expect(parseConfigInput('json', '{"a":1}')).toEqual({ a: 1 });
    expect(parseConfigInput('json', '7')).toBeUndefined();
    expect(parseConfigInput('json', '{broken')).toBeUndefined();
  });
});

describe('presenting values and changes', () => {
  it('renders a switch as on or off rather than as true or false', () => {
    expect(formatConfigValue('boolean', true)).toBe('on');
    expect(formatConfigValue('number', 500)).toBe('500');
    expect(formatConfigValue('json', { a: 1 })).toBe('{"a":1}');
  });

  it('describes a first value differently from a change', () => {
    const base = { id: 1, changed_by: 'uid', changed_at: '2026-03-01T00:00:00Z' };
    expect(describeChange('number', { ...base, old_value: null, new_value: 500 })).toBe(
      'set to 500',
    );
    expect(describeChange('number', { ...base, old_value: 500, new_value: 400 })).toBe(
      'changed from 500 to 400',
    );
    expect(describeChange('number', { ...base, old_value: 500, new_value: 500 })).toBe(
      'rewritten with the same value, 500',
    );
  });

  it('keeps groups in the order they first appear', () => {
    const grouped = groupConfig([
      entry({ key: 'a', groupName: 'ops' }),
      entry({ key: 'b', groupName: 'feed' }),
      entry({ key: 'c', groupName: 'ops' }),
    ]);
    expect(grouped.map((group) => group.name)).toEqual(['ops', 'feed']);
    expect(grouped[0]?.entries).toHaveLength(2);
  });

  it('reports how far the feed weights are from one', () => {
    const weights = [
      entry({ key: 'feed.recency_weight', value: 0.35 }),
      entry({ key: 'feed.affinity_weight', value: 0.35 }),
      entry({ key: 'feed.quality_weight', value: 0.3 }),
    ];
    expect(feedWeightDrift(weights)).toBe(0);
    expect(feedWeightDrift([...weights, entry({ key: 'feed.extra_weight', value: 0.1 })])).toBe(
      0.1,
    );
    expect(feedWeightDrift([entry({ key: 'ops.maintenance', value: false })])).toBeNull();
  });
});

const consoleRow = (over: Partial<ConsoleRow> = {}): ConsoleRow => ({
  ...row(),
  is_secret: false,
  secret_is_set: false,
  secret_set_at: null,
  secret_rotated_at: null,
  source: 'default',
  owner_area: 'market',
  requires_approval: false,
  reader_count: null,
  removal_proposed: false,
  updated_by: null,
  ...over,
});

describe('provenance (§12.1)', () => {
  it('tells a shipped value from a chosen one', () => {
    expect(provenanceOf(consoleRow({ source: 'default' })).chosen).toBe(false);
    expect(provenanceOf(consoleRow({ source: 'database' })).chosen).toBe(true);
  });

  it('names the person who set it, when it knows', () => {
    expect(provenanceOf(consoleRow({ source: 'database', updated_by: 'ops-1' })).detail).toContain(
      'ops-1',
    );
  });

  it('does not claim an operator set a value that came from the deploy', () => {
    const p = provenanceOf(consoleRow({ source: 'environment' }));
    expect(p.chosen).toBe(false);
    expect(p.detail).toContain('next deploy');
  });

  it('warns that an override beats the editor', () => {
    expect(provenanceOf(consoleRow({ source: 'override' })).detail).toContain('will not survive');
  });

  it('says "never changed" rather than "default", which means nothing to a person', () => {
    expect(provenanceOf(consoleRow({ source: 'default' })).label).toBe('Never changed');
  });
});

describe('blast radius (§12.1)', () => {
  it('counts the readers by kind, in one sentence', () => {
    const b = describeBlastRadius([
      { reader: 'cache', kind: 'edge', note: '' },
      { reader: 'dashboard', kind: 'screen', note: '' },
      { reader: 'purge', kind: 'job', note: '' },
    ]);
    expect(b.count).toBe(3);
    expect(b.sentence).toContain('3 things');
    expect(b.sentence).toContain('1 edge worker');
    expect(b.sentence).toContain('1 screen');
  });

  it('pluralises a kind that has more than one reader', () => {
    const b = describeBlastRadius([
      { reader: 'a', kind: 'screen', note: '' },
      { reader: 'b', kind: 'screen', note: '' },
    ]);
    expect(b.sentence).toContain('2 screens');
  });

  it('flags a setting nobody reads instead of calling it safe to delete', () => {
    const b = describeBlastRadius([]);
    expect(b.orphan).toBe(true);
    expect(b.sentence).toContain('Nothing reads');
    // It says "proposed for removal", not "deleted", because a missing reader and
    // an unmapped reader look the same.
    expect(b.sentence).toContain('proposed');
  });
});

describe('secrets are write-only (§12.1)', () => {
  it('says when nothing is set', () => {
    expect(secretState(consoleRow()).isSet).toBe(false);
    expect(secretState(consoleRow()).summary).toContain('No secret');
  });

  it('reports the age from the rotation, not from the first set', () => {
    const now = new Date('2026-11-23T00:00:00Z');
    const s = secretState(
      consoleRow({
        is_secret: true,
        secret_is_set: true,
        secret_set_at: '2026-01-01T00:00:00Z',
        secret_rotated_at: '2026-11-20T00:00:00Z',
      }),
      now,
    );
    expect(s.ageDays).toBe(3);
    expect(s.rotationDue).toBe(false);
  });

  it('proposes rotation after ninety days', () => {
    const now = new Date('2026-11-23T00:00:00Z');
    const s = secretState(
      consoleRow({ is_secret: true, secret_is_set: true, secret_set_at: '2026-08-01T00:00:00Z' }),
      now,
    );
    expect(s.rotationDue).toBe(true);
    expect(s.ageDays).toBeGreaterThanOrEqual(90);
  });

  it('falls back to the set date when a secret has never been rotated', () => {
    const now = new Date('2026-11-23T00:00:00Z');
    const s = secretState(
      consoleRow({ is_secret: true, secret_is_set: true, secret_set_at: '2026-11-22T00:00:00Z' }),
      now,
    );
    expect(s.ageDays).toBe(1);
    expect(s.summary).toContain('yesterday');
  });

  it('does not silently claim a fresh secret when the date is unreadable', () => {
    const s = secretState(consoleRow({ is_secret: true, secret_is_set: true, secret_set_at: 'nonsense' }));
    expect(s.rotationDue).toBe(false);
    expect(s.summary).toContain('could not be read');
  });

  it('never puts a value in the summary, because there is none to put', () => {
    const s = secretState(
      consoleRow({ is_secret: true, secret_is_set: true, secret_set_at: '2026-11-01T00:00:00Z' }),
    );
    expect(s.summary).not.toMatch(/sk_|password|token/i);
  });
});

describe('which route a save takes (§12.1)', () => {
  it('stages a production setting even when a time was given', () => {
    expect(plannedRoute(consoleRow({ requires_approval: true }), '2026-12-01T10:00')).toBe('staged');
  });

  it('schedules a change with a future time', () => {
    expect(plannedRoute(consoleRow(), '2026-12-01T10:00')).toBe('scheduled');
  });

  it('applies immediately with neither', () => {
    expect(plannedRoute(consoleRow(), '')).toBe('direct');
  });

  it('says a staged change does not move the live value', () => {
    expect(routeSummary('staged', consoleRow({ requires_approval: true }))).toContain(
      'does not move',
    );
  });

  it('warns that a secret is replaced rather than versioned', () => {
    expect(routeSummary('direct', consoleRow({ is_secret: true }))).toContain('not kept');
  });

  it('promises a scheduled change can be cancelled', () => {
    expect(routeSummary('scheduled', consoleRow())).toContain('cancelled');
  });
});

describe('the reason floor', () => {
  it('is the kit policy, not a local copy with a different minimum', () => {
    expect(MIN_REASON).toBe(12);
    expect(reasonProblems('x'.repeat(MIN_REASON - 1))).toHaveLength(1);
    expect(reasonProblems('Raised after the cache started missing')).toEqual([]);
  });

  it('rejects a placeholder even when it is long enough', () => {
    // "test" is four characters short of the floor but the real problem is that it
    // names nothing, and a console that said "type more characters" would teach an
    // operator to write "test test test".
    const problems = reasonProblems('test');
    expect(problems[0]?.kind).toBe('placeholder');
  });

  it('rejects a reason that only restates the action', () => {
    expect(reasonProblems('fixed').length).toBeGreaterThan(0);
  });
});

describe('a staged change (§12.1)', () => {
  const staged = (over: Partial<StagedRow> = {}): StagedRow => ({
    id: 's1',
    key: 'site.rollout',
    proposed_value: true,
    reason: 'Turning on the new checkout',
    status: 'pending',
    apply_at: null,
    proposed_by: 'uid-a',
    proposed_at: '2026-11-01T00:00:00Z',
    decided_by: null,
    decided_at: null,
    decision_note: '',
    ...over,
  });

  it('tells the proposer they cannot approve their own change', () => {
    const s = stagedState(staged(), 'uid-a');
    expect(s.needsApprovalFrom).toBe('anybody-else');
    expect(s.sentence).toContain('cannot');
  });

  it('tells a second person that they can', () => {
    expect(stagedState(staged(), 'uid-b').sentence).toContain('You can approve');
  });

  it('does not ask for approval of a scheduled change', () => {
    const s = stagedState(staged({ apply_at: '2026-12-01T10:00:00Z' }), 'uid-b');
    expect(s.needsApprovalFrom).toBe('nobody');
    expect(s.sentence).toContain('Scheduled');
  });

  it('reports a decided change as decided, not as waiting', () => {
    const s = stagedState(staged({ status: 'rejected' }), 'uid-b');
    expect(s.waiting).toBe(false);
    expect(s.sentence).toContain('rejected');
  });
});
