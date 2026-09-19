/**
 * BSDC — src/tests/helpers/i18n.ts
 * Purpose : Feeds i18next from the real dictionaries on disk inside component tests.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The dictionaries are the product's copy. Stubbing a handful of keys would let a test
 *   pass against strings nobody will ever read, so component tests use the same HTTP backend path
 *   the browser uses, served from public/locales.
 *   Fixtures are read at runtime and never committed; no fabricated copy lives in the repository
 *   (LAW-02).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { vi } from 'vitest';

/** Root of the shipped dictionaries. */
const localesRoot = resolve(process.cwd(), 'public/locales');

/**
 * Replaces global fetch with one that serves /locales/{lng}/{ns}.json from disk.
 * @returns void
 */
export function stubLocaleFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : 'url' in input ? input.url : String(input);
      const match = /\/locales\/(bn|en)\/([\w-]+)\.json/.exec(url);
      if (match?.[1] === undefined || match[2] === undefined) {
        return new Response('', { status: 404 });
      }
      const contents = await readFile(resolve(localesRoot, match[1], `${match[2]}.json`), 'utf8');
      return new Response(contents, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}
