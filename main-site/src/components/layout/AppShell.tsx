import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { VerifyEmailBanner } from '@/components/auth/VerifyEmailBanner';
import { Toaster } from '@/design-system';
import { cn } from '@/lib/cn';
import { chromeFor } from '@/lib/layout/chrome';
import { useCommandPaletteHotkey } from '@/hooks/use-command-palette-hotkey';
import { usePublishPresence } from '@/hooks/use-presence';
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
 *
 * Not every route gets all of it. `chromeFor` decides, and a conversation
 * thread is the route that asks for none: it is a room with its own header,
 * its own scrolling and its own composer, and the site's furniture around it
 * is what makes a chat on a phone feel like a web page that happens to have a
 * chat in it.
 */
export function AppShell() {
  useCommandPaletteHotkey();
  usePublishPresence();
  useSystemThemeSync();
  const chrome = chromeFor(useLocation().pathname);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SkipLink />
      <RouteProgress />
      <OfflineBanner />
      {chrome.appBar ? <AppBar /> : null}
      <VerifyEmailBanner />
      <main
        id="main"
        tabIndex={-1}
        className={cn(
          'flex-1',
          chrome.tabBarPadding
            ? 'pb-[calc(var(--bsdc-bottom-nav-h)+1rem)] md:pb-6'
            : 'min-h-0 pb-0',
        )}
      >
        <Outlet />
      </main>
      {chrome.footer ? <Footer /> : null}
      {chrome.bottomNav ? <BottomNav /> : null}
      <CommandPalette />
      <Toaster />
      <ScrollRestoration />
    </div>
  );
}
