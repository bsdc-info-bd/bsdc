import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/utils/cn';
import {
  Home,
  Compass,
  TrendingUp,
  Users,
  Briefcase,
  ShoppingBag,
  FolderGit2,
  Building2,
  Calendar,
  Shield,
  Bookmark,
  Settings,
  X,
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  authRequired?: boolean;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: 'common.home', path: '/', icon: <Home className="h-5 w-5" /> },
  { label: 'common.feed', path: '/feed', icon: <TrendingUp className="h-5 w-5" />, authRequired: true },
  { label: 'common.explore', path: '/explore', icon: <Compass className="h-5 w-5" /> },
  { label: 'common.trending', path: '/trending', icon: <TrendingUp className="h-5 w-5" /> },
  { label: 'common.groups', path: '/groups', icon: <Users className="h-5 w-5" /> },
  { label: 'common.projects', path: '/projects', icon: <FolderGit2 className="h-5 w-5" /> },
  { label: 'common.jobs', path: '/jobs', icon: <Briefcase className="h-5 w-5" /> },
  { label: 'common.marketplace', path: '/marketplace', icon: <ShoppingBag className="h-5 w-5" /> },
  { label: 'common.organizations', path: '/organizations', icon: <Building2 className="h-5 w-5" /> },
  { label: 'common.events', path: '/events', icon: <Calendar className="h-5 w-5" /> },
  { label: 'common.bookmarks', path: '/bookmarks', icon: <Bookmark className="h-5 w-5" />, authRequired: true },
  { label: 'common.settings', path: '/settings', icon: <Settings className="h-5 w-5" />, authRequired: true },
  { label: 'common.admin', path: '/admin', icon: <Shield className="h-5 w-5" />, adminOnly: true },
];

export function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { isAuthenticated, hasRole } = useAuthStore();
  const { sidebarOpen, mobileNavOpen, setMobileNavOpen } = useUIStore();

  const filteredItems = navItems.filter((item) => {
    if (item.authRequired && !isAuthenticated) return false;
    if (item.adminOnly && !hasRole('ADMIN')) return false;
    return true;
  });

  const NavContent = () => (
    <nav className="flex flex-col gap-1 py-4 px-3" aria-label="Main navigation">
      {filteredItems.map((item) => {
        const isActive = location.pathname === item.path ||
          (item.path !== '/' && location.pathname.startsWith(item.path));
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={() => setMobileNavOpen(false)}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            {item.icon}
            <span>{t(item.label)}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden lg:block fixed top-14 left-0 bottom-0 w-64 bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 overflow-y-auto',
          !sidebarOpen && 'lg:w-16',
          'transition-all duration-200'
        )}
        aria-label="Sidebar navigation"
      >
        <NavContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="fixed top-0 left-0 bottom-0 w-72 bg-white dark:bg-gray-950 shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between h-14 px-4 border-b border-gray-200 dark:border-gray-800">
              <span className="text-lg font-bold text-brand-500">{t('common.appName')}</span>
              <button
                className="btn-icon"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavContent />
          </aside>
        </div>
      )}
    </>
  );
}
