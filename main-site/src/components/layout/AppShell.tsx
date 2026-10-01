import { Outlet, ScrollRestoration } from 'react-router-dom';
import { Toaster } from '@/design-system';
import { useCommandPaletteHotkey } from '@/hooks/use-command-palette-hotkey';
import { useSystemThemeSync } from '@/hooks/use-system-theme-sync';
import { AppBar } from './AppBar';
import { BottomNav } from './BottomNav';
import { CommandPalette } from './CommandPalette';
import { Footer } from './Footer';
import { OfflineBanner } from './OfflineBanner';
import { RouteProgress } from './RouteProgress';
import { SkipLink } from './SkipLink';

/**
 * The application shell: skip link, app bar, route progress, offline banner,
 * main region, footer, mobile tab bar, command palette and toasts.
 * Bottom padding reserves space for the mobile tab bar so content never hides.
 */
export function AppShell() {
  useCommandPaletteHotkey();
  useSystemThemeSync();

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SkipLink />
      <RouteProgress />
      <OfflineBanner />
      <AppBar />
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 pb-[calc(var(--bsdc-bottom-nav-h)+1rem)] md:pb-6"
      >
        <Outlet />
      </main>
      <Footer />
      <BottomNav />
      <CommandPalette />
      <Toaster />
      <ScrollRestoration />
    </div>
  );
}
