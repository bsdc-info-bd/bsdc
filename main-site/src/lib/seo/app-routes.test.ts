import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/locales/en';
import { ROUTES } from '@/lib/site';
import { APP_ROUTES, HANDLE_ROUTE, isEdgeNoindexPath, matchAppRoute } from './app-routes';
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

  /**
   * The prerender step turns `component` into a `<link rel="modulepreload">`
   * tag by looking the name up in the build manifest. A name that does not
   * match a lazy import is not an error anywhere — the tag is silently left
   * out and the page quietly goes back to a second round trip before its first
   * paint. So the name is checked here, against the source of the router.
   */
  it('names the route component each prerendered page actually renders', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    const lazyImports = new Set(
      [...app.matchAll(/const (\w+) = lazy\(\(\) => import\('([^']+)'\)\)/g)].map((m) => m[1]),
    );
    for (const route of staticRoutes.routes) {
      expect(lazyImports, route.path).toContain(route.component);
      expect(existsSync(`src/routes/${route.component}.tsx`), route.path).toBe(true);
    }
  });

  /**
   * The prerendered shell quotes the page's opening paragraphs so the first
   * paint is the page itself. Quoting is only honest while the words are the
   * same words: this holds every `opening` paragraph against the English
   * bundle, so editing the copy in the locale and not in the manifest fails
   * here instead of leaving a stale paragraph on screen for the first second
   * of every visit.
   */
  it('quotes the page it stands in for, word for word', () => {
    const strings = new Set<string>();
    const walk = (value: unknown): void => {
      if (typeof value === 'string') strings.add(value);
      else if (value && typeof value === 'object') {
        for (const child of Object.values(value)) walk(child);
      }
    };
    walk(en);
    for (const route of staticRoutes.routes) {
      for (const paragraph of (route as { opening?: string[] }).opening ?? []) {
        expect(strings.has(paragraph), `${route.path}: ${paragraph.slice(0, 60)}…`).toBe(true);
      }
    }
  });

  it('never prerenders the same path twice', () => {
    const paths = staticRoutes.routes.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
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

  it('ignores a trailing slash and matches static segments case-insensitively', () => {
    expect(matchAppRoute('/about/')).toEqual({ kind: 'static', path: '/about' });
    expect(matchAppRoute('/About')).toEqual({ kind: 'static', path: '/about' });
    expect(matchAppRoute('/JOBS/senior-backend')).toEqual({
      kind: 'param',
      pattern: '/jobs/:slug',
    });
    expect(isEdgeNoindexPath('/SEARCH')).toBe(true);
    expect(isEdgeNoindexPath('/projects/edit')).toBe(false);
    expect(isEdgeNoindexPath('/projects/my-app/edit')).toBe(true);
  });
});
