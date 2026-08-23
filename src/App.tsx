/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { MainLayout } from '@/components/layout/MainLayout';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { FullPageLoader } from '@/components/ui/Skeleton';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { CommandPalette, ShortcutsDialog } from '@/components/search/CommandPalette';
import { useAuthBootstrap } from '@/hooks/useAuth';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import type { UserRole } from '@/types/user';
import { roleAtLeast } from '@/types/user';

const Home = lazy(() => import('@/pages/Home'));
const Login = lazy(() => import('@/pages/auth/Login'));
const Register = lazy(() => import('@/pages/auth/Register'));
const ForgotPassword = lazy(() => import('@/pages/auth/PasswordFlows').then((m) => ({ default: m.ForgotPassword })));
const VerifyEmail = lazy(() => import('@/pages/auth/PasswordFlows').then((m) => ({ default: m.VerifyEmail })));
const Profile = lazy(() => import('@/pages/Profile'));
const SettingsPage = lazy(() => import('@/pages/Settings'));
const Messages = lazy(() => import('@/pages/Messages'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const SearchPage = lazy(() => import('@/pages/Search'));
const CreatePost = lazy(() => import('@/pages/Create'));
const Bookmarks = lazy(() => import('@/pages/Bookmarks'));
const Groups = lazy(() => import('@/pages/Groups'));
const GroupDetail = lazy(() => import('@/pages/GroupDetail'));
const Marketplace = lazy(() => import('@/pages/Marketplace'));
const Leaderboard = lazy(() => import('@/pages/Leaderboard'));
const Events = lazy(() => import('@/pages/Events'));
const PointsWallet = lazy(() => import('@/pages/Points'));
const CreatorProgram = lazy(() => import('@/pages/CreatorProgram'));
const LicenseHome = lazy(() => import('@/pages/License').then((m) => ({ default: m.LicenseHome })));
const LicenseVerify = lazy(() => import('@/pages/License').then((m) => ({ default: m.LicenseVerify })));
const MarketplaceListing = lazy(() => import('@/pages/Marketplace').then((m) => ({ default: m.MarketplaceListingPage })));
const Branding = lazy(() => import('@/pages/Branding'));

import {
  ExplorePage, TrendingPage, BlogPage, QaPage, SnippetsPage, DocsPage, WikiPage,
  ProjectsPage, JobsPage, NoticesPage,
} from '@/pages/CategoryPage';
import {
  About, Contact, Terms, Privacy, Guidelines, TagPage, ReportPage, NotFound, OfflinePage, ServerError,
} from '@/pages/Static';
import { PostDetailPage } from '@/components/post/PostDetail';

const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'));
const AdminUsers = lazy(() => import('@/pages/admin/Users'));
import {
  AdminContent, AdminModeration, AdminLicenses, AdminCreators, AdminMarketplace, ModHome,
} from '@/pages/admin/Content';
import {
  AdminAnalytics, AdminPdfReports, AdminAds, AdminBroadcast, AdminLogs, AdminDatabase,
  AdminSettings, AdminLaunch,
} from '@/pages/admin/System';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
});

/* -------------------------------------------------------------- guards */

