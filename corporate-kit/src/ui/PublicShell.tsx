import { Suspense, lazy, useState, type ReactElement, type ReactNode } from 'react';
import { useSession } from '../data/session';
import { useThemePreference } from './AppShell';
import { PortalFederationStrip } from './PortalRail';
import { BrandMark, SearchIcon, SunMoonIcon } from './icons';
import { Button } from './primitives';

const LazyCommandPalette = lazy(() => import('./CommandPalette'));

/**
 * Shared frame for public trust desks (`status-site`, `vf-site`) so they
 * share the cyber-corporate design language, theme switcher, skip link,
 * and cross-portal transport bar without blocking on staff sign-in.
 */
export function PublicShell({
  appId,
  title,
  subtitle = 'Bangladesh Software Development Community',
  footerText,
  children,
}: {
  readonly appId: string;
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly footerText: string;
  readonly children: ReactNode;
}): ReactElement {
  const { state, signOut } = useSession();
  const { theme, cycleTheme } = useThemePreference();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const profile = state.status === 'authenticated' ? state.profile : null;

  return (
    <div className="kit-shell">
      <a className="kit-skip" href="#kit-main-content">
        Skip to content
      </a>

      <header className="kit-header">
        <div className="kit-header-left">
          <div className="kit-brand-mark" aria-hidden="true">
            <BrandMark size={20} />
          </div>
          <div className="kit-brand">
            <strong>{title}</strong>
            <span>{subtitle}</span>
          </div>
        </div>

        <div className="kit-header-tools">
          <button
            type="button"
            className="kit-palette-trigger"
            onClick={() => setPaletteOpen(true)}
            aria-label="Open portal switcher"
          >
            <SearchIcon size={14} />
            <span>Portals</span>
            <kbd className="kit-kbd">Ctrl+K</kbd>
          </button>

          <button
            type="button"
            className="kit-icon-btn"
            onClick={cycleTheme}
            title={`Theme: ${theme}`}
            aria-label={`Theme mode: ${theme}`}
          >
            <SunMoonIcon size={16} />
          </button>

          {profile && (
            <div className="kit-who">
              <div className="kit-who-meta">
                <strong>{profile.displayName}</strong>
                <span className="kit-role-chip">{profile.role}</span>
              </div>
              <Button
                size="small"
                variant="quiet"
                onClick={() => {
                  void signOut();
                }}
              >
                Sign out
              </Button>
            </div>
          )}
        </div>
      </header>

      <div className="kit-public-strip">
        <PortalFederationStrip currentAppId={appId} userRole={profile?.role ?? null} />
      </div>

      <main id="kit-main-content" className="kit-main">
        {children}
      </main>

      <footer className="kit-footer">{footerText}</footer>

      {paletteOpen && (
        <Suspense fallback={null}>
          <LazyCommandPalette
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            currentAppId={appId}
            userRole={profile?.role ?? null}
          />
        </Suspense>
      )}
    </div>
  );
}
