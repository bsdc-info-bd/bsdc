import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { meetsRole, useSession } from '../data/session';
import { accessiblePortals, portalById, resolvePortalHref } from '../domain/portals';
import { roleRank } from '../domain/staff';
import { PortalRail } from './PortalRail';
import { BrandMark, MenuIcon, SearchIcon, SunMoonIcon } from './icons';
import { Banner, Button, Card, Field, Loading } from './primitives';
import type { CommandPaletteAction } from './CommandPalette';

const LazyCommandPalette = lazy(() => import('./CommandPalette'));

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => [...part][0] ?? '')
    .join('')
    .toUpperCase();
}

export type ThemeMode = 'system' | 'dark' | 'light';
const THEME_STORAGE_KEY = 'bsdc-console-theme';

function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw === 'dark' || raw === 'light' ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function useThemePreference(): {
  readonly theme: ThemeMode;
  readonly cycleTheme: () => void;
} {
  const [theme, setTheme] = useState<ThemeMode>(readStoredTheme);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* Storage may be blocked in strict browsing contexts. */
    }
  }, [theme]);

  const cycleTheme = (): void => {
    setTheme((prev) => (prev === 'system' ? 'dark' : prev === 'dark' ? 'light' : 'system'));
  };

  return { theme, cycleTheme };
}

export type ConsoleTab = {
  readonly id: string;
  readonly label: string;
  readonly badge?: string | number | undefined;
  readonly render: () => ReactNode;
};

/**
 * Cyber-corporate production shell shared by every BSDC administrative console:
 * - Zero-trust auth gate: confirms role from live Postgres before rendering tabs
 * - Persistent federated PortalRail linking all 14 consoles seamlessly
 * - Lazy-loaded Cmd/Ctrl+K CommandPalette across portals & active tabs
 * - Two-key sequence shortcuts (e.g. g+a, g+m, g+e, g+n)
 * - Persistent light/dark/system theme switcher & mobile drawer
 */
