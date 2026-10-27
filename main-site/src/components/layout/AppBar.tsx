import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Menu,
  MessageSquare,
  PenSquare,
  PlusCircle,
  Search,
  ShoppingCart,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { IconButton, LanguageToggle, Logo, Modal, ThemeToggle } from '@/design-system';
import { useUnreadNotificationCount } from '@/hooks/use-interactions';
import { useCart } from '@/hooks/use-market';
import { useUnreadMessageCount } from '@/hooks/use-messaging';
import { useAuthStore } from '@/store/auth-store';
import { cn } from '@/lib/cn';
import { ROUTES } from '@/lib/site';
import { useUiStore } from '@/store/ui-store';
import { AccountMenu } from './AccountMenu';

const NAV_ITEMS = [
  { to: ROUTES.home, labelKey: 'nav.home' },
  { to: ROUTES.about, labelKey: 'nav.about' },
  { to: ROUTES.groups, labelKey: 'nav.groups' },
  { to: ROUTES.events, labelKey: 'nav.events' },
  { to: ROUTES.learn, labelKey: 'nav.learn' },
  { to: ROUTES.jobs, labelKey: 'nav.jobs' },
  { to: ROUTES.shop, labelKey: 'nav.shop' },
  { to: ROUTES.projects, labelKey: 'nav.projects' },
  { to: ROUTES.guidelines, labelKey: 'nav.guidelines' },
  { to: ROUTES.contact, labelKey: 'nav.contact' },
] as const;

/** Sticky translucent application bar, 56px on mobile and 64px from 1440px. */
export function AppBar() {
  const { t } = useTranslation();
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const signedIn = useAuthStore((state) => state.status === 'authenticated');
  const [navigationOpen, setNavigationOpen] = useState(false);
  const closeNavigation = useCallback(() => setNavigationOpen(false), []);
  const location = useLocation();
  useEffect(closeNavigation, [location.pathname, closeNavigation]);
  const menuItems = [
    ...NAV_ITEMS,
    { to: ROUTES.freelance, labelKey: 'freelance.title' },
    { to: ROUTES.playground, labelKey: 'playground.title' },
    ...(signedIn
      ? [
          { to: ROUTES.compose, labelKey: 'compose.title' },
          { to: ROUTES.create, labelKey: 'create.title' },
          { to: ROUTES.messages, labelKey: 'messages.open' },
          { to: ROUTES.notifications, labelKey: 'notifications.open' },
          { to: ROUTES.cart, labelKey: 'cart.title' },
          { to: ROUTES.settings, labelKey: 'settings.title' },
        ]
      : []),
  ];

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
          className="ms-2 hidden min-w-0 flex-1 xl:block"
        >
          <ul className="flex items-center gap-1">
            {NAV_ITEMS.slice(0, 3).map((item) => (
              <li key={item.to} className="shrink-0">
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

        <div className="ms-auto flex shrink-0 items-center gap-0.5">
          <IconButton
            label={t('a11y.primaryNavigation')}
            icon={<Menu size={20} />}
            aria-expanded={navigationOpen}
            aria-haspopup="dialog"
            onClick={() => setNavigationOpen(true)}
          />
          {signedIn ? (
            <Link
              className="hidden sm:block"
              to={ROUTES.compose}
              aria-label={t('compose.title')}
              title={t('compose.title')}
            >
              <span className="fab-tap inline-flex h-11 w-11 items-center justify-center rounded-full text-text hover:bg-surface-2">
                <PenSquare size={20} aria-hidden="true" />
              </span>
            </Link>
          ) : null}
          {/* The directories: an event, a job, a gig, a project, a group. On a
              phone this lives in the bottom bar, so the icon stays off it. */}
          {signedIn ? (
            <Link
              to={ROUTES.create}
              aria-label={t('create.title')}
              title={t('create.title')}
              className="hidden sm:block"
            >
              <span className="fab-tap inline-flex h-11 w-11 items-center justify-center rounded-full text-text hover:bg-surface-2">
                <PlusCircle size={20} aria-hidden="true" />
              </span>
            </Link>
          ) : null}
          {signedIn ? (
            <div className="hidden sm:block">
              <CartLink />
            </div>
          ) : null}
          {signedIn ? <MessagesLink /> : null}
          {signedIn ? (
            <div className="hidden sm:block">
              <NotificationBell />
            </div>
          ) : null}
          <IconButton
            label={t('a11y.openCommandPalette')}
            icon={<Search size={20} />}
            onClick={() => setCommandPaletteOpen(true)}
          />
          <ThemeToggle />
          <LanguageToggle className="hidden sm:inline-flex" />
          <AccountMenu />
        </div>
      </div>
      <Modal
        open={navigationOpen}
        onClose={closeNavigation}
        title={t('a11y.primaryNavigation')}
        closeLabel={t('common.close')}
      >
        <div className="mb-2 sm:hidden">
          <LanguageToggle />
        </div>
        <nav aria-label={t('a11y.primaryNavigation')}>
          <ul className="grid gap-1 sm:grid-cols-2">
            {menuItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === ROUTES.home}
                  onClick={closeNavigation}
                  className={({ isActive }) =>
                    cn(
                      'fab-tap flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-semibold',
                      isActive ? 'bg-surface-2 text-green-700' : 'text-text hover:bg-surface-2',
                    )
                  }
                >
                  {t(item.labelKey)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </Modal>
    </header>
  );
}

/** Cart with the number of items currently reserved in it. */
function CartLink() {
  const { t } = useTranslation();
  const cart = useCart();
  const count = cart.totals.itemCount;

  return (
    <Link
      to={ROUTES.cart}
      aria-label={t('cart.title')}
      title={t('cart.title')}
      className="relative"
    >
      <span className="fab-tap inline-flex h-11 w-11 items-center justify-center rounded-full text-text hover:bg-surface-2">
        <ShoppingCart size={20} aria-hidden="true" />
      </span>
      {count > 0 ? (
        <span className="absolute end-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-green-700 px-1 text-2xs font-semibold leading-4 text-white">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}

/** Bell with an unread count; the count polls quietly in the background. */
function NotificationBell() {
  const { t } = useTranslation();
  const unread = useUnreadNotificationCount();

  return (
    <Link
      to={ROUTES.notifications}
      aria-label={t('notifications.open')}
      title={t('notifications.open')}
      className="relative"
    >
      <span className="fab-tap inline-flex h-11 w-11 items-center justify-center rounded-full text-text hover:bg-surface-2">
        <Bell size={20} aria-hidden="true" />
      </span>
      {unread > 0 ? (
        <span className="absolute end-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-green-700 px-1 text-2xs font-semibold leading-4 text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </Link>
  );
}

/** Messenger entry point with its own unread badge. */
function MessagesLink() {
  const { t } = useTranslation();
  const unread = useUnreadMessageCount();

  return (
    <Link
      to={ROUTES.messages}
      aria-label={t('messages.open')}
      title={t('messages.open')}
      className="relative"
    >
      <span className="fab-tap inline-flex h-11 w-11 items-center justify-center rounded-full text-text hover:bg-surface-2">
        <MessageSquare size={20} aria-hidden="true" />
      </span>
      {unread > 0 ? (
        <span className="absolute end-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-green-700 px-1 text-2xs font-semibold leading-4 text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </Link>
  );
}
