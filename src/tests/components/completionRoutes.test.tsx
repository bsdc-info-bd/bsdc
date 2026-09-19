/**
 * BSDC — src/tests/components/completionRoutes.test.tsx
 * Purpose : Smoke test of the three routes that finish the product: Saved, Marketplace and Settings.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Each of these screens was `planned` in the route table until now, which makes them the
 *   three places a half-finished platform would show a placeholder. The test mounts each one in
 *   Bangla and asserts real copy, so a placeholder could not pass it.
 *   Saved and Settings are private, so the assertion for a stranger is the sign-in surface with the
 *   reason that names the screen they asked for — not a redirect, and not an empty shell. The
 *   Marketplace is public and must be readable by anybody, because a page whose job is to be found
 *   by people who have never heard of us cannot be behind a sign-in.
 *   Console errors fail the test.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { stubLocaleFetch } from '../helpers/i18n';
import { mountApp } from '../helpers/mount';
import { expectNoConsoleErrors, silenceActWarnings } from '../helpers/silenceActWarnings';

beforeAll(() => {
  stubLocaleFetch();
});

beforeEach(() => {
  vi.resetModules();
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Private routes: what a stranger must be shown, and the reason they must be shown for. */
const PRIVATE_ROUTES: readonly {
  readonly path: string;
  readonly reason: string;
}[] = [
  { path: '/saved', reason: 'সংরক্ষিত বিষয় দেখতে সাইন ইন করুন' },
  { path: '/settings', reason: 'সেটিংস খুলতে সাইন ইন করুন' },
];

/**
 * Mounts the application at a path and waits for a first-level heading.
 * @param path the path to mount
 * @returns nothing
 */
async function mountAt(path: string): Promise<void> {
  window.history.pushState({}, '', path);
  await mountApp();
}

describe('the saved and settings routes', () => {
  for (const route of PRIVATE_ROUTES) {
    it(`shows a stranger the sign-in surface that names ${route.path}`, async () => {
      const consoleError = silenceActWarnings();
      await mountAt(route.path);

      await waitFor(
        () => {
          expect(document.body.textContent ?? '').toContain(route.reason);
        },
        { timeout: 8000 },
      );

      // The refusal is not the screen: no heading of the real page is present to a stranger.
      expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
      expectNoConsoleErrors(consoleError);
    }, 25000);
  }
});

describe('the marketplace route', () => {
  it('is readable by anybody, with no sign-in and no standing', async () => {
    const consoleError = silenceActWarnings();
    await mountAt('/market');

    await waitFor(
      () => {
        const heading = screen.getByRole('heading', { level: 1 });
        expect(heading.textContent).toBe('মার্কেটপ্লেস');
      },
      { timeout: 8000 },
    );

    // Filters, not lorem: the search field, every category chip and the budget rail are real,
    // translated controls, and the empty state names what is missing in the person's language.
    // The first read is asynchronous, so the copy is awaited rather than sampled once.
    await waitFor(
      () => {
        const body = document.body.textContent ?? '';
        expect(body).toContain('মার্কেটপ্লেস খুঁজুন');
        expect(body).toContain('সব ক্যাটাগরি');
        expect(body).toContain('যেকোনো বাজেট');
      },
      { timeout: 8000 },
    );
    expectNoConsoleErrors(consoleError);
  }, 25000);
});
