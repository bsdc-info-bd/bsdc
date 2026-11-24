import { render, screen } from '@testing-library/react';
import { MemoryRouter, type useRouteError } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as I18nModule from 'react-i18next';
import type * as ChunkRecovery from '@/lib/site/chunk-recovery';

const state = vi.hoisted(() => ({
  error: null as unknown,
  recover: vi.fn(),
}));

type RouterModule = { useRouteError: typeof useRouteError };

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<RouterModule>();
  return { ...actual, useRouteError: () => state.error };
});
vi.mock('@/lib/site/chunk-recovery', async (importOriginal) => {
  const actual = await importOriginal<typeof ChunkRecovery>();
  return { ...actual, recoverFromStaleBuild: state.recover };
});
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  };
});

const { default: RouteErrorBoundary } = await import('./RouteErrorBoundary');

function show(error: unknown) {
  state.error = error;
  return render(
    <MemoryRouter>
      <RouteErrorBoundary />
    </MemoryRouter>,
  );
}

/**
 * The error screen is the last resort. It used to be the *first* thing a
 * visitor saw after a deploy — this checks the two cases stay apart, because
 * reporting "your saved work is fine, just reload" for a real bug would be
 * worse than reporting the bug.
 */
describe('RouteErrorBoundary', () => {
  beforeEach(() => {
    state.recover.mockClear();
  });

  it('explains a stale build and recovers instead of blaming the page', () => {
    show(new TypeError('Failed to fetch dynamically imported module: /assets/AboutPage-x.js'));
    expect(screen.getByText('errors.staleBuildTitle')).toBeTruthy();
    expect(screen.getByText('errors.staleBuildBody')).toBeTruthy();
    expect(state.recover).toHaveBeenCalledTimes(1);
  });

  it('reports a genuine page failure without trying to reload', () => {
    show(new Error('Rendered more hooks than during the previous render'));
    expect(screen.getByText('errors.boundaryTitle')).toBeTruthy();
    expect(screen.getByText('errors.boundaryBody')).toBeTruthy();
    expect(state.recover).not.toHaveBeenCalled();
  });

  it('always offers a way back to the home page', () => {
    show(new Error('anything'));
    expect(screen.getByText('common.backHome').closest('a')?.getAttribute('href')).toBe('/');
    expect(screen.getByText('common.retry')).toBeTruthy();
  });
});
