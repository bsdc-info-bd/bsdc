/**
 * BSDC — src/tests/components/adminRoutes.test.tsx
 * Purpose : Smoke test of the administration and verification routes: every screen mounts, in
 *           Bangla, with its dictionaries loaded and without a console error.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The administration screens are the ones a signed-out visitor must never see the contents
 *   of, so the test asserts two things at once: that the screen mounts at all, and that what it
 *   shows a stranger is the refusal, not the register. The verification screen is the opposite case
 *   and is asserted to be readable by anybody, because a verification page behind a sign-in would
 *   verify nothing for the person holding the printed document.
 *   Console errors fail the test. jsPDF is never imported on these routes, which is the whole point
 *   of the dynamic import inside the report composer.
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
  // The router is built at module scope, so the module has to be re-imported for each path.
  vi.resetModules();
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Routes that must mount for a visitor who is not signed in, with the heading they must show. */
const ROUTES: readonly {
  readonly path: string;
  readonly heading: string;
  /** Copy that must be visible to a stranger on this route. */
  readonly visible: string;
}[] = [
  { path: '/admin', heading: 'প্রশাসন', visible: 'কেবল প্রশাসকদের জন্য' },
  { path: '/admin/features', heading: 'ফিচার রেজিস্টার', visible: 'কেবল প্রশাসকদের জন্য' },
  { path: '/admin/roles', heading: 'ভূমিকা ও মর্যাদা', visible: 'কেবল প্রশাসকদের জন্য' },
  { path: '/admin/audit', heading: 'অডিট ট্রেইল', visible: 'কেবল প্রশাসকদের জন্য' },
  { path: '/reports', heading: 'প্রতিবেদন', visible: 'কেবল প্রশাসকদের জন্য' },
  {
    path: '/admin/recovery',
    heading: 'রিকভারি বিন',
    visible: 'বিন খালি। ফেরত আনার মতো কিছু নেই।',
  },
];

describe('administration routes', () => {
  for (const route of ROUTES) {
    it(`mounts ${route.path} and shows a stranger the refusal, not the contents`, async () => {
      const consoleError = silenceActWarnings();
      window.history.pushState({}, '', route.path);
      await mountApp();

      await waitFor(
        () => {
          const heading = screen.getByRole('heading', { level: 1 });
          expect(heading.textContent).toBe(route.heading);
        },
        { timeout: 8000 },
      );

      expect(document.body.textContent ?? '').toContain(route.visible);
      expectNoConsoleErrors(consoleError);
    }, 25000);
  }
});

describe('the public verification route', () => {
  it('is readable by anybody, with no sign-in and no standing', async () => {
    const consoleError = silenceActWarnings();
    window.history.pushState(
      {},
      '',
      '/verify/BSDC-MOD-20260301-3456789A?h=ba7816bf8f01cfea414140de5dae2223',
    );
    await mountApp();

    await waitFor(
      () => {
        const heading = screen.getByRole('heading', { level: 1 });
        expect(heading.textContent).toBe('প্রতিবেদন যাচাই');
      },
      { timeout: 8000 },
    );

    // The id from the path is prefilled, so somebody who typed the address by hand is not asked
    // to type it again.
    const field = screen.getByLabelText('প্রতিবেদন আইডি বা যাচাই ঠিকানা');
    expect((field as HTMLInputElement).value).toBe('BSDC-MOD-20260301-3456789A');
    expect(document.body.textContent ?? '').toContain('যাচাই করুন');
    expectNoConsoleErrors(consoleError);
  }, 25000);
});
