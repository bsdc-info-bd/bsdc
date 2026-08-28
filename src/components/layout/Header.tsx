import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { Avatar, Button } from '@/components/ui';
import { cn } from '@/utils/cn';
import {
  Search,
  Bell,
  MessageSquare,
  Menu,
  Plus,
  Moon,
  Sun,
  Globe,
} from 'lucide-react';

export function Header() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { isAuthenticated, profile } = useAuthStore();
  const { theme, setTheme, setComposerOpen, setSearchOpen, mobileNavOpen, setMobileNavOpen } = useUIStore();
  const { unreadCount } = useNotificationStore();

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark');
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'bn' : 'en';
    i18n.changeLanguage(newLang);
    useUIStore.getState().setLanguage(newLang);
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 glass border-b border-gray-200 dark:border-gray-800"
      role="banner"
    >
      <div className="flex items-center justify-between h-14 px-4 container-app">
        {/* Left: Logo & Mobile Menu */}
        <div className="flex items-center gap-3">
          <button
            className="btn-icon lg:hidden"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            aria-label={t('common.close') === 'Close' ? 'Open menu' : 'Close menu'}
            aria-expanded={mobileNavOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="flex items-center gap-2" aria-label="BSDC Home">
            <BsdcLogo className="h-8 w-8" />
            <span className="hidden sm:block text-lg font-bold text-brand-500">
              {t('common.appName')}
            </span>
          </Link>
        </div>

        {/* Center: Search */}
        <div className="hidden md:flex flex-1 max-w-lg mx-4">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label={t('search.searchPlaceholder')}
          >
            <Search className="h-4 w-4" />
            <span>{t('search.searchPlaceholder')}</span>
            <kbd className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 text-2xs font-medium text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded">
              /
            </kbd>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          {/* Mobile search */}
          <button
            className="btn-icon md:hidden"
            onClick={() => setSearchOpen(true)}
            aria-label={t('common.search')}
          >
            <Search className="h-5 w-5" />
          </button>

          {/* Language toggle */}
          <button
            className="btn-icon"
            onClick={toggleLanguage}
            aria-label={`Switch to ${i18n.language === 'en' ? 'Bangla' : 'English'}`}
          >
            <Globe className="h-5 w-5" />
          </button>

          {/* Theme toggle */}
          <button
            className="btn-icon"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </button>

          {isAuthenticated ? (
            <>
              {/* Create post */}
              <button
                className="btn-icon"
                onClick={() => setComposerOpen(true)}
                aria-label={t('feed.createPost')}
              >
                <Plus className="h-5 w-5" />
              </button>

              {/* Messages */}
              <Link
                to="/messages"
                className={cn(
                  'btn-icon relative',
                  location.pathname === '/messages' && 'text-brand-500'
                )}
                aria-label={t('common.messages')}
              >
                <MessageSquare className="h-5 w-5" />
              </Link>

              {/* Notifications */}
              <Link
                to="/notifications"
                className={cn(
                  'btn-icon relative',
                  location.pathname === '/notifications' && 'text-brand-500'
                )}
                aria-label={`${t('common.notifications')}${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 min-w-4 px-1 text-2xs font-bold text-white bg-red-500 rounded-full">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>

              {/* Profile */}
              <Link
                to={profile ? `/@${profile.username}` : '/settings'}
                className="ml-1"
                aria-label={t('common.viewProfile')}
              >
                <Avatar
                  src={profile?.avatar}
                  alt={profile?.displayName || 'User'}
                  size="sm"
                />
              </Link>
            </>
          ) : (
            <div className="flex items-center gap-2 ml-2">
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  {t('common.login')}
                </Button>
              </Link>
              <Link to="/register" className="hidden sm:block">
                <Button variant="primary" size="sm">
                  {t('common.register')}
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function BsdcLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill="#0A8F3C" />
      <path
        d="M8 10h6c2.2 0 4 1.8 4 4s-1.8 4-4 4H8v-8z"
        fill="white"
        opacity="0.9"
      />
      <path
        d="M8 18h7c2.2 0 4 1.8 4 4s-1.8 4-4 4H8v-8z"
        fill="white"
        opacity="0.7"
      />
      <circle cx="24" cy="12" r="3" fill="#2563EB" />
      <path d="M21 16l3 8 3-8" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
