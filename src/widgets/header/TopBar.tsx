/**
 * BSDC — src/widgets/header/TopBar.tsx
 * Purpose : The application header: brand, search entry, theme, language and account actions
 *           (PART 08.05, PART 09.01).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The brand links to "/" with a real anchor so crawlers and middle-click both work
 *           (PART 10.10 rule 3). Search collapses to an icon below 360px (mobile-250.css).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { emit } from '@/core/events/bus';
import { BottomNav } from '@/shared/ui/BottomNav';
import { BrandLogo } from '@/shared/ui/BrandLogo';
import { bottomNavItems } from '@/core/config/navigation';
import { useBreakpoint } from '@/shared/hooks';
import { liveRoutes } from '@/core/config/routes';
import { ThemeToggle } from './ThemeToggle';
import { LocaleSwitcher } from './LocaleSwitcher';
import { AccountMenu } from './AccountMenu';

/** Props for the TopBar component. */
export interface TopBarProps {
  /** Renders the compact mobile layout. */
  readonly compact?: boolean | undefined;
}

/**
 * Renders the application header.
 * @param props component props
 * @returns a header element
 */
export function TopBar({ compact = false }: TopBarProps): React.ReactElement {
  const { t } = useTranslation(['nav', 'common']);
  const { navigationModel } = useBreakpoint();
  const livePaths = new Set(liveRoutes().map((route) => route.path));
  const items = bottomNavItems().filter((item) => livePaths.has(item.to));
  const labels: Record<string, string> = {};
  for (const item of items) labels[item.id] = t(item.labelKey, { ns: 'nav' });

  return (
    <>
      <header className="bsdc-top-bar">
        <Link to="/" className="flex items-center gap-2" aria-label={t('home', { ns: 'nav' })}>
          <BrandLogo variant={compact ? 'icon' : 'horizontal'} height={compact ? 28 : 30} />
        </Link>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="bsdc-top-bar__search"
            aria-label={t('search', { ns: 'nav' })}
            aria-keyshortcuts="Control+K Meta+K"
            onClick={() => emit('palette:open', { source: 'top-bar' })}
          >
            <span className="flex h-9 min-w-9 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                <path
                  d="m20 20-3.5-3.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </button>
          <LocaleSwitcher />
          <ThemeToggle />
          <AccountMenu />
        </div>
      </header>
      {navigationModel === 'bottom' && <BottomNav items={items} labels={labels} />}
    </>
  );
}
