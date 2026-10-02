import { describe, expect, it } from 'vitest';
import {
  formatConfigValue,
  groupConfig,
  parseConfigInput,
  validateConfigValue,
  type ConfigEntry,
} from '@kit';
import { describeChange, editableText, feedWeightDrift, toEntry, type ConfigRow } from './model';

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
