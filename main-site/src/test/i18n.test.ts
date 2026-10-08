import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/locales/en';
import { bn } from '@/i18n/locales/bn';

/**
 * Every word a member reads comes out of these two bundles, and the two
 * bundles have to hold the same words: a key that exists in English and not in
 * Bangla is a raw key on screen for half the community, and a `t('...')` call
 * with no key behind it is a raw key for everybody.
 *
 * This test reads the source the same way the bundler does — it walks `src`,
 * collects every literal key passed to `t()`, and holds it against both
 * bundles. Template keys such as `` t(`trash.kinds.${kind}`) `` cannot be
 * checked as one string, so their prefix only has to lead somewhere.
 */

const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(path) && !path.includes('.test.')) out.push(path);
  }
  return out;
}

function flatten(value: unknown, prefix = '', out = new Set<string>()): Set<string> {
  if (value === null || typeof value !== 'object') {
    out.add(prefix);
    return out;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    flatten(child, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

const enKeys = flatten(en);
const bnKeys = flatten(bn);

const literalKeys = new Map<string, string[]>();
const templatePrefixes = new Map<string, string[]>();
for (const file of walk(SRC)) {
  const source = readFileSync(file, 'utf8');
  const relative = file.slice(SRC.length + 1);

  for (const [, key] of source.matchAll(/\bt\(\s*'([A-Za-z0-9_.-]+)'/g)) {
    if (!key) continue;
    literalKeys.set(key, [...(literalKeys.get(key) ?? []), relative]);
  }
  for (const [, prefix] of source.matchAll(/\bt\(\s*`([A-Za-z0-9_.-]+?)\$\{/g)) {
    if (!prefix) continue;
    templatePrefixes.set(prefix, [...(templatePrefixes.get(prefix) ?? []), relative]);
  }
}

describe('translation bundles', () => {
  it('holds the same keys in both languages', () => {
    const missingInBangla = [...enKeys].filter((key) => !bnKeys.has(key)).sort();
    const missingInEnglish = [...bnKeys].filter((key) => !enKeys.has(key)).sort();
    expect({ missingInBangla, missingInEnglish }).toEqual({
      missingInBangla: [],
      missingInEnglish: [],
    });
  });

  it('reads the source it claims to read', () => {
    expect(enKeys.size).toBeGreaterThan(500);
    expect(literalKeys.size).toBeGreaterThan(200);
  });

  it('has a word for every literal key the app asks for', () => {
    const missing = [...literalKeys.entries()]
      .filter(([key]) => !enKeys.has(key) || !bnKeys.has(key))
      .map(([key, files]) => `${key} (${[...new Set(files)].join(', ')})`)
      .sort();
    expect(missing).toEqual([]);
  });

  it('has a word behind every template key', () => {
    const orphans = [...templatePrefixes.entries()]
      .filter(([prefix]) => ![...enKeys].some((key) => key.startsWith(prefix)))
      .map(([prefix, files]) => `${prefix} (${[...new Set(files)].join(', ')})`)
      .sort();
    expect(orphans).toEqual([]);
  });
});
