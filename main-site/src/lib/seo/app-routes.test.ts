import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/lib/site';
import { APP_ROUTES, HANDLE_ROUTE, matchAppRoute } from './app-routes';
import staticRoutes from './static-routes.json';

/**
 * Reads the router the way a reader would: every `path:` in App.tsx, with the
 * ROUTES identifiers and the template strings resolved to their values. If a
 * route is added to App.tsx without the manifest, or the reverse, this fails.
 */
function routerPaths(): string[] {
  const app = readFileSync('src/App.tsx', 'utf8');
  const entries = [...app.matchAll(/path: (`[^`]+`|'[^']+'|ROUTES\.\w+)/g)].map((m) => m[1] ?? '');
  const resolved = entries.map((entry) => {
    if (entry.startsWith('ROUTES.')) {
      const key = entry.slice('ROUTES.'.length) as keyof typeof ROUTES;
      return ROUTES[key];
    }
    if (entry.startsWith('`')) {
      return entry
        .slice(1, -1)
        .replace(/\$\{ROUTES\.(\w+)\}/g, (_match, key: keyof typeof ROUTES) => ROUTES[key]);
    }
    return entry.slice(1, -1);
  });
  // The bare handle is written ':handle' in the router and '/:handle' here; both
  // are the same route.
  return resolved
    .filter((path) => path !== '*')
    .map((path) => (path.startsWith('/') ? path : `/${path}`));
}

describe('the route manifest matches the router', () => {
  it('lists every path App.tsx declares, and nothing else', () => {
    const declared = [...new Set(routerPaths())].sort();
    const manifest = [...APP_ROUTES, HANDLE_ROUTE].sort();
    expect(manifest).toEqual(declared);
  });

  it('contains every prerendered static page', () => {
    for (const route of staticRoutes.routes) {
      expect(APP_ROUTES, route.path).toContain(route.path);
    }
  });
});

describe('matching an address', () => {
  it('answers a static page as static', () => {
    expect(matchAppRoute('/about')).toEqual({ kind: 'static', path: '/about' });
    expect(matchAppRoute('/')).toEqual({ kind: 'static', path: '/' });
  });

  it('answers a parameterised page with its pattern', () => {
    expect(matchAppRoute('/jobs/senior-backend-engineer')).toEqual({
      kind: 'param',
      pattern: '/jobs/:slug',
    });
    expect(matchAppRoute('/freelance/payments-api')).toEqual({
      kind: 'param',
      pattern: '/freelance/:slug',
    });
    expect(matchAppRoute('/projects/acme/edit')).toEqual({
      kind: 'param',
      pattern: '/projects/:slug/edit',
    });
  });

  it('treats a single unclaimed segment as a member handle, with or without @', () => {
    expect(matchAppRoute('/rahim')).toEqual({ kind: 'handle', handle: 'rahim' });
    expect(matchAppRoute('/@rahim')).toEqual({ kind: 'handle', handle: 'rahim' });
  });

  it('answers an address no route claims with null', () => {
    expect(matchAppRoute('/a/b/c/d')).toBeNull();
    expect(matchAppRoute('/jobs/one/two/three')).toBeNull();
  });

  it('ignores a trailing slash', () => {
    expect(matchAppRoute('/about/')).toEqual({ kind: 'static', path: '/about' });
  });
});
