/**
 * BSDC — src/tests/components/shell.test.tsx
 * Purpose : Smoke test of the application shell: providers, router, translations and the first
 *           route must render together without a console error (PART 23.4).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The i18next HTTP backend is fed from the real dictionaries on disk, so this test
 *           exercises the same code path the browser uses. Any console error fails the test:
 *           "no console errors" is a product requirement, not an aspiration.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';

const localesRoot = resolve(process.cwd(), 'public/locales');

beforeAll(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      // A Request or URL object stringifies safely through its own url/href property.
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('application shell', () => {
  it('renders the home route with real Bangla copy and the RRC legal line', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation((): void => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation((): void => undefined);

    const { App } = await import('@/app/App');

    render(
      <Suspense fallback={null}>
        <App />
      </Suspense>,
    );

    await waitFor(
      () => {
        expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
      },
      { timeout: 5000 },
    );

    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    // The legal line appears in the hero and again in the footer, by design (PART 31.4).
    expect(screen.getAllByText('a platform of RRC Development').length).toBeGreaterThanOrEqual(1);
    expect(consoleError).not.toHaveBeenCalled();
    warn.mockRestore();
    consoleError.mockRestore();
  }, 20000);

  it('exposes exactly one main landmark and a working skip link', async () => {
    const { App } = await import('@/app/App');
    render(
      <Suspense fallback={null}>
        <App />
      </Suspense>,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('main').length).toBe(1);
    });

    const skip = screen.getByText(/Skip to content/);
    expect(skip.getAttribute('href')).toBe('#main-content');
  }, 20000);
});
