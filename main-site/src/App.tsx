import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { RequireGuest } from '@/components/auth/RequireGuest';
import { AppShell } from '@/components/layout/AppShell';
import { PageSkeleton } from '@/design-system';
import { ROUTES } from '@/lib/site';
import RouteErrorBoundary from '@/routes/RouteErrorBoundary';

/* Route-level code splitting keeps the initial bundle small. */
const HomePage = lazy(() => import('@/routes/HomePage'));
const AboutPage = lazy(() => import('@/routes/AboutPage'));
const GuidelinesPage = lazy(() => import('@/routes/GuidelinesPage'));
const ContactPage = lazy(() => import('@/routes/ContactPage'));
const OfflinePage = lazy(() => import('@/routes/OfflinePage'));
const NotFoundPage = lazy(() => import('@/routes/NotFoundPage'));
const LoginPage = lazy(() => import('@/routes/auth/LoginPage'));
const SignupPage = lazy(() => import('@/routes/auth/SignupPage'));
const ResetPasswordPage = lazy(() => import('@/routes/auth/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('@/routes/auth/VerifyEmailPage'));
const OnboardingPage = lazy(() => import('@/routes/OnboardingPage'));
const ProfilePage = lazy(() => import('@/routes/ProfilePage'));
const SettingsPage = lazy(() => import('@/routes/SettingsPage'));
const ComposePage = lazy(() => import('@/routes/ComposePage'));
const PostPage = lazy(() => import('@/routes/PostPage'));
const TagPage = lazy(() => import('@/routes/TagPage'));
const NotificationsPage = lazy(() => import('@/routes/NotificationsPage'));
const BookmarksPage = lazy(() => import('@/routes/BookmarksPage'));

function Loader() {
  const { t } = useTranslation();
  return <PageSkeleton label={t('common.loading')} />;
}

function withSuspense(element: JSX.Element): JSX.Element {
  return <Suspense fallback={<Loader />}>{element}</Suspense>;
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: ROUTES.home, element: withSuspense(<HomePage />) },
      { path: ROUTES.about, element: withSuspense(<AboutPage />) },
      { path: ROUTES.guidelines, element: withSuspense(<GuidelinesPage />) },
      { path: ROUTES.contact, element: withSuspense(<ContactPage />) },
      { path: ROUTES.offline, element: withSuspense(<OfflinePage />) },

      // Guests only: a signed-in member is sent back to the home page.
      {
        element: <RequireGuest />,
        children: [
          { path: ROUTES.login, element: withSuspense(<LoginPage />) },
          { path: ROUTES.signup, element: withSuspense(<SignupPage />) },
          { path: ROUTES.reset, element: withSuspense(<ResetPasswordPage />) },
        ],
      },

      // Members only: guests are redirected to sign in and returned here.
      {
        element: <RequireAuth />,
        children: [
          { path: ROUTES.verify, element: withSuspense(<VerifyEmailPage />) },
          { path: ROUTES.onboarding, element: withSuspense(<OnboardingPage />) },
          { path: ROUTES.settings, element: withSuspense(<SettingsPage />) },
          { path: ROUTES.compose, element: withSuspense(<ComposePage />) },
          { path: ROUTES.notifications, element: withSuspense(<NotificationsPage />) },
          { path: ROUTES.bookmarks, element: withSuspense(<BookmarksPage />) },
        ],
      },

      // Public content permalinks.
      { path: '/p/:slug', element: withSuspense(<PostPage />) },
      { path: '/tag/:slug', element: withSuspense(<TagPage />) },

      // Public member permalink: /@username
      { path: ':handle', element: withSuspense(<ProfilePage />) },
      { path: '*', element: withSuspense(<NotFoundPage />) },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
