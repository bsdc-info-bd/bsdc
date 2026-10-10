import { CalendarDays, Home, Info, PlusCircle, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { ROUTES } from '@/lib/site';
import { useAuthStore } from '@/store/auth-store';

const GUEST_ITEMS = [
  { to: ROUTES.home, labelKey: 'nav.home', Icon: Home },
  { to: ROUTES.about, labelKey: 'nav.about', Icon: Info },
  { to: ROUTES.groups, labelKey: 'nav.groups', Icon: Users },
  { to: ROUTES.events, labelKey: 'nav.events', Icon: CalendarDays },
] as const;

/**
 * A member's fourth tab is the door to creating something, not "About": on a
 * phone this bar is the whole of the navigation, and a directory that cannot be
 * added to from a phone is a directory that stays empty.
 */
const MEMBER_ITEMS = [
  { to: ROUTES.home, labelKey: 'nav.home', Icon: Home },
  { to: ROUTES.groups, labelKey: 'nav.groups', Icon: Users },
  { to: ROUTES.events, labelKey: 'nav.events', Icon: CalendarDays },
  { to: ROUTES.create, labelKey: 'nav.create', Icon: PlusCircle },
] as const;

/** Mobile tab bar: the app-like navigation surface below 768px. */
export function BottomNav() {
  const { t } = useTranslation();
  const signedIn = useAuthStore((state) => state.status === 'authenticated');
  const items = signedIn ? MEMBER_ITEMS : GUEST_ITEMS;
  return (
    <nav
      aria-label={t('a11y.mobileNavigation')}
      className="bsdc-bottom-nav fab-glass fab-safe-bottom md:hidden"
    >
      <ul className="flex h-bottom-nav items-stretch">
        {items.map(({ to, labelKey, Icon }) => (
          <li key={to} className="flex min-w-0 flex-1">
            <NavLink to={to} end={to === ROUTES.home} className="bsdc-nav-item fab-tap">
              <Icon size={20} aria-hidden="true" />
              <span>{t(labelKey)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
