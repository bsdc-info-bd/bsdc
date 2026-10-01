import { describe, expect, it } from 'vitest';
import { bn } from './locales/bn';
import { en } from './locales/en';

type Node = Record<string, unknown>;

function keyPaths(value: Node, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'object' && child !== null ? keyPaths(child as Node, path) : [path];
  });
}

describe('translations', () => {
  it('has identical key coverage in Bangla and English', () => {
    const enKeys = keyPaths(en as unknown as Node).sort();
    const bnKeys = keyPaths(bn as unknown as Node).sort();
    expect(bnKeys).toEqual(enKeys);
  });

  it('has no empty strings', () => {
    const values = [en, bn].flatMap((bundle) =>
      keyPaths(bundle as unknown as Node).map((path) =>
        path.split('.').reduce<unknown>((node, key) => (node as Node)[key], bundle),
      ),
    );
    expect(values.every((value) => typeof value === 'string' && value.trim().length > 0)).toBe(
      true,
    );
  });
});
