/**
 * BSDC — src/app/layouts/RootLayout.tsx
 * Purpose : The application shell: header, main region, footer and bottom navigation
 *           (PART 08.05, PART 08.04 R-04).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Route changes are announced to screen readers and scroll is restored to the top; the
 *           main region is the skip-link target and carries a stable id so tests can find it.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { lazy, Suspense, useEffect, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { TopBar } from '@/widgets/header/TopBar';
import { SiteFooter } from '@/widgets/footer/SiteFooter';
import { BottomNavWidget } from '@/widgets/mobile-nav/BottomNavWidget';
import { useBadgeStore } from '@/shared/stores/badges';
import { RouteErrorBoundary } from '../boundaries/RouteErrorBoundary';
import { useAnnounce } from '@/shared/hooks';
import { emit } from '@/core/events/bus';

/**
 * Badge synchronisation lives behind a lazy boundary so the shell paints without the messenger
 * and notification modules in the initial bundle.
 */
const BadgeSync = lazy(async () => ({
  default: (await import('@/widgets/shell/BadgeSync')).BadgeSync,
}));

/**
 * The command palette host: lazily loaded, and the only component that owns the Ctrl/Cmd+K
 * shortcut, so it cannot be registered twice.
 */
const CommandPaletteHost = lazy(async () => ({
  default: (await import('@/widgets/shell/CommandPaletteHost')).CommandPaletteHost,
}));

/**
 * Renders the application shell around the active route.
 * @returns the shell layout
 */
export function RootLayout(): React.ReactElement {
  const location = useLocation();
  const announce = useAnnounce();
  // Badge counts are written by a lazily loaded component, so the shell paints without the
  // messenger and notification modules in the initial bundle. Each value is selected separately:
  // a selector that builds a new object on every call would re-render the shell forever.
  const badgeMessages = useBadgeStore((state) => state.messages);
  const badgeNotifications = useBadgeStore((state) => state.notifications);
  const counts = useMemo(
    () => ({ messages: badgeMessages, notifications: badgeNotifications }),
    [badgeMessages, badgeNotifications],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    emit('route:changed', { path: location.pathname });
    announce(document.title, false);
  }, [location.pathname, announce]);

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <a className="bsdc-skip-link" href="#main-content">
        Skip to content
      </a>
      <TopBar />
      <div className="bsdc-app-shell flex-1">
        <main id="main-content" className="bsdc-app-shell__main min-w-0">
          <RouteErrorBoundary>
            <Outlet />
          </RouteErrorBoundary>
        </main>
      </div>
      <SiteFooter />
      <BottomNavWidget counts={counts} />
      <Suspense fallback={null}>
        <BadgeSync />
      </Suspense>
      <Suspense fallback={null}>
        <CommandPaletteHost />
      </Suspense>
    </div>
  );
}
