import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout, AuthLayout, FullWidthLayout } from '@/components/layout';
import {
  HomePage, LoginPage, RegisterPage, ForgotPasswordPage,
  ProfilePage, FeedPage, ExplorePage, TrendingPage,
  SearchPage, NotificationsPage, MessagesPage, SettingsPage,
  BookmarksPage, PostDetailPage, CreatePostPage,
  GroupsPage, JobsPage, MarketplacePage, ProjectsPage,
  OrganizationsPage, EventsPage, AdminPage, LicenseVerifyPage,
  NotFoundPage, LazyPage,
} from './lazyPages';

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <LazyPage><HomePage /></LazyPage>,
      },
      {
        path: 'feed',
        element: <LazyPage><FeedPage /></LazyPage>,
      },
      {
        path: 'explore',
        element: <LazyPage><ExplorePage /></LazyPage>,
      },
      {
        path: 'trending',
        element: <LazyPage><TrendingPage /></LazyPage>,
      },
      {
        path: 'search',
        element: <LazyPage><SearchPage /></LazyPage>,
      },
      {
        path: 'notifications',
        element: <LazyPage><NotificationsPage /></LazyPage>,
      },
      {
        path: 'messages',
        element: <LazyPage><MessagesPage /></LazyPage>,
      },
      {
        path: 'messages/:conversationId',
        element: <LazyPage><MessagesPage /></LazyPage>,
      },
      {
        path: 'bookmarks',
        element: <LazyPage><BookmarksPage /></LazyPage>,
      },
      {
        path: 'settings',
        element: <LazyPage><SettingsPage /></LazyPage>,
      },
      {
        path: 'create',
        element: <LazyPage><CreatePostPage /></LazyPage>,
      },
      {
        path: 'groups',
        element: <LazyPage><GroupsPage /></LazyPage>,
      },
      {
        path: 'groups/:slug',
        element: <LazyPage><GroupsPage /></LazyPage>,
      },
      {
        path: 'jobs',
        element: <LazyPage><JobsPage /></LazyPage>,
      },
      {
        path: 'jobs/:slug',
        element: <LazyPage><JobsPage /></LazyPage>,
      },
      {
        path: 'marketplace',
        element: <LazyPage><MarketplacePage /></LazyPage>,
      },
      {
        path: 'marketplace/:slug',
        element: <LazyPage><MarketplacePage /></LazyPage>,
      },
      {
        path: 'projects',
        element: <LazyPage><ProjectsPage /></LazyPage>,
      },
      {
        path: 'projects/:slug',
        element: <LazyPage><ProjectsPage /></LazyPage>,
      },
      {
        path: 'organizations',
        element: <LazyPage><OrganizationsPage /></LazyPage>,
      },
      {
        path: 'organizations/:slug',
        element: <LazyPage><OrganizationsPage /></LazyPage>,
      },
      {
        path: 'events',
        element: <LazyPage><EventsPage /></LazyPage>,
      },
      {
        path: 'events/:slug',
        element: <LazyPage><EventsPage /></LazyPage>,
      },
      {
        path: 'admin',
        element: <LazyPage><AdminPage /></LazyPage>,
      },
      {
        path: 'admin/*',
        element: <LazyPage><AdminPage /></LazyPage>,
      },
    ],
  },
  {
    element: <AuthLayout />,
    children: [
      {
        path: 'login',
        element: <LazyPage><LoginPage /></LazyPage>,
      },
      {
        path: 'register',
        element: <LazyPage><RegisterPage /></LazyPage>,
      },
      {
        path: 'forgot-password',
        element: <LazyPage><ForgotPasswordPage /></LazyPage>,
      },
    ],
  },
  {
    element: <FullWidthLayout />,
    children: [
      // Post type routes
      ...['article', 'blog', 'question', 'snippet', 'showcase', 'tutorial',
        'poll', 'story', 'announcement', 'link', 'changelog', 'release',
        'resource', 'opensource', 'hiring', 'achievement', 'journal', 'text', 'image'
      ].map((type) => ({
        path: `${type}/:slug`,
        element: <LazyPage><PostDetailPage /></LazyPage>,
      })),
    ],
  },
  // Profile route
  {
    path: '/@:username',
    element: (
      <AppLayout />
    ),
    children: [
      {
        index: true,
        element: <LazyPage><ProfilePage /></LazyPage>,
      },
    ],
  },
  // License verification
  {
    path: '/verify/license/:id',
    element: <LazyPage><LicenseVerifyPage /></LazyPage>,
  },
  // Report verification
  {
    path: '/reports/verify/:id',
    element: <LazyPage><NotFoundPage /></LazyPage>,
  },
  // Legal pages
  {
    path: '/terms',
    element: <div className="pt-20 container-narrow"><h1 className="text-2xl font-bold">Terms of Service</h1><p className="mt-4 text-gray-500">Configurable by admin.</p></div>,
  },
  {
    path: '/privacy',
    element: <div className="pt-20 container-narrow"><h1 className="text-2xl font-bold">Privacy Policy</h1><p className="mt-4 text-gray-500">Configurable by admin.</p></div>,
  },
  {
    path: '/guidelines',
    element: <div className="pt-20 container-narrow"><h1 className="text-2xl font-bold">Community Guidelines</h1><p className="mt-4 text-gray-500">Configurable by admin.</p></div>,
  },
  // Redirects
  {
    path: '/home',
    element: <Navigate to="/" replace />,
  },
  // 404
  {
    path: '*',
    element: <LazyPage><NotFoundPage /></LazyPage>,
  },
]);
