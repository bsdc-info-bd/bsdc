import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
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
      { path: '*', element: withSuspense(<NotFoundPage />) },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
