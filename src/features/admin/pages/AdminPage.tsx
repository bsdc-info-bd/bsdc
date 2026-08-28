import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui';
import { Link } from 'react-router-dom';
import { Shield, Users, FileText, BarChart3, Settings, Flag, Palette, Zap, Database, Globe } from 'lucide-react';

export default function AdminPage() {
  const { t } = useTranslation();
  const { hasRole, isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return (
      <>
        <Seo title="Admin" noindex />
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 mb-4">Sign in as an admin to access the control panel.</p>
          <Link to="/login"><Button variant="primary">{t('common.login')}</Button></Link>
        </div>
      </>
    );
  }

  if (!hasRole('ADMIN')) {
    return (
      <>
        <Seo title="Access Denied" noindex />
        <div className="text-center py-12">
          <Shield className="h-16 w-16 mx-auto text-gray-300 dark:text-gray-700 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Access Denied</h1>
          <p className="text-gray-500 dark:text-gray-400">You do not have permission to access the admin panel.</p>
        </div>
      </>
    );
  }

  const sections = [
    { icon: <BarChart3 className="h-6 w-6" />, title: 'Dashboard', description: 'Real-time platform metrics and analytics' },
    { icon: <Users className="h-6 w-6" />, title: 'Users', description: 'Manage users, roles, and permissions' },
    { icon: <FileText className="h-6 w-6" />, title: 'Content', description: 'Moderate posts, comments, and reports' },
    { icon: <Flag className="h-6 w-6" />, title: 'Moderation', description: 'Review reports and take action' },
    { icon: <Globe className="h-6 w-6" />, title: 'SEO', description: 'Sitemap, RSS, robots, and metadata' },
    { icon: <Palette className="h-6 w-6" />, title: 'Branding', description: 'Logo, colors, and brand assets' },
    { icon: <Zap className="h-6 w-6" />, title: 'Feature Flags', description: 'Enable or disable platform features' },
    { icon: <Database className="h-6 w-6" />, title: 'Database', description: 'Collections, indexes, and backups' },
    { icon: <Settings className="h-6 w-6" />, title: 'Settings', description: 'System configuration and security' },
  ];

  return (
    <>
      <Seo title="Admin Panel" noindex />
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="h-7 w-7 text-brand-500" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Panel</h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sections.map((section) => (
            <div key={section.title} className="card p-5 hover:shadow-md transition-shadow cursor-pointer">
              <div className="text-brand-500 mb-3">{section.icon}</div>
              <h3 className="font-semibold text-gray-900 dark:text-white">{section.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{section.description}</p>
            </div>
          ))}
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">System Status</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Firebase is {import.meta.env.VITE_FIREBASE_API_KEY ? 'configured' : 'not configured'}.
            Set VITE_FIREBASE_* environment variables to enable full functionality.
          </p>
        </div>
      </div>
    </>
  );
}
