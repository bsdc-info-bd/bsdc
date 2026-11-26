import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { DYNAMIC_ROUTES, STATIC_ROUTES } from './routes.generated';

describe('the generated route list', () => {
  it('is current with the prerender manifest', () => {
    // Regenerating and comparing is the only check that actually catches a stale
    // copy: the alternative is to re-read the manifest here and duplicate the
    // generator, which is the drift this file exists to prevent.
    expect(() =>
      execFileSync('node', [resolve(process.cwd(), 'scripts/sync-routes.mjs'), '--check'], {
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });

  it('has the routes the site actually builds', () => {
    expect(STATIC_ROUTES.length).toBeGreaterThanOrEqual(16);
  });

  it('covers the home page, which is the one route that must never be missing', () => {
    expect(STATIC_ROUTES.some((route) => route.path === '/')).toBe(true);
  });

  it('lists every path in the canonical form the database stores', () => {
    for (const route of STATIC_ROUTES) {
      expect(route.path, route.path).toBe(route.path.toLowerCase());
      expect(route.path.startsWith('/'), route.path).toBe(true);
      if (route.path !== '/') expect(route.path.endsWith('/'), route.path).toBe(false);
    }
  });

  it('does not list the same path twice, because the prerenderer would write one over the other', () => {
    const paths = STATIC_ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('carries a title and a description for every static route, since the console checks the ones that do not', () => {
    for (const route of STATIC_ROUTES) {
      expect(route.title.trim(), route.path).not.toBe('');
      expect(route.description.trim(), route.path).not.toBe('');
    }
  });

  it('names the database table behind each dynamic family, so coverage never claims one', () => {
    expect(DYNAMIC_ROUTES.length).toBeGreaterThan(0);
    for (const route of DYNAMIC_ROUTES) {
      expect(route.source).toMatch(/^public\./);
      expect(route.pattern).toContain(':');
    }
  });

  it('sorts the list, so two people reading the coverage screen see the same order', () => {
    const sorted = [...STATIC_ROUTES].sort((a, b) => a.path.localeCompare(b.path));
    expect(STATIC_ROUTES.map((r) => r.path)).toEqual(sorted.map((r) => r.path));
  });
});
