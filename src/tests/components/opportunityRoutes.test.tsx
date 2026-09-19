/**
 * BSDC — src/tests/components/opportunityRoutes.test.tsx
 * Purpose : Smoke test of the opportunity routes: every new screen mounts, in Bangla, without a
 *           console error and with its dictionaries fully loaded.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : This test exists because the failure it catches is the one that would otherwise reach
 *   production: a screen that renders `<h1>{t('jobs.title')}</h1>` as the literal key because a
 *   namespace was declared in the provider but never shipped to /locales. Loading the dictionaries
 *   from disk the way the browser does is what makes the assertion worth anything.
 *   Console errors fail the test. "No console errors" is a product requirement, not an aspiration.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';

const localesRoot = resolve(process.cwd(), 'public/locales');

beforeAll(() => {
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
});

beforeEach(() => {
  // The router is built at module scope, so the module has to be re-imported for each path.
  vi.resetModules();
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Routes that must mount for a visitor who is not signed in. */
const PUBLIC_ROUTES: readonly { readonly path: string; readonly heading: string }[] = [
  { path: '/search', heading: 'খুঁজুন' },
  { path: '/events', heading: 'ইভেন্ট' },
  { path: '/jobs', heading: 'চাকরি' },
  { path: '/projects', heading: 'প্রকল্প' },
  { path: '/freelancer', heading: 'ফ্রিল্যান্স হাব' },
  { path: '/leaderboard', heading: 'লিডারবোর্ড' },
  { path: '/stories', heading: 'স্টোরি' },
];

describe('opportunity routes', () => {
  for (const route of PUBLIC_ROUTES) {
    it(`mounts ${route.path} in Bangla with its dictionaries loaded`, async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation((): void => undefined);
      window.history.pushState({}, '', route.path);
      const { App } = await import('@/app/App');

      // Rendering inside an async act lets the lazy route chunk resolve while React is still
      // watching, which is what a browser does when it fetches a chunk. Rendering outside act and
      // waiting afterwards leaves the resolution to land between two tests, where React warns
      // about it and the warning lands on whichever test happens to be running.
      await act(async () => {
        render(
          <Suspense fallback={null}>
            <App />
          </Suspense>,
        );
      });

      await waitFor(
        () => {
          const heading = screen.getByRole('heading', { level: 1 });
          expect(heading.textContent).toBe(route.heading);
        },
        { timeout: 8000 },
      );

      // A lazy route chunk resolves on a microtask. Flushing it inside act means React sees the
      // update during the test rather than after it, which is both what a browser does and what
      // keeps the console clean; an act warning is otherwise a test artefact that fails a test
      // for a reason that has nothing to do with the screen under test.
      await act(async () => {
        await new Promise((done) => {
          setTimeout(done, 0);
        });
      });

      // A missing namespace renders the raw key, which always contains a dot or an underscore.
      expect(document.body.textContent ?? '').not.toMatch(
        /\b(jobs|events|projects|freelancer|gamification|search|stories)\.[a-zA-Z]/,
      );
      expect(consoleError).not.toHaveBeenCalled();
      consoleError.mockRestore();
    }, 25000);
  }
});
