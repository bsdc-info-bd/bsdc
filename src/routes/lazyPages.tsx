import { lazy, Suspense } from 'react';
import { LoadingState } from '@/components/ui';

// Lazy loaded pages
export const HomePage = lazy(() => import('@/features/feed/pages/HomePage'));
export const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
export const RegisterPage = lazy(() => import('@/features/auth/pages/RegisterPage'));
export const ForgotPasswordPage = lazy(() => import('@/features/auth/pages/ForgotPasswordPage'));
export const ProfilePage = lazy(() => import('@/features/profiles/pages/ProfilePage'));
export const FeedPage = lazy(() => import('@/features/feed/pages/FeedPage'));
export const ExplorePage = lazy(() => import('@/features/feed/pages/ExplorePage'));
export const TrendingPage = lazy(() => import('@/features/feed/pages/TrendingPage'));
export const SearchPage = lazy(() => import('@/features/search/pages/SearchPage'));
export const NotificationsPage = lazy(() => import('@/features/notifications/pages/NotificationsPage'));
export const MessagesPage = lazy(() => import('@/features/messaging/pages/MessagesPage'));
export const SettingsPage = lazy(() => import('@/features/auth/pages/SettingsPage'));
export const BookmarksPage = lazy(() => import('@/features/feed/pages/BookmarksPage'));
export const PostDetailPage = lazy(() => import('@/features/posts/pages/PostDetailPage'));
export const CreatePostPage = lazy(() => import('@/features/posts/pages/CreatePostPage'));
export const GroupsPage = lazy(() => import('@/features/groups/pages/GroupsPage'));
export const JobsPage = lazy(() => import('@/features/jobs/pages/JobsPage'));
export const MarketplacePage = lazy(() => import('@/features/marketplace/pages/MarketplacePage'));
export const ProjectsPage = lazy(() => import('@/features/projects/pages/ProjectsPage'));
export const OrganizationsPage = lazy(() => import('@/features/organizations/pages/OrganizationsPage'));
export const EventsPage = lazy(() => import('@/features/events/pages/EventsPage'));
export const AdminPage = lazy(() => import('@/features/admin/pages/AdminPage'));
export const LicenseVerifyPage = lazy(() => import('@/features/licenses/pages/LicenseVerifyPage'));
export const NotFoundPage = lazy(() => import('@/features/feed/pages/NotFoundPage'));

export function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LoadingState message="Loading page..." className="min-h-[50vh]" />}>
      {children}
    </Suspense>
  );
}
