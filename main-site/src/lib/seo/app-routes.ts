/**
 * Every address the single-page application answers, written the way the
 * route table in App.tsx writes it. A `:name` segment matches exactly one path
 * segment. `:handle` is the bare member permalink and is matched last.
 *
 * The middleware uses this to tell a real page from an address that is not one,
 * so the second kind can be answered with a 404 instead of the site's home page
 * description. `app-routes.test.ts` reads App.tsx and fails if this list and the
 * router disagree, so the two cannot drift apart silently.
 */
export const APP_ROUTES: readonly string[] = [
  '/',
  '/about',
  '/guidelines',
  '/contact',
  '/offline',
  '/auth/login',
  '/auth/signup',
  '/auth/reset',
  '/auth/verify',
  '/onboarding',
  '/settings',
  '/compose',
  '/create',
  '/projects/:slug/edit',
  '/compose/:postId',
  '/notifications',
  '/bookmarks',
  '/trash',
  '/messages',
  '/messages/:id',
  '/ads',
  '/admin',
  '/admin/plugins',
  '/admin/analytics',
  '/admin/reports',
  '/admin/moderation',
  '/admin/people',
  '/vendor',
  '/vendor/products',
  '/vendor/orders',
  '/vendor/payouts',
  '/groups',
  '/g/:slug',
  '/events',
  '/events/:slug',
  '/jobs',
  '/jobs/:slug',
  '/freelance',
  '/freelance/:slug',
  '/projects',
  '/projects/:slug',
  '/playground',
  '/search',
  '/shop',
  '/shop/:slug',
  '/cart',
  '/checkout',
  '/orders',
  '/learn',
  '/learn/:slug',
  '/verify',
  '/verify/:code',
  '/p/:slug',
  '/tag/:slug',
];

/** The bare member permalink: /username, which the app also accepts as /@username. */
export const HANDLE_ROUTE = '/:handle';

export type RouteMatch =
  | { kind: 'static'; path: string }
  | { kind: 'param'; pattern: string }
  | { kind: 'handle'; handle: string };

function segmentsOf(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

function isParam(segment: string): boolean {
  return segment.startsWith(':');
}

function matchesPattern(pattern: string, pathname: string): boolean {
  const want = segmentsOf(pattern);
  const have = segmentsOf(pathname);
  if (want.length !== have.length) return false;
  return want.every((segment, index) => isParam(segment) || segment === have[index]);
}

/**
 * What the application would render for this pathname, or null when no route
 * in the application answers it. Static pages win over parameterised ones, and a
 * single segment that no other route claims is treated as a member handle.
 */
export function matchAppRoute(pathname: string): RouteMatch | null {
  const normalised = pathname.length > 1 ? pathname.replace(/\/+$/, '') : '/';
  for (const route of APP_ROUTES) {
    if (
      !route.split('/').some((segment) => isParam(segment)) &&
      matchesPattern(route, normalised)
    ) {
      return { kind: 'static', path: route };
    }
  }
  for (const route of APP_ROUTES) {
    if (route.split('/').some((segment) => isParam(segment)) && matchesPattern(route, normalised)) {
      return { kind: 'param', pattern: route };
    }
  }
  const segments = segmentsOf(normalised);
  if (segments.length === 1) {
    const handle = (segments[0] ?? '').replace(/^@/, '');
    if (handle.length > 0) return { kind: 'handle', handle };
  }
  return null;
}