function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <FullPageLoader />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const stage = useAuthStore((s) => s.stage);
  const location = useLocation();
  if (stage === 'loading') return <FullScreenLoader />;
  if (stage === 'signedOut') return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (stage === 'needsVerification') return <Navigate to="/verify-email" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const stage = useAuthStore((s) => s.stage);
  if (stage === 'loading') return <FullScreenLoader />;
  if (stage === 'ready' || stage === 'needsVerification') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RequireRole({ min, children }: { min: UserRole; children: ReactNode }) {
  const stage = useAuthStore((s) => s.stage);
  const profile = useAuthStore((s) => s.profile);
  if (stage === 'loading') return <FullScreenLoader />;
  if (stage === 'signedOut') return <Navigate to="/login" replace />;
  if (!profile || !roleAtLeast(profile.role, min)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Maintenance-mode gate — admins pass through, everyone else sees the notice. */
function MaintenanceGate({ children }: { children: ReactNode }) {
  const settings = useUIStore((s) => s.systemSettings);
  const profile = useAuthStore((s) => s.profile);
  if (settings.maintenanceMode && !roleAtLeast(profile?.role || 'user', 'manager')) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-extrabold">BSDC is under maintenance</h1>
        <p className="max-w-md text-sm text-neutral-500 dark:text-neutral-400">
          {settings.maintenanceMessage || 'We are upgrading the platform. The Pride of Bangladesh will be back shortly.'}
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

/* ------------------------------------------------------------- shortcuts */

function GlobalShortcuts() {
  useKeyboardShortcuts();
  return null;
}

/* ------------------------------------------------------------------ app */

export default function App() {
  useAuthBootstrap();

  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    sw.addEventListener('message', (event) => {
      if ((event as MessageEvent).data?.type === 'SKIP_WAITING') void sw.getRegistration()?.then((r) => r?.update());
    });
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <BrowserRouter>
            <GlobalShortcuts />
            <CommandPalette />
            <ShortcutsDialog />
            <Toaster
              position="top-center"
              richColors
              toastOptions={{ className: 'rounded-xl' }}
            />
            <MaintenanceGate>
              <Suspense fallback={<FullScreenLoader />}>
                <Routes>
                  <Route element={<MainLayout />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/explore" element={<ExplorePage />} />
                    <Route path="/trending" element={<TrendingPage />} />
                    <Route path="/blog" element={<BlogPage />} />
                    <Route path="/qa" element={<QaPage />} />
                    <Route path="/snippets" element={<SnippetsPage />} />
                    <Route path="/docs" element={<DocsPage />} />
                    <Route path="/wiki" element={<WikiPage />} />
                    <Route path="/projects" element={<ProjectsPage />} />
                    <Route path="/jobs" element={<JobsPage />} />
                    <Route path="/notices" element={<NoticesPage />} />
                    <Route path="/blog/:slug" element={<PostDetailPage />} />
                    <Route path="/qa/:slug" element={<PostDetailPage />} />
                    <Route path="/snippet/:slug" element={<PostDetailPage />} />
                    <Route path="/docs/:slug" element={<PostDetailPage />} />
                    <Route path="/wiki/:slug" element={<PostDetailPage />} />
                    <Route path="/project/:slug" element={<PostDetailPage />} />
                    <Route path="/job/:slug" element={<PostDetailPage />} />
                    <Route path="/notice/:slug" element={<PostDetailPage />} />
                    <Route path="/post/:slug" element={<PostDetailPage />} />
                    <Route path="/p/:username" element={<Profile />} />
                    <Route path="/tag/:tag" element={<TagPage />} />
                    <Route path="/groups" element={<Groups />} />
                    <Route path="/g/:slug" element={<GroupDetail />} />
                    <Route path="/marketplace" element={<Marketplace />} />
                    <Route path="/marketplace/:listingId" element={<MarketplaceListing />} />
                    <Route path="/events" element={<Events />} />
                    <Route path="/leaderboard" element={<Leaderboard />} />
                    <Route path="/license" element={<LicenseHome />} />
                    <Route path="/license/verify" element={<LicenseVerify />} />
                    <Route path="/license/verify/:licenseId" element={<LicenseVerify />} />
                    <Route path="/directory" element={<LicenseHome />} />
                    <Route path="/creator-program" element={<CreatorProgram />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/terms" element={<Terms />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="/guidelines" element={<Guidelines />} />
                    <Route path="/branding" element={<Branding />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/report" element={<ReportPage />} />
                    <Route path="/offline" element={<OfflinePage />} />
                    <Route path="/500" element={<ServerError />} />
                    <Route
                      path="/create"
                      element={
                        <RequireAuth>
                          <CreatePost />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/messages"
                      element={
                        <RequireAuth>
                          <Messages />
                        </RequireAuth>
                      }
                    />
                    <Route path="/messages/:chatId" element={<RequireAuth><Messages /></RequireAuth>} />
                    <Route
                      path="/notifications"
                      element={
                        <RequireAuth>
                          <Notifications />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/bookmarks"
                      element={
                        <RequireAuth>
                          <Bookmarks />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/points"
                      element={
                        <RequireAuth>
                          <PointsWallet />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/settings"
                      element={
                        <RequireAuth>
                          <SettingsPage />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/settings/profile"
                      element={
                        <RequireAuth>
                          <Navigate to="/settings" replace />
                        </RequireAuth>
                      }
                    />
                    <Route path="*" element={<NotFound />} />
                  </Route>

                  <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
                  <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/verify-email" element={<VerifyEmail />} />

                  <Route
                    path="/admin"
                    element={
                      <RequireRole min="admin">
                        <AdminLayout mode="admin" />
                      </RequireRole>
                    }
                  >
                    <Route index element={<AdminDashboard />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="content" element={<AdminContent />} />
                    <Route path="moderation" element={<AdminModeration />} />
                    <Route path="analytics" element={<AdminAnalytics />} />
                    <Route path="reports-pdf" element={<AdminPdfReports />} />
                    <Route path="ads" element={<AdminAds />} />
                    <Route path="licenses" element={<AdminLicenses />} />
                    <Route path="creators" element={<AdminCreators />} />
                    <Route path="marketplace" element={<AdminMarketplace />} />
                    <Route path="broadcast" element={<AdminBroadcast />} />
                    <Route path="logs" element={<AdminLogs />} />
                    <Route path="database" element={<AdminDatabase />} />
                    <Route path="settings" element={<AdminSettings />} />
                    <Route path="launch" element={<AdminLaunch />} />
                  </Route>

                  <Route
                    path="/mod"
                    element={
                      <RequireRole min="moderator">
                        <AdminLayout mode="mod" />
                      </RequireRole>
                    }
                  >
                    <Route index element={<ModHome />} />
                  </Route>
                </Routes>
              </Suspense>
            </MaintenanceGate>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
