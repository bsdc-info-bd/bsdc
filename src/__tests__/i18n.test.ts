import { describe, expect, it } from 'vitest';
import bn from '@/i18n/locales/bn.json';
import en from '@/i18n/locales/en.json';

/**
 * §14.7 — Bangla and English are co-equal. Every key present in the
 * English bundle must exist in Bangla and vice versa, and no value may be
 * empty. This is the automated half; render tests cover actual display.
 */

type Json = Record<string, unknown>;

function keyPaths(obj: Json, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') return keyPaths(value as Json, path);
    return [path];
  });
}

function nonEmptyPaths(obj: Json): string[] {
  return keyPaths(obj).filter((path) => {
    const value = path.split('.').reduce<unknown>((acc, k) => {
      if (acc && typeof acc === 'object') return (acc as Json)[k];
      return undefined;
    }, obj);
    return typeof value === 'string' && value.trim().length > 0;
  });
}

describe('i18n bundles', () => {
  it('has complete key parity between English and Bangla', () => {
    const enKeys = keyPaths(en).sort();
    const bnKeys = keyPaths(bn).sort();
    expect(bnKeys).toEqual(enKeys);
  });

  it('has no empty strings in either bundle', () => {
    expect(nonEmptyPaths(en).sort()).toEqual(keyPaths(en).sort());
    expect(nonEmptyPaths(bn).sort()).toEqual(keyPaths(bn).sort());
  });
});
