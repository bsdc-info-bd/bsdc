import type { RouteObject } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import { LandingPage } from '@/pages/landing';
import { NotFoundPage } from '@/pages/not-found';
import { NotYetImplementedPage } from '@/pages/not-yet-implemented';

/**
 * §5 Information Architecture — this URL scheme is stable from Phase 1
 * onward; retrofitting it after content exists would break SEO equity.
 *
 *   Profile: /@username          Post:  /{post-type}/{seo-slug}
 *   Group:   /g/{group-slug}     Page:  /p/{page-slug}
 *   Event:   /events/{slug}      Job:   /jobs/{job-slug}
 *   Tag:     /t/{tag}            Search:/search?q=
 *
 * React Router cannot express a `@` prefix inside a dynamic segment, so
 * profiles are matched with a single-segment route guarded on the leading
 * `@`. Static routes (e.g. /search, /g/:slug) always outrank the dynamic
 * fallbacks in React Router's specificity scoring.
 */
export const ROUTES = {
  home: '/',
  profile: '/@:username',
  post: '/:postType/:slug',
  group: '/g/:slug',
  page: '/p/:slug',
  event: '/events/:slug',
  job: '/jobs/:slug',
  tag: '/t/:tag',
  search: '/search',
} as const;

/** §2 Phase 2 post types, also used to build `/{post-type}/{slug}` URLs. */
export const POST_TYPES = ['article', 'code', 'story', 'showcase', 'question'] as const;
export type PostType = (typeof POST_TYPES)[number];

export function isPostType(value: string | undefined): value is PostType {
  return !!value && (POST_TYPES as readonly string[]).includes(value);
}

/** Fallback route → which phase owns that area (per §4 phased build plan). */
const AREA_PHASES = {
  profile: 1,
  post: 2,
  group: 3,
  page: 3,
  event: 3,
  job: 6,
  tag: 3,
  search: 3,
} as const;

export type NotYetArea = keyof typeof AREA_PHASES;

/** Route that renders an honest "planned, not faked" screen. */
function NotYet({ area }: { area: NotYetArea }) {
  return <NotYetImplementedPage area={area} phase={AREA_PHASES[area]} />;
}

/** `/{post-type}/{slug}` — valid post types only; everything else is a 404. */
function PostRoute() {
  const { postType } = useParams();
  if (!isPostType(postType)) return <NotFoundPage />;
  return <NotYet area="post" />;
}

/** Single-segment fallback: `@username` → profile area, anything else → 404. */
function HandleRoute() {
  const { handle } = useParams();
  if (handle && handle.startsWith('@')) return <NotYet area="profile" />;
  return <NotFoundPage />;
}

export const appRoutes: RouteObject[] = [
  { path: ROUTES.home, element: <LandingPage /> },
  { path: ROUTES.search, element: <NotYet area="search" /> },
  { path: ROUTES.tag, element: <NotYet area="tag" /> },
  { path: ROUTES.group, element: <NotYet area="group" /> },
  { path: ROUTES.page, element: <NotYet area="page" /> },
  { path: ROUTES.event, element: <NotYet area="event" /> },
  { path: ROUTES.job, element: <NotYet area="job" /> },
  { path: '/:postType/:slug', element: <PostRoute /> },
  { path: '/:handle', element: <HandleRoute /> },
  { path: '*', element: <NotFoundPage /> },
];
