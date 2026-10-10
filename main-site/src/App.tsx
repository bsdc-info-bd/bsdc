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
const TrashPage = lazy(() => import('./routes/TrashPage'));
const BookmarksPage = lazy(() => import('@/routes/BookmarksPage'));
const MessagesPage = lazy(() => import('@/routes/MessagesPage'));
const GroupsPage = lazy(() => import('@/routes/GroupsPage'));
const CreatePage = lazy(() => import('@/routes/CreatePage'));
const GroupPage = lazy(() => import('@/routes/GroupPage'));
const EventsPage = lazy(() => import('@/routes/EventsPage'));
const JobsPage = lazy(() => import('@/routes/JobsPage'));
const FreelancePage = lazy(() => import('@/routes/FreelancePage'));
const ProjectsPage = lazy(() => import('@/routes/ProjectsPage'));
const ProjectPage = lazy(() => import('@/routes/ProjectPage'));
const ProjectEditPage = lazy(() => import('@/routes/ProjectEditPage'));
const PlaygroundPage = lazy(() => import('@/routes/PlaygroundPage'));
const SearchPage = lazy(() => import('@/routes/SearchPage'));
const ShopPage = lazy(() => import('@/routes/ShopPage'));
const ProductPage = lazy(() => import('@/routes/ProductPage'));
const CartPage = lazy(() => import('@/routes/CartPage'));
const CheckoutPage = lazy(() => import('@/routes/CheckoutPage'));
const OrdersPage = lazy(() => import('@/routes/OrdersPage'));
const AdsPage = lazy(() => import('@/routes/AdsPage'));
const AdminPage = lazy(() => import('@/routes/AdminPage'));
const AdminPluginsPage = lazy(() => import('@/routes/AdminPluginsPage'));
const AdminAnalyticsPage = lazy(() => import('@/routes/AdminAnalyticsPage'));
const AdminReportsPage = lazy(() => import('@/routes/AdminReportsPage'));
const AdminModerationPage = lazy(() => import('@/routes/AdminModerationPage'));
const AdminPeoplePage = lazy(() => import('@/routes/AdminPeoplePage'));
const VendorPage = lazy(() => import('@/routes/VendorPage'));
const VendorProductsPage = lazy(() => import('@/routes/VendorProductsPage'));
const VendorOrdersPage = lazy(() => import('@/routes/VendorOrdersPage'));
const VendorPayoutsPage = lazy(() => import('@/routes/VendorPayoutsPage'));
const LearnPage = lazy(() => import('@/routes/LearnPage'));
const CoursePage = lazy(() => import('@/routes/CoursePage'));
const VerifyCertificatePage = lazy(() => import('@/routes/VerifyCertificatePage'));

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
          // The one door for adding to a directory: an event, a job, a gig, a
          // project, a group. Each table already had a policy for its author;
          // what was missing was the form.
          { path: ROUTES.create, element: withSuspense(<CreatePage />) },
          // The owner's editor for a published project. Membership is required
          // to reach it and ownership is checked again inside, because a
          // stranger who arrives from a shared link should be told plainly
          // rather than handed a form that refuses on submit.
          {
            path: `${ROUTES.projects}/:slug/edit`,
            element: withSuspense(<ProjectEditPage />),
          },
          // The same composer, opened on an existing post. The page loads the
          // post and refuses to show it to anybody but its author, and the
          // database refuses the write besides.
          { path: `${ROUTES.compose}/:postId`, element: withSuspense(<ComposePage />) },
          { path: ROUTES.notifications, element: withSuspense(<NotificationsPage />) },
          { path: ROUTES.bookmarks, element: withSuspense(<BookmarksPage />) },
          { path: ROUTES.trash, element: withSuspense(<TrashPage />) },
          { path: ROUTES.messages, element: withSuspense(<MessagesPage />) },
          { path: '/messages/:id', element: withSuspense(<MessagesPage />) },

          // Vendor console. Ownership is enforced again in the database.
          { path: ROUTES.ads, element: withSuspense(<AdsPage />) },

          // Admin. Every surface re-checks its permission in the database.
          { path: ROUTES.admin, element: withSuspense(<AdminPage />) },
          { path: ROUTES.adminPlugins, element: withSuspense(<AdminPluginsPage />) },
          { path: ROUTES.adminAnalytics, element: withSuspense(<AdminAnalyticsPage />) },
          { path: ROUTES.adminReports, element: withSuspense(<AdminReportsPage />) },
          { path: ROUTES.adminModeration, element: withSuspense(<AdminModerationPage />) },
          { path: ROUTES.adminPeople, element: withSuspense(<AdminPeoplePage />) },
          { path: ROUTES.vendor, element: withSuspense(<VendorPage />) },
          { path: ROUTES.vendorProducts, element: withSuspense(<VendorProductsPage />) },
          { path: ROUTES.vendorOrders, element: withSuspense(<VendorOrdersPage />) },
          { path: ROUTES.vendorPayouts, element: withSuspense(<VendorPayoutsPage />) },
        ],
      },

      // Communities are public surfaces; privacy is enforced by the database.
      { path: ROUTES.groups, element: withSuspense(<GroupsPage />) },
      { path: '/g/:slug', element: withSuspense(<GroupPage />) },
      { path: ROUTES.events, element: withSuspense(<EventsPage />) },

      // Opportunity surfaces: public to read, gated to act on.
      { path: ROUTES.jobs, element: withSuspense(<JobsPage />) },
      { path: ROUTES.freelance, element: withSuspense(<FreelancePage />) },
      { path: ROUTES.projects, element: withSuspense(<ProjectsPage />) },
      { path: `${ROUTES.projects}/:slug`, element: withSuspense(<ProjectPage />) },
      { path: ROUTES.playground, element: withSuspense(<PlaygroundPage />) },

      { path: ROUTES.search, element: withSuspense(<SearchPage />) },

      // Marketplace, customer side. The cart and checkout are private.
      { path: ROUTES.shop, element: withSuspense(<ShopPage />) },
      { path: '/shop/:slug', element: withSuspense(<ProductPage />) },
      { path: ROUTES.cart, element: withSuspense(<CartPage />) },
      { path: ROUTES.checkout, element: withSuspense(<CheckoutPage />) },
      { path: ROUTES.orders, element: withSuspense(<OrdersPage />) },

      // Learning. Certificate verification is public and needs no session.
      { path: ROUTES.learn, element: withSuspense(<LearnPage />) },
      { path: '/learn/:slug', element: withSuspense(<CoursePage />) },
      { path: ROUTES.verifyCertificate, element: withSuspense(<VerifyCertificatePage />) },
      { path: '/verify/:code', element: withSuspense(<VerifyCertificatePage />) },

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
