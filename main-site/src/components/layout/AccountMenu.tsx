import { LogOut, Trash2, Settings, User as UserIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { Avatar, Button } from '@/design-system';
import { signOutNow } from '@/lib/auth/sign-out';
import { profilePath, ROUTES } from '@/lib/site';
import { useAuthStore } from '@/store/auth-store';
import { useProfileStore } from '@/store/profile-store';

/** Avatar menu for members; a sign-in call to action for guests. */
export function AccountMenu() {
  const { t } = useTranslation();
  const location = useLocation();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const profile = useProfileStore((state) => state.profile);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (status !== 'authenticated' || !user) {
    const next = `${location.pathname}${location.search}`;
    const href =
      location.pathname === ROUTES.login
        ? ROUTES.login
        : `${ROUTES.login}?next=${encodeURIComponent(next)}`;
    return (
      <Link to={href} className="shrink-0">
        <Button size="sm">{t('auth.signIn')}</Button>
      </Link>
    );
  }

  const name = profile?.displayName ?? user.displayName ?? user.email ?? t('auth.signIn');
  const username = profile?.username;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="fab-tap inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-2"
      >
        <Avatar src={profile?.avatarUrl ?? user.photoURL ?? ''} name={name} size="sm" />
        <span className="sr-only">{name}</span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={name}
          className="absolute end-0 z-40 mt-1 w-56 rounded-card border border-border bg-surface p-1 shadow-raised"
        >
          <p className="fab-truncate px-3 py-2 text-xs text-muted">
            {username ? `@${username}` : user.email}
          </p>
          {username ? (
            <Link
              role="menuitem"
              to={profilePath(username)}
              className="fab-tap flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
            >
              <UserIcon size={16} aria-hidden="true" />
              {t('profile.tabs.about')}
            </Link>
          ) : (
            <Link
              role="menuitem"
              to={ROUTES.onboarding}
              className="fab-tap flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
            >
              <UserIcon size={16} aria-hidden="true" />
              {t('onboarding.title')}
            </Link>
          )}
          <Link
            role="menuitem"
            to={ROUTES.trash}
            className="fab-tap flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
          >
            <Trash2 size={16} aria-hidden="true" />
            {t('trash.title')}
          </Link>
          <Link
            role="menuitem"
            to={ROUTES.settings}
            className="fab-tap flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
          >
            <Settings size={16} aria-hidden="true" />
            {t('settings.title')}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOutNow()}
            className="fab-tap flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm hover:bg-surface-2"
          >
            <LogOut size={16} aria-hidden="true" />
            {t('auth.signOut')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
