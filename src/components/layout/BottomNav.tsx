import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/utils/cn';
import { Home, Compass, Plus, Bell, User } from 'lucide-react';

export function BottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const { isAuthenticated, profile } = useAuthStore();

  const items = [
    { path: '/', label: t('common.home'), icon: <Home className="h-5 w-5" /> },
    { path: '/explore', label: t('common.explore'), icon: <Compass className="h-5 w-5" /> },
    { path: '/create', label: t('feed.createPost'), icon: <Plus className="h-6 w-6" />, isCreate: true },
    {
      path: '/notifications',
      label: t('common.notifications'),
      icon: <Bell className="h-5 w-5" />,
      authRequired: true,
    },
    {
      path: profile ? `/@${profile.username}` : '/login',
      label: t('common.profile'),
      icon: <User className="h-5 w-5" />,
    },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 bottom-safe"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-14 px-2">
        {items.map((item) => {
          if (item.authRequired && !isAuthenticated) return null;
          const isActive = location.pathname === item.path;

          if (item.isCreate) {
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex flex-col items-center justify-center -mt-4"
                aria-label={item.label}
              >
                <span className="flex items-center justify-center h-12 w-12 rounded-full bg-brand-500 text-white shadow-lg hover:bg-brand-600 transition-colors">
                  {item.icon}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-lg transition-colors',
                isActive
                  ? 'text-brand-500'
                  : 'text-gray-500 dark:text-gray-400'
              )}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
            >
              {item.icon}
              <span className="text-2xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
