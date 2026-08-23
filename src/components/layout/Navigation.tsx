/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { NavLink, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { roleAtLeast } from '@/types/user';
import { Avatar } from '@/components/ui/Avatar';
import { useEffect, useRef } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { PRIMARY_NAV, COMMUNITY_NAV, CONTENT_NAV, MORE_NAV, MOBILE_NAV, STAFF_NAV_ITEM, type NavItem } from './navItems';


function NavSection({ title, items, onNavigate }: { title: string; items: NavItem[]; onNavigate?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mb-4">
      <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-neutral-400">{title}</p>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.exact}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'bsdc-tap flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-surface-dark-raised',
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className="truncate">{t(item.labelKey)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const filterAuth = (items: NavItem[]) => items.filter((i) => !i.authRequired || profile);

  return (
    <nav aria-label="Primary" className="hidden w-60 shrink-0 overflow-y-auto py-4 pl-2 pr-3 lg:block xl:w-64">
      <NavSection title={t('nav.home')} items={filterAuth(PRIMARY_NAV)} />
      <NavSection title={t('nav.more')} items={filterAuth(COMMUNITY_NAV)} />
      <NavSection title={t('common.all')} items={filterAuth(CONTENT_NAV)} />
      <NavSection title={t('common.level')} items={filterAuth(MORE_NAV)} />
      {profile && roleAtLeast(profile.role, 'moderator') ? (
        <NavSection title={t('nav.adminPanel')} items={[STAFF_NAV_ITEM]} />
      ) : null}
      {profile ? (
        <Link to={`/p/${profile.username}`} className="bsdc-tap mt-2 flex items-center gap-3 rounded-xl border border-surface-light-border p-2.5 hover:bg-neutral-50 dark:border-surface-dark-border dark:hover:bg-surface-dark-raised">
          <Avatar src={profile.avatar} name={profile.displayName} size={36} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{profile.displayName}</span>
            <span className="block truncate text-xs text-neutral-500">@{profile.username}</span>
          </span>
        </Link>
      ) : null}
    </nav>
  );
}

export function MobileSidebar() {
  const { t } = useTranslation();
  const open = useUIStore((s) => s.mobileNavOpen);
  const setOpen = useUIStore((s) => s.setMobileNavOpen);
  const profile = useAuthStore((s) => s.profile);
  const filterAuth = (items: NavItem[]) => items.filter((i) => !i.authRequired || profile);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      ref.current?.focus();
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <div
        ref={ref}
        tabIndex={-1}
        className="bsdc-animate-slide-in-right absolute inset-y-0 right-0 w-[85vw] max-w-xs overflow-y-auto border-l border-surface-light-border bg-white p-4 shadow-raised focus:outline-none dark:border-surface-dark-border dark:bg-surface-dark"
      >
        <div className="mb-4 flex items-center justify-between">
          {profile ? (
            <Link to={`/p/${profile.username}`} onClick={() => setOpen(false)} className="flex min-w-0 items-center gap-2.5">
              <Avatar src={profile.avatar} name={profile.displayName} size={36} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{profile.displayName}</span>
                <span className="block truncate text-xs text-neutral-500">@{profile.username}</span>
              </span>
            </Link>
          ) : (
            <span className="text-sm font-bold">{t('common.appName')}</span>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t('common.close')}
            className="bsdc-tap rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-surface-dark-raised"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <NavSection title={t('nav.home')} items={filterAuth(PRIMARY_NAV)} onNavigate={() => setOpen(false)} />
        <NavSection title={t('nav.more')} items={filterAuth(COMMUNITY_NAV)} onNavigate={() => setOpen(false)} />
        <NavSection title={t('common.all')} items={filterAuth(CONTENT_NAV)} onNavigate={() => setOpen(false)} />
        <NavSection title={t('common.level')} items={filterAuth(MORE_NAV)} onNavigate={() => setOpen(false)} />
        {profile && roleAtLeast(profile.role, 'moderator') ? (
          <NavSection title={t('nav.adminPanel')} items={[{ ...STAFF_NAV_ITEM, to: roleAtLeast(profile.role, 'admin') ? '/admin' : '/mod' }]} onNavigate={() => setOpen(false)} />
        ) : null}
      </div>
    </div>
  );
}

export function BottomNav() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const { unreadCount } = useNotifications(profile?.uid || null);
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-light-border bg-white/95 backdrop-blur-md dark:border-surface-dark-border dark:bg-surface-dark/95 lg:hidden bsdc-safe-bottom"
    >
      <ul className="flex items-stretch justify-around">
        {MOBILE_NAV.filter((i) => !i.authRequired || profile).map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                cn(
                  'bsdc-tap relative mx-auto flex max-w-24 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition-colors',
                  isActive ? 'text-brand-600 dark:text-brand-400' : 'text-neutral-500 dark:text-neutral-400',
                )
              }
            >
              <item.icon className="h-5 w-5" aria-hidden />
              <span className="max-w-16 truncate">{t(item.labelKey)}</span>
              {item.to === '/notifications' && unreadCount > 0 ? (
                <span className="absolute right-1/2 top-1 translate-x-4 rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              ) : null}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