export function AppShell({
  tabs,
  minRole,
  note,
  activeTabId,
  onTabChange,
  headerActions,
  commandActions = [],
}: {
  readonly tabs: readonly ConsoleTab[];
  readonly minRole: string;
  readonly note?: string | undefined;
  readonly activeTabId?: string | undefined;
  readonly onTabChange?: ((tabId: string) => void) | undefined;
  readonly headerActions?: ReactNode | undefined;
  readonly commandActions?: readonly CommandPaletteAction[] | undefined;
}): ReactElement {
  const { env, state, signOut } = useSession();
  const [internalTabId, setInternalTabId] = useState(tabs[0]?.id ?? '');
  const resolvedTabId = activeTabId ?? internalTabId;
  const setTabId = (id: string): void => {
    if (onTabChange) onTabChange(id);
    else setInternalTabId(id);
  };
  const active = tabs.find((tab) => tab.id === resolvedTabId) ?? tabs[0];

  const profile = state.status === 'authenticated' ? state.profile : null;
  const allowed = meetsRole(profile, minRole);

  const [railOpen, setRailOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { theme, cycleTheme } = useThemePreference();

  const localActions = useMemo<CommandPaletteAction[]>(() => {
    const tabActions = tabs.map((tab) => ({
      id: `tab:${tab.id}`,
      label: `Open tab: ${tab.label}`,
      section: env.appName,
      onSelect: () => setTabId(tab.id),
    }));
    return [...tabActions, ...commandActions];
  }, [tabs, commandActions, env.appName]);

  useEffect(() => {
    let chordTimer: number | null = null;
    let pendingG = false;

    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const editing =
        target !== null &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }

      if (editing || event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === 'g' && !pendingG) {
        pendingG = true;
        chordTimer = window.setTimeout(() => {
          pendingG = false;
        }, 900);
        return;
      }

      if (pendingG) {
        pendingG = false;
        if (chordTimer !== null) window.clearTimeout(chordTimer);
        const match = accessiblePortals(profile?.role).find(
          (portal) => portal.shortcut === `g ${key}`,
        );
        if (match && match.id !== env.appId) {
          event.preventDefault();
          window.location.assign(resolvePortalHref(match));
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      if (chordTimer !== null) window.clearTimeout(chordTimer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [profile?.role, env.appId]);

  const currentPortal = portalById(env.appId);

  return (
    <div className="kit-shell">
      <a className="kit-skip" href="#kit-main-content">
        Skip to console workspace
      </a>

      <header className="kit-header">
        <div className="kit-header-left">
          <button
            type="button"
            className="kit-icon-btn kit-mobile-menu-btn"
            aria-label="Open portal switcher"
            aria-expanded={railOpen}
            onClick={() => setRailOpen((v) => !v)}
          >
            <MenuIcon size={18} />
          </button>
          <div className="kit-brand-mark" aria-hidden="true">
            <BrandMark size={20} />
          </div>
          <div className="kit-brand">
            <strong>{env.appName}</strong>
            <span>
              BSDC Corporate{' '}
              {currentPortal ? `· ${currentPortal.minRole.toUpperCase()} CLEARANCE` : ''}
            </span>
          </div>
        </div>

        <div className="kit-header-tools">
          {profile && allowed && (
            <button
              type="button"
              className="kit-palette-trigger"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open quick switcher and commands"
            >
              <SearchIcon size={14} />
              <span>Switch portal or command</span>
              <kbd className="kit-kbd">Ctrl+K</kbd>
            </button>
          )}
          {headerActions}
          <button
            type="button"
            className="kit-icon-btn"
            onClick={cycleTheme}
            title={`Theme: ${theme} (click to cycle)`}
            aria-label={`Theme mode: ${theme}`}
          >
            <SunMoonIcon size={16} />
          </button>
          {profile && (
            <div className="kit-who">
              {profile.avatarUrl.length > 0 ? (
                <img
                  src={profile.avatarUrl}
                  alt=""
                  width={28}
                  height={28}
                  loading="lazy"
                  decoding="async"
                  className="kit-avatar"
                />
              ) : (
                <span className="kit-avatar kit-avatar-initials" aria-hidden="true">
                  {initialsOf(profile.displayName)}
                </span>
              )}
              <div className="kit-who-meta">
                <strong>{profile.displayName}</strong>
                <span className="kit-role-chip">{profile.role}</span>
              </div>
              <Button
                variant="quiet"
                size="small"
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

      <div className="kit-workspace">
        {profile && allowed && (
          <PortalRail
            currentAppId={env.appId}
            userRole={profile.role}
            openMobile={railOpen}
            onCloseMobile={() => setRailOpen(false)}
          />
        )}

        <div className="kit-content-col">
          {profile && allowed && (
            <nav className="kit-subnav" aria-label="Console sections">
              <ul className="kit-nav">
                {tabs.map((tab) => (
                  <li key={tab.id}>
                    <button
                      type="button"
                      onClick={() => setTabId(tab.id)}
                      aria-current={tab.id === active?.id ? 'page' : undefined}
                    >
                      <span>{tab.label}</span>
                      {tab.badge !== undefined && (
                        <span className="kit-nav-count">{tab.badge}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <main id="kit-main-content" className="kit-main">
            <Gate minRole={minRole} note={note}>
              {active ? active.render() : null}
            </Gate>
          </main>

          <footer className="kit-footer">
            <span>
              BSDC Corporate Network · Zero-trust Firebase + Postgres RLS · Every privileged action
              is recorded to the immutable audit ledger.
            </span>
          </footer>
        </div>
      </div>

      {paletteOpen && (
        <Suspense fallback={null}>
          <LazyCommandPalette
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            currentAppId={env.appId}
            userRole={profile?.role ?? null}
            localActions={localActions}
          />
        </Suspense>
      )}
    </div>
  );
}

function Gate({
  minRole,
  note,
  children,
}: {
  readonly minRole: string;
  readonly note: string | undefined;
  readonly children: ReactNode;
}): ReactElement {
  const { state, signOut } = useSession();

  if (state.status === 'configuring') {
    return (
      <Banner tone="bad" title="This console is not configured">
        <p className="kit-small">
          The deployment is missing: <span className="kit-mono">{state.missing.join(', ')}</span>.
          Add the values to the Cloudflare Pages project and redeploy.
        </p>
      </Banner>
    );
  }

  if (state.status === 'loading') return <Loading label="Verifying corporate clearance." />;
  if (state.status === 'anonymous') return <SignInForm note={note} />;
  if (state.status === 'error') {
    return (
      <div className="kit-stack">
        <Banner tone="bad" title="Sign in failed">
          <p className="kit-small">{state.message}</p>
        </Banner>
        <SignInForm note={note} />
      </div>
    );
  }

  if (!meetsRole(state.profile, minRole)) {
    return (
      <div className="kit-stack">
        <Banner tone="warn" title="Insufficient clearance for this console">
          <p className="kit-small">
            This console requires <strong>{minRole}</strong> clearance or higher. You are signed in
            as <strong>{state.profile.role}</strong> (rank {roleRank(state.profile.role)} of 7).
          </p>
          <p className="kit-small">
            A rank is granted by somebody who already outranks you in the User Governance console.
            If bootstrapping a new deployment, verify your address in{' '}
            <span className="kit-mono">BSDC2_OWNER_UIDS</span> or{' '}
            <span className="kit-mono">BSDC_BOOTSTRAP_OWNER_EMAILS</span> and sign in fresh.
          </p>
        </Banner>
        <div>
          <Button
            type="button"
            onClick={() => {
              void signOut();
            }}
          >
            Sign in with another account
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function SignInForm({ note }: { readonly note: string | undefined }): ReactElement {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div style={{ maxWidth: '28rem', margin: 'var(--sp-5) auto' }}>
      <Card
        title="Corporate Authentication"
        description={note ?? 'Sign in using your corporate staff identity (bsdc-second).'}
      >
        <form
          className="kit-stack"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            void signIn(email, password)
              .catch(() => undefined)
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          <Field
            label="Corporate email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
          <Button type="submit" disabled={busy || email === '' || password === ''}>
            {busy ? 'Authenticating' : 'Authenticate'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
