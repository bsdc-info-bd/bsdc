/**
 * BSDC — src/app/router/routes.tsx
 * Purpose : The application router (PART 07.01, ADR-005).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every page is lazy-loaded so the initial shell stays inside the 180KB gzip budget while
 *           any single route chunk stays under 250KB gzip (PART 25). Routes that need an identity
 *           render their own guard, so the guard is lazy with the screen it protects.
 *           The suspense fallback
 *           reserves the real content box, so lazy loading never costs us CLS.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { RootLayout } from '../layouts/RootLayout';
import { PublicLayout } from '../layouts/PublicLayout';
import { ErrorLayout } from '../layouts/ErrorLayout';
import { RouteErrorBoundary } from '../boundaries/RouteErrorBoundary';
import { LOCALES } from '@/core/config/app';
import { FeedSkeleton } from '@/shared/ui/Skeleton';
import { EmptyState } from '@/shared/ui/EmptyState';

const HomePage = lazy(async () => ({ default: (await import('@/pages/home/HomePage')).HomePage }));
const AboutPage = lazy(async () => ({
  default: (await import('@/pages/about/AboutPage')).AboutPage,
}));
const NetworkPage = lazy(async () => ({
  default: (await import('@/pages/network/NetworkPage')).NetworkPage,
}));
const DesignSystemPage = lazy(async () => ({
  default: (await import('@/pages/design-system/DesignSystemPage')).DesignSystemPage,
}));
const FeedPage = lazy(async () => ({ default: (await import('@/pages/feed/FeedPage')).FeedPage }));
const GroupsPage = lazy(async () => ({
  default: (await import('@/pages/groups/GroupsPage')).GroupsPage,
}));
const MessagesPage = lazy(async () => ({
  default: (await import('@/pages/messages/MessagesPage')).MessagesPage,
}));
const NotificationsPage = lazy(async () => ({
  default: (await import('@/pages/notifications/NotificationsPage')).NotificationsPage,
}));
const SearchPage = lazy(async () => ({
  default: (await import('@/pages/search/SearchPage')).SearchPage,
}));
const ProfilePage = lazy(async () => ({
  default: (await import('@/pages/profile/ProfilePage')).ProfilePage,
}));
const StoriesPage = lazy(async () => ({
  default: (await import('@/pages/stories/StoriesPage')).StoriesPage,
}));
const EventsPage = lazy(async () => ({
  default: (await import('@/pages/events/EventsPage')).EventsPage,
}));
const EventDetailPage = lazy(async () => ({
  default: (await import('@/pages/events/EventDetailPage')).EventDetailPage,
}));
const JobsPage = lazy(async () => ({
  default: (await import('@/pages/jobs/JobsPage')).JobsPage,
}));
const JobDetailPage = lazy(async () => ({
  default: (await import('@/pages/jobs/JobDetailPage')).JobDetailPage,
}));
const ProjectsPage = lazy(async () => ({
  default: (await import('@/pages/projects/ProjectsPage')).ProjectsPage,
}));
const FreelancerPage = lazy(async () => ({
  default: (await import('@/pages/freelancer/FreelancerPage')).FreelancerPage,
}));
const LeaderboardPage = lazy(async () => ({
  default: (await import('@/pages/leaderboard/LeaderboardPage')).LeaderboardPage,
}));
const ModerationPage = lazy(async () => ({
  default: (await import('@/pages/moderation/ModerationPage')).ModerationPage,
}));
const AdminOverviewPage = lazy(async () => ({
  default: (await import('@/pages/admin/AdminOverviewPage')).AdminOverviewPage,
}));
const AdminFeaturesPage = lazy(async () => ({
  default: (await import('@/pages/admin/AdminFeaturesPage')).AdminFeaturesPage,
}));
const AdminRolesPage = lazy(async () => ({
  default: (await import('@/pages/admin/AdminRolesPage')).AdminRolesPage,
}));
const AdminAuditPage = lazy(async () => ({
  default: (await import('@/pages/admin/AdminAuditPage')).AdminAuditPage,
}));
const AdminRecoveryPage = lazy(async () => ({
  default: (await import('@/pages/admin/AdminRecoveryPage')).AdminRecoveryPage,
}));
const SavedPage = lazy(async () => ({
  default: (await import('@/pages/saved/SavedPage')).SavedPage,
}));
const MarketPage = lazy(async () => ({
  default: (await import('@/pages/market/MarketPage')).MarketPage,
}));
const SettingsPage = lazy(async () => ({
  default: (await import('@/pages/settings/SettingsPage')).SettingsPage,
}));
const ReportsPage = lazy(async () => ({
  default: (await import('@/pages/reports/ReportsPage')).ReportsPage,
}));
const VerifyReportPage = lazy(async () => ({
  default: (await import('@/pages/reports/VerifyReportPage')).VerifyReportPage,
}));
const NotFoundPage = lazy(async () => ({
  default: (await import('@/pages/system/NotFoundPage')).NotFoundPage,
}));
const ErrorPage = lazy(async () => ({
  default: (await import('@/pages/system/ErrorPage')).ErrorPage,
}));
const OfflinePage = lazy(async () => ({
  default: (await import('@/pages/system/OfflinePage')).OfflinePage,
}));
const MaintenancePage = lazy(async () => ({
  default: (await import('@/pages/system/MaintenancePage')).MaintenancePage,
}));

/**
 * Suspense fallback that reserves the real layout height.
 * @returns a skeleton block
 */
