import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bn } from '@/i18n/locales/bn';
import { en } from '@/i18n/locales/en';
import { TRANSLATED_ERROR_KEYS, dataErrorKey } from './errors';

/**
 * A key that is not in the bundle is not a crash — the member reads the key.
 *
 * `dataErrorKey` can only return a key from its two maps, so the maps and the
 * locales are the whole surface. This walks every one of them through both
 * bundles, and it covers the keys raised by database triggers as well as the
 * codes: a refusal that arrives as a message rather than a SQLSTATE is mapped by
 * exact text, and a typo there degrades silently to "the data service could not
 * complete that request".
 */

type Node = Record<string, unknown>;

function resolve(bundle: Node, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (typeof node !== 'object' || node === null) return undefined;
    return (node as Node)[part];
  }, bundle);
}

describe('every error key resolves in both languages', () => {
  const bundles: [string, Node][] = [
    ['en', en as unknown as Node],
    ['bn', bn as unknown as Node],
  ];

  it('covers more than the two generic fallbacks', () => {
    // A map that shrank to its fallbacks would pass every other assertion here.
    expect(TRANSLATED_ERROR_KEYS.length).toBeGreaterThan(10);
  });

  for (const [locale, bundle] of bundles) {
    it(`resolves every mapped key in ${locale}`, () => {
      const missing = TRANSLATED_ERROR_KEYS.filter((key) => {
        const value = resolve(bundle, key);
        return typeof value !== 'string' || value.trim().length === 0;
      });
      expect(missing).toEqual([]);
    });
  }

  it('keeps the refusals a member can provoke out of the generic fallbacks', () => {
    // These arrived as `42501`/`23514` and were rendered as "You do not have
    // permission to do that" or "The database rejected that value" even though
    // each case has a plain explanation.
    const mapping: [string, number, string][] = [
      ['that picture was not uploaded by this member', 42501, 'media.errors.notRecorded'],
      ['comments are closed on this post', 42501, 'interactions.commentsClosed'],
      ['poll/options-locked', 23514, 'compose.errors.pollLocked'],
      ['job/already-applied', 23505, 'data.errors.alreadyApplied'],
      ['gig/already-proposed', 23505, 'data.errors.alreadyProposed'],
    ];
    for (const [message, code, key] of mapping) {
      expect(dataErrorKey({ message, code })).toBe(key);
    }
  });
});

/**
 * The edge answers with keys too.
 *
 * `functions/api/media/upload.ts` refuses a file with `media.errors.soLarge`-style
 * keys that the browser renders through the same bundle. Nothing type-checks that
 * string across the boundary, so the boundary is checked here.
 */
describe('the keys the edge sends resolve too', () => {
  const functionsRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '../../../functions');

  function edgeKeys(): string[] {
    const found = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) {
          const source = readFileSync(path, 'utf8');
          for (const match of source.matchAll(
            /'(media|auth|push|upload|data|api|profile|post|internal)\.[a-zA-Z0-9.]+'/g,
          )) {
            found.add(match[0].slice(1, -1));
          }
        }
      }
    };
    walk(functionsRoot);
    return [...found].sort();
  }

  it('every key that appears in the Functions exists in both locales', () => {
    const keys = edgeKeys();
    expect(keys.length).toBeGreaterThan(3);
    const missing = keys.filter(
      (key) =>
        typeof resolve(en as unknown as Node, key) !== 'string' ||
        typeof resolve(bn as unknown as Node, key) !== 'string',
    );
    expect(missing).toEqual([]);
  });
});
