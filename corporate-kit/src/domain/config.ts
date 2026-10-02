/**
 * Configuration values are typed in the database. These helpers mirror
 * `bsdc.config_value_valid()` exactly so the editor can refuse a bad value
 * before a round trip, and so the error the editor shows is the same error
 * the database would have raised.
 */

export type ConfigValueType = 'string' | 'number' | 'boolean' | 'json' | 'color' | 'date';

export type ConfigEntry = {
  readonly key: string;
  readonly groupName: string;
  readonly label: string;
  readonly description: string;
  readonly valueType: ConfigValueType;
  readonly value: unknown;
  readonly minValue: number | null;
  readonly maxValue: number | null;
  readonly options: readonly string[] | null;
  readonly isPublic: boolean;
  readonly updatedAt: string;
};

const COLOR = /^#[0-9a-fA-F]{6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ValidationResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

const ok: ValidationResult = { ok: true };
const fail = (reason: string): ValidationResult => ({ ok: false, reason });

/** True when `value` satisfies everything the entry declares about itself. */
export function validateConfigValue(
  entry: Pick<ConfigEntry, 'valueType' | 'minValue' | 'maxValue' | 'options'>,
  value: unknown,
): ValidationResult {
  switch (entry.valueType) {
    case 'boolean':
      return typeof value === 'boolean' ? ok : fail('expected true or false');
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return fail('expected a number');
      if (entry.minValue !== null && value < entry.minValue) {
        return fail(`must be at least ${entry.minValue}`);
      }
      if (entry.maxValue !== null && value > entry.maxValue) {
        return fail(`must be at most ${entry.maxValue}`);
      }
      return ok;
    }
    case 'string': {
      if (typeof value !== 'string') return fail('expected text');
      if (entry.options && entry.options.length > 0 && !entry.options.includes(value)) {
        return fail(`must be one of: ${entry.options.join(', ')}`);
      }
      return ok;
    }
    case 'color':
      return typeof value === 'string' && COLOR.test(value)
        ? ok
        : fail('expected a colour like #1b4332');
    case 'date':
      return typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(value))
        ? ok
        : fail('expected a date like 2026-03-26');
    case 'json':
      return value !== null && typeof value === 'object'
        ? ok
        : fail('expected a JSON object or array');
    default:
      return fail('unknown value type');
  }
}

/**
 * Turns what the operator typed into the JSON the database expects. Returns
 * `undefined` when the text cannot become a value of that type at all, which
 * the caller reports rather than guessing.
 */
export function parseConfigInput(valueType: ConfigValueType, raw: string): unknown | undefined {
  const text = raw.trim();
  switch (valueType) {
    case 'boolean': {
      if (/^(true|yes|on|1)$/i.test(text)) return true;
      if (/^(false|no|off|0)$/i.test(text)) return false;
      return undefined;
    }
    case 'number': {
      if (text === '') return undefined;
      const n = Number(text);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'json': {
      try {
        const parsed: unknown = JSON.parse(text);
        return parsed !== null && typeof parsed === 'object' ? parsed : undefined;
      } catch {
        return undefined;
      }
    }
    default:
      return text;
  }
}

/** Human-readable rendering of a stored value, for tables and history rows. */
export function formatConfigValue(valueType: ConfigValueType, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (valueType === 'json') return JSON.stringify(value);
  if (valueType === 'boolean') return value === true ? 'on' : 'off';
  return String(value);
}

/** Groups entries for display, preserving first-seen group order. */
export function groupConfig(entries: readonly ConfigEntry[]): ReadonlyArray<{
  readonly name: string;
  readonly entries: readonly ConfigEntry[];
}> {
  const order: string[] = [];
  const buckets = new Map<string, ConfigEntry[]>();
  for (const entry of entries) {
    let bucket = buckets.get(entry.groupName);
    if (!bucket) {
      bucket = [];
      buckets.set(entry.groupName, bucket);
      order.push(entry.groupName);
    }
    bucket.push(entry);
  }
  return order.map((name) => ({ name, entries: buckets.get(name) ?? [] }));
}
