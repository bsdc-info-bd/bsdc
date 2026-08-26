/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bell, Menu, MessageSquare, Moon, Search, Sun, Languages, ChevronDown, LogOut,
  Settings as SettingsIcon, User as UserIcon, ShieldCheck, Bookmark, Plus, Zap, Building2,
} from 'lucide-react';
import { BsdcLogo } from '@/components/branding/Logo';
import { Avatar } from '@/components/ui/Avatar';
import { Button, LinkButton } from '@/components/ui/Button';
import {
  Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger,
} from '@/components/ui/Dropdown';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useNotifications } from '@/hooks/useNotifications';
import { signOut } from '@/lib/auth';
import { roleAtLeast } from '@/types/user';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';
import { SearchSuggest } from '@/components/search/SearchSuggest';
import { useState } from 'react';

export function Header() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const language = useUIStore((s) => s.language);
  const setLanguage = useUIStore((s) => s.setLanguage);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);
  const { unreadCount } = useNotifications(profile?.uid || null);
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out');
    navigate('/login');
  }

  return (
    <header className="sticky top-0 z-40 border-b border-surface-light-border bg-white/90 backdrop-blur-md dark:border-surface-dark-border dark:bg-surface-dark/90 bsdc-safe-top">
      <div className="bsdc-container flex h-14 items-center gap-2 lg:h-16 lg:gap-4">
        <button
          type="button"
          aria-label="Open navigation menu"
          className="bsdc-tap -ml-1.5 flex items-center justify-center rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-surface-dark-raised lg:hidden"
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>

        <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="BSDC home">
          <BsdcLogo height={34} />
        </Link>

        <div className="ml-1 hidden min-w-0 flex-1 md:block lg:max-w-md">
          <SearchSuggest />
        </div>

        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          aria-label={t('common.search')}
          className="bsdc-tap flex items-center justify-center rounded-full p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-surface-dark-raised md:hidden"
        >
          <Search className="h-5 w-5" aria-hidden />
        </button>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          {profile ? (
            <>
              <Link
                to="/messages"
                aria-label={t('nav.messages')}
                className="bsdc-tap relative hidden items-center justify-center rounded-full p-2.5 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-surface-dark-raised sm:flex"
              >
                <MessageSquare className="h-5 w-5" aria-hidden />
              </Link>
              <Link
                to="/notifications"
                aria-label={t('nav.notifications')}
                className="bsdc-tap relative flex items-center justify-center rounded-full p-2.5 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-surface-dark-raised"
              >
                <Bell className="h-5 w-5" aria-hidden />
                {unreadCount > 0 ? (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </Link>
            </>
          ) : null}

          {typeof Notification !== 'undefined' && Notification.permission === 'default' ? (
            <Link
              to="/permissions"
              aria-label="Enable notifications"
              className="bsdc-tap relative flex items-center justify-center rounded-full p-2.5 text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/50"
            >
              <Bell className="h-5 w-5" aria-hidden />
              <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden />
            </Link>
          ) : null}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? t('common.lightMode') : t('common.darkMode')}
            className="bsdc-tap flex items-center justify-center rounded-full p-2.5 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-surface-dark-raised"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
          </button>

          <button
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'bn' : 'en')}
            aria-label={`Switch language to ${language === 'en' ? 'Bangla' : 'English'}`}
            className="bsdc-tap flex items-center justify-center rounded-full p-2.5 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-surface-dark-raised"
          >
            <Languages className="h-5 w-5" aria-hidden />
            <span className="ml-1 hidden text-xs font-bold sm:inline">{language === 'en' ? 'বাং' : 'EN'}</span>
          </button>

          {profile ? (
            <Dropdown open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownTrigger asChild>
                <button type="button" className="bsdc-tap ml-1 flex items-center gap-1.5 rounded-full p-1 pr-1.5 hover:bg-neutral-100 dark:hover:bg-surface-dark-raised" aria-label="Account menu">
                  <Avatar src={profile.avatar} name={profile.displayName} size={32} />
                  <ChevronDown className="hidden h-4 w-4 text-neutral-400 sm:block" aria-hidden />
                </button>
              </DropdownTrigger>
              <DropdownContent>
                <div className="flex items-center gap-3 px-3 py-2">
                  <Avatar src={profile.avatar} name={profile.displayName} size={40} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{profile.displayName}</p>
                    <p className="truncate text-xs text-neutral-500">@{profile.username}</p>
                  </div>
                </div>
                <DropdownSeparator />
                <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 dark:bg-brand-950/50">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-brand-700 dark:text-brand-300">
                    <Zap className="h-3.5 w-3.5" aria-hidden />
                    {t('common.points')}
                  </span>
                  <span className="text-sm font-extrabold text-brand-700 dark:text-brand-300">{formatNumber(profile.bsdcPoints, language)}</span>
                </div>
                <DropdownSeparator />
                <DropdownItem icon={<UserIcon className="h-4 w-4" aria-hidden />} onSelect={() => navigate(`/p/${profile.username}`)}>
                  {t('nav.profile')}
                </DropdownItem>
                <DropdownItem icon={<Bookmark className="h-4 w-4" aria-hidden />} onSelect={() => navigate('/bookmarks')}>
                  {t('common.bookmarks')}
                </DropdownItem>
                <DropdownItem icon={<SettingsIcon className="h-4 w-4" aria-hidden />} onSelect={() => navigate('/settings')}>
                  {t('nav.settings')}
                </DropdownItem>
                <DropdownItem icon={<Building2 className="h-4 w-4" aria-hidden />} onSelect={() => navigate('/organizations')}>
                  Organizations & businesses
                </DropdownItem>
                {roleAtLeast(profile.role, 'moderator') ? (
                  <DropdownItem icon={<ShieldCheck className="h-4 w-4" aria-hidden />} onSelect={() => navigate(roleAtLeast(profile.role, 'admin') ? '/admin' : '/mod')}>
                    {roleAtLeast(profile.role, 'admin') ? t('nav.adminPanel') : t('nav.modPanel')}
                  </DropdownItem>
                ) : null}
                <DropdownSeparator />
                <DropdownItem danger icon={<LogOut className="h-4 w-4" aria-hidden />} onSelect={() => void handleSignOut()}>
                  {t('common.logout')}
                </DropdownItem>
              </DropdownContent>
            </Dropdown>
          ) : (
            <div className="flex items-center gap-2">
              <LinkButton to="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                {t('common.login')}
              </LinkButton>
              <Link to="/register" className="inline-flex">
                <Button size="sm" icon={<Plus className="h-4 w-4" aria-hidden />}>
                  <span className="hidden sm:inline">{t('common.register')}</span>
                  <span className="sm:hidden">Join</span>
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
