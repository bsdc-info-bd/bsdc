import { CalendarDays, Home, Info, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { ROUTES } from '@/lib/site';

const ITEMS = [
  { to: ROUTES.home, labelKey: 'nav.home', Icon: Home },
  { to: ROUTES.about, labelKey: 'nav.about', Icon: Info },
  { to: ROUTES.groups, labelKey: 'nav.groups', Icon: Users },
  { to: ROUTES.events, labelKey: 'nav.events', Icon: CalendarDays },
] as const;

/** Mobile tab bar: the app-like navigation surface below 768px. */
export function BottomNav() {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('a11y.mobileNavigation')}
      className="bsdc-bottom-nav fab-glass fab-safe-bottom md:hidden"
    >
      <ul className="flex h-bottom-nav items-stretch">
        {ITEMS.map(({ to, labelKey, Icon }) => (
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
