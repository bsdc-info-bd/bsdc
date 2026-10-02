import { formatConfigValue, type ConfigEntry, type ConfigValueType } from '@kit';

/** The shape `site_config_list()` returns, before it is given better names. */
export type ConfigRow = {
  readonly key: string;
  readonly value: unknown;
  readonly value_type: ConfigValueType;
  readonly group_name: string;
  readonly label: string;
  readonly help: string;
  readonly min_value: number | string | null;
  readonly max_value: number | string | null;
  readonly options: readonly string[] | null;
  readonly is_public: boolean;
  readonly updated_at: string;
};

/** Numerics arrive from PostgREST as strings; a bound is a number or absent. */
function bound(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toEntry(row: ConfigRow): ConfigEntry {
  return {
    key: row.key,
    groupName: row.group_name,
    label: row.label === '' ? row.key : row.label,
    description: row.help,
    valueType: row.value_type,
    value: row.value,
    minValue: bound(row.min_value),
    maxValue: bound(row.max_value),
    options: row.options && row.options.length > 0 ? row.options : null,
    isPublic: row.is_public,
    updatedAt: row.updated_at,
  };
}

/** What the editor should start with in the text box for an entry. */
export function editableText(entry: ConfigEntry): string {
  if (entry.valueType === 'json') return JSON.stringify(entry.value, null, 2);
  if (entry.value === null || entry.value === undefined) return '';
  return String(entry.value);
}

export type HistoryRow = {
  readonly id: number;
  readonly old_value: unknown;
  readonly new_value: unknown;
  readonly changed_by: string | null;
  readonly changed_at: string;
};

/**
 * One line describing a change, used in the history list. A first-ever value
 * is described as such rather than as a change from nothing, because "set to
 * 500" and "changed from nothing to 500" are different events.
 */
export function describeChange(valueType: ConfigValueType, row: HistoryRow): string {
  const next = formatConfigValue(valueType, row.new_value);
  if (row.old_value === null || row.old_value === undefined) return `set to ${next}`;
  const previous = formatConfigValue(valueType, row.old_value);
  if (previous === next) return `rewritten with the same value, ${next}`;
  return `changed from ${previous} to ${next}`;
}

/** The three feed weights are meant to add up to one; this reports the drift. */
export function feedWeightDrift(entries: readonly ConfigEntry[]): number | null {
  const weights = entries.filter(
    (entry) => entry.key.startsWith('feed.') && entry.key.endsWith('_weight'),
  );
  if (weights.length === 0) return null;
  const total = weights.reduce(
    (sum, entry) => sum + (typeof entry.value === 'number' ? entry.value : 0),
    0,
  );
  return Math.round((total - 1) * 1000) / 1000;
}