function RouteFallback(): React.ReactElement {
  return (
    <div className="p-4" aria-busy="true">
      <FeedSkeleton count={2} />
    </div>
  );
}

/**
 * The routed screens, defined once and mounted under both the bare path and a locale prefix, so
 * `/feed` and `/bn/feed` are the same screen rather than two trees that can drift apart.
 * @returns the children of the application shell
 */
function appChildren(): RouteObject[] {
  return [
    {
      index: true,
      element: (
        <Suspense fallback={<RouteFallback />}>
          <HomePage />
        </Suspense>
      ),
    },
    {
      path: 'design-system',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <DesignSystemPage />
        </Suspense>
      ),
    },
    {
      path: 'feed',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <FeedPage />
        </Suspense>
      ),
    },
    {
      path: 'groups',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <GroupsPage />
        </Suspense>
      ),
    },
    {
      path: 'messages',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <MessagesPage />
        </Suspense>
      ),
    },
    {
      path: 'notifications',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <NotificationsPage />
        </Suspense>
      ),
    },
    {
      path: 'saved',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <SavedPage />
        </Suspense>
      ),
    },
    {
      path: 'search',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <SearchPage />
        </Suspense>
      ),
    },
    {
      path: 'u/:username',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <ProfilePage />
        </Suspense>
      ),
    },
    {
      path: 'stories',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <StoriesPage />
        </Suspense>
      ),
    },
    {
      path: 'events',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <EventsPage />
        </Suspense>
      ),
    },
    {
      path: 'events/:eventId',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <EventDetailPage />
        </Suspense>
      ),
    },
    {
      path: 'jobs',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <JobsPage />
        </Suspense>
      ),
    },
    {
      path: 'jobs/:jobId',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <JobDetailPage />
        </Suspense>
      ),
    },
    {
      path: 'market',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <MarketPage />
        </Suspense>
      ),
    },
    {
      path: 'projects',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <ProjectsPage />
        </Suspense>
      ),
    },
    {
      path: 'freelancer',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <FreelancerPage />
        </Suspense>
      ),
    },
    {
      path: 'leaderboard',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <LeaderboardPage />
        </Suspense>
      ),
    },
    {
      path: 'moderation',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <ModerationPage />
        </Suspense>
      ),
    },
    {
      path: 'settings',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <SettingsPage />
        </Suspense>
      ),
    },
    {
      path: 'admin',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <AdminOverviewPage />
        </Suspense>
      ),
    },
    {
      path: 'admin/features',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <AdminFeaturesPage />
        </Suspense>
      ),
    },
    {
      path: 'admin/roles',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <AdminRolesPage />
        </Suspense>
      ),
    },
    {
      path: 'admin/audit',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <AdminAuditPage />
        </Suspense>
      ),
    },
    {
      path: 'admin/recovery',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <AdminRecoveryPage />
        </Suspense>
      ),
    },
    {
      path: 'reports',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <ReportsPage />
        </Suspense>
      ),
    },
    {
      path: 'verify/:reportId',
      element: (
        <Suspense fallback={<RouteFallback />}>
          <VerifyReportPage />
        </Suspense>
      ),
    },
  ];
}

/**
 * Builds the two application trees: the bare one, and the Bangla and English prefixed one.
 * The prefixed tree refuses any prefix that is not a real locale by throwing a 404, so `/bn`
 * is a language and `/anything-else` is a missing page.
 * @returns the route objects for both trees
 */
function appTrees(): RouteObject[] {
  const trees: RouteObject[] = [
    {
      path: '/',
      element: <RootLayout />,
      errorElement: (
        <ErrorLayout>
          <ErrorPage />
        </ErrorLayout>
      ),
      children: appChildren(),
    },
  ];

  for (const locale of LOCALES) {
    trees.push({
      path: `/${locale}`,
      element: <RootLayout />,
      errorElement: (
        <ErrorLayout>
          <ErrorPage />
        </ErrorLayout>
      ),
      children: appChildren(),
    });
  }

  return trees;
}

const router = createBrowserRouter([
  ...appTrees(),
  {
    element: <PublicLayout />,
    errorElement: (
      <ErrorLayout>
        <ErrorPage />
      </ErrorLayout>
    ),
    children: [
      {
        path: '/about',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <AboutPage />
          </Suspense>
        ),
      },
      {
        path: '/network',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <NetworkPage />
          </Suspense>
        ),
      },
      {
        path: ':locale/about',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <AboutPage />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: '/offline',
    element: (
      <ErrorLayout>
        <Suspense fallback={<RouteFallback />}>
          <OfflinePage />
        </Suspense>
      </ErrorLayout>
    ),
  },
  {
    path: '/maintenance',
    element: (
      <ErrorLayout>
        <Suspense fallback={<RouteFallback />}>
          <MaintenancePage />
        </Suspense>
      </ErrorLayout>
    ),
  },
  {
    path: '*',
    element: (
      <ErrorLayout>
        <RouteErrorBoundary
          fallback={
            <EmptyState
              illustration="not-found"
              title="Page not found"
              description="The page you are looking for does not exist or has moved."
            />
          }
        >
          <Suspense fallback={<RouteFallback />}>
            <NotFoundPage />
          </Suspense>
        </RouteErrorBoundary>
      </ErrorLayout>
    ),
  },
]);

/**
 * Renders the application router.
 * @returns a router provider
 */
export function AppRouter(): React.ReactElement {
  return <RouterProvider router={router} />;
}
