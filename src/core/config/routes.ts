/**
 * BSDC — src/core/config/routes.ts
 * Purpose : The single route table: paths, SEO intent, indexability and build status (PART 07.01).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : ADR-005 — routes are data, not JSX. The router, the sitemap builder, the breadcrumb
 *           component and the navigation model all read this table, so they cannot disagree.
 *           `status: 'planned'` routes are registered as their module lands; navigation filters
 *           them out until then, so no link in the product ever leads to an unfinished screen.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { FLAG_KEYS } from '@/core/config/features';

/** Build status of a route's module. */
export type RouteStatus = 'live' | 'planned';

/** How often a route's content changes, for sitemap priority hints (PART 10.03). */
export type ChangeFrequency =
  'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

/** Metadata for a single route. */
export interface RouteMeta {
  /** Route path as matched by the router. */
  readonly path: string;
  /** Translation key under the `nav` namespace. */
  readonly titleKey: string;
  readonly status: RouteStatus;
  /** Feature flag that gates the route; undefined means always available. */
  readonly flag?: string;
  readonly requiresAuth?: boolean;
  /** Excluded from sitemaps and marked noindex (PART 10.06). */
  readonly noindex?: boolean;
  readonly changeFrequency?: ChangeFrequency;
  readonly priority?: number;
  /** Sorted breadcrumb keys used by the breadcrumb component. */
  readonly breadcrumbs?: readonly string[];
}

/** The complete BSDC route table. */
export const ROUTES: readonly RouteMeta[] = [
  { path: '/', titleKey: 'home', status: 'live', changeFrequency: 'hourly', priority: 1 },
  {
    path: '/feed',
    titleKey: 'feed',
    status: 'live',
    flag: FLAG_KEYS.feed,
    changeFrequency: 'hourly',
    priority: 0.8,
  },
  {
    path: '/search',
    titleKey: 'search',
    status: 'live',
    flag: FLAG_KEYS.search,
    noindex: true,
    changeFrequency: 'never',
  },
  {
    path: '/u/:username',
    titleKey: 'profile',
    status: 'live',
    flag: FLAG_KEYS.profiles,
    changeFrequency: 'weekly',
    priority: 0.6,
  },
  {
    path: '/stories',
    titleKey: 'stories',
    status: 'live',
    flag: FLAG_KEYS.stories,
    noindex: true,
  },
  {
    path: '/groups',
    titleKey: 'groups',
    status: 'live',
    flag: FLAG_KEYS.groups,
    changeFrequency: 'daily',
    priority: 0.7,
  },
  {
    path: '/messages',
    titleKey: 'messages',
    status: 'live',
    flag: FLAG_KEYS.messenger,
    requiresAuth: true,
    noindex: true,
  },
  {
    path: '/notifications',
    titleKey: 'notifications',
    status: 'live',
    flag: FLAG_KEYS.notifications,
    requiresAuth: true,
    noindex: true,
  },
  {
    path: '/saved',
    titleKey: 'saved',
    status: 'live',
    flag: FLAG_KEYS.feed,
    requiresAuth: true,
    noindex: true,
  },
  {
    path: '/events',
    titleKey: 'events',
    status: 'live',
    flag: FLAG_KEYS.events,
    changeFrequency: 'daily',
    priority: 0.8,
  },
  {
    path: '/events/:eventId',
    titleKey: 'eventDetail',
    status: 'live',
    flag: FLAG_KEYS.events,
    changeFrequency: 'weekly',
    priority: 0.7,
    breadcrumbs: ['home', 'events'],
  },
  {
    path: '/jobs',
    titleKey: 'jobs',
    status: 'live',
    flag: FLAG_KEYS.jobs,
    changeFrequency: 'daily',
    priority: 0.8,
  },
  {
    path: '/jobs/:jobId',
    titleKey: 'jobDetail',
    status: 'live',
    flag: FLAG_KEYS.jobs,
    changeFrequency: 'weekly',
    priority: 0.7,
    breadcrumbs: ['home', 'jobs'],
  },
  {
    path: '/projects',
    titleKey: 'projects',
    status: 'live',
    flag: FLAG_KEYS.projects,
    changeFrequency: 'daily',
    priority: 0.7,
  },
  {
    path: '/freelancer',
    titleKey: 'freelancer',
    status: 'live',
    flag: FLAG_KEYS.freelancer,
    changeFrequency: 'daily',
    priority: 0.7,
  },
  {
    path: '/leaderboard',
    titleKey: 'leaderboard',
    status: 'live',
    flag: FLAG_KEYS.gamificationLeaderboards,
    changeFrequency: 'daily',
    priority: 0.5,
  },
  {
    path: '/moderation',
    titleKey: 'moderation',
    status: 'live',
    flag: FLAG_KEYS.moderation,
    requiresAuth: true,
    noindex: true,
  },
  {
    path: '/admin',
    titleKey: 'admin',
    status: 'live',
    flag: FLAG_KEYS.adminConsole,
    requiresAuth: true,
    noindex: true,
  },
  {
    path: '/admin/features',
    titleKey: 'admin',
    status: 'live',
    flag: FLAG_KEYS.adminConsole,
    requiresAuth: true,
    noindex: true,
  },
  {
    path: '/admin/roles',
    titleKey: 'admin',
    status: 'live',
    flag: FLAG_KEYS.adminConsole,
    requiresAuth: true,
    noindex: true,
  },
  {
    path: '/admin/audit',
    titleKey: 'admin',
    status: 'live',
    flag: FLAG_KEYS.adminConsole,
    requiresAuth: true,
    noindex: true,
  },
  {
    path: '/admin/recovery',
    titleKey: 'admin',
    status: 'live',
    flag: FLAG_KEYS.adminConsole,
    requiresAuth: true,
    noindex: true,
  },
  {
    path: '/reports',
    titleKey: 'reports',
    status: 'live',
    flag: FLAG_KEYS.reports,
    requiresAuth: true,
    noindex: true,
  },
  {
    path: '/verify/:reportId',
    titleKey: 'reports',
    status: 'live',
    flag: FLAG_KEYS.reports,
    noindex: true,
  },
  {
    path: '/market',
    titleKey: 'marketplace',
    status: 'live',
    flag: FLAG_KEYS.marketplace,
    changeFrequency: 'hourly',
    priority: 0.9,
  },
  {
    path: '/settings',
    titleKey: 'settings',
    status: 'live',
    flag: FLAG_KEYS.shell,
    requiresAuth: true,
    noindex: true,
  },
  { path: '/about', titleKey: 'about', status: 'live', changeFrequency: 'monthly', priority: 0.6 },
  {
    path: '/network',
    titleKey: 'network',
    status: 'live',
    changeFrequency: 'monthly',
    priority: 0.5,
  },
  {
    path: '/design-system',
    titleKey: 'designSystem',
    status: 'live',
    changeFrequency: 'monthly',
    priority: 0.3,
  },
];

/** Routes whose modules are built and registered. */
export function liveRoutes(): readonly RouteMeta[] {
  return ROUTES.filter((route) => route.status === 'live');
}

/** Routes that may be crawled and appear in the sitemap (PART 10.06). */
export function indexableRoutes(): readonly RouteMeta[] {
  return liveRoutes().filter((route) => route.noindex !== true);
}

/**
 * Looks up route metadata by path.
 * @param path route path
 * @returns the metadata, or undefined when the route is unknown
 */
export function findRouteMeta(path: string): RouteMeta | undefined {
  return ROUTES.find((route) => route.path === path);
}
