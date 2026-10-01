import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router-dom';
import { IconButton, LanguageToggle, Logo, ThemeToggle } from '@/design-system';
import { cn } from '@/lib/cn';
import { ROUTES } from '@/lib/site';
import { useUiStore } from '@/store/ui-store';

const NAV_ITEMS = [
  { to: ROUTES.home, labelKey: 'nav.home' },
  { to: ROUTES.about, labelKey: 'nav.about' },
  { to: ROUTES.guidelines, labelKey: 'nav.guidelines' },
  { to: ROUTES.contact, labelKey: 'nav.contact' },
] as const;

/** Sticky translucent application bar, 56px on mobile and 64px from 1440px. */
export function AppBar() {
  const { t } = useTranslation();
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);

  return (
    <header className="bsdc-app-bar fab-glass fab-safe-top">
      <div className="fab-container flex h-app-bar items-center gap-1 sm:gap-2">
        <Link
          to={ROUTES.home}
          className="fab-tap flex shrink-0 items-center rounded-lg px-1"
          aria-label={t('common.brandFull')}
        >
          <Logo variant="mark" className="h-8 w-8 sm:hidden" title={t('common.brand')} />
          <Logo variant="full" className="hidden h-9 sm:block" title={t('common.brandFull')} />
        </Link>

        <nav
          aria-label={t('a11y.primaryNavigation')}
          className="ms-2 hidden min-w-0 flex-1 md:block"
        >
          <ul className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === ROUTES.home}
                  className={({ isActive }) =>
                    cn(
                      'fab-tap inline-flex h-10 items-center rounded-lg px-3 text-sm font-semibold transition-colors',
                      isActive ? 'bg-surface-2 text-green-700' : 'text-muted hover:text-text',
                    )
                  }
                >
                  {t(item.labelKey)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ms-auto flex items-center gap-0.5">
          <IconButton
            label={t('a11y.openCommandPalette')}
            icon={<Search size={20} />}
            onClick={() => setCommandPaletteOpen(true)}
          />
          <ThemeToggle />
          <LanguageToggle className="hidden sm:inline-flex" />
        </div>
      </div>
    </header>
  );
}
