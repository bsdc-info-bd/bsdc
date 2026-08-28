import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui';
import { signOut } from '@/lib/firebase/auth';
import { useToast } from '@/components/ui';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Shield,
  Palette,
  Globe,
  Moon,
  Sun,
  Monitor,
  LogOut,
  Trash2,
} from 'lucide-react';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { theme, setTheme, language } = useUIStore();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      useAuthStore.getState().logout();
      toast({ type: 'success', title: 'Signed out' });
      navigate('/');
    } catch {
      toast({ type: 'error', title: 'Failed to sign out' });
    }
  };

  const themes = [
    { value: 'light' as const, label: t('settings.light'), icon: <Sun className="h-4 w-4" /> },
    { value: 'dark' as const, label: t('settings.dark'), icon: <Moon className="h-4 w-4" /> },
    { value: 'system' as const, label: t('settings.system'), icon: <Monitor className="h-4 w-4" /> },
  ];

  return (
    <>
      <Seo title={t('common.settings')} noindex />
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('common.settings')}
        </h1>

        {/* Appearance */}
        <section className="card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Palette className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('settings.appearance')}
            </h2>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('settings.theme')}
            </label>
            <div className="flex gap-2">
              {themes.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTheme(t.value)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    theme === t.value
                      ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 ring-1 ring-brand-500'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Language */}
        <section className="card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Globe className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('settings.language')}
            </h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Current: {language === 'en' ? 'English' : 'বাংলা (Bangla)'}
          </p>
          <p className="text-xs text-gray-400">Use the globe icon in the header to switch languages.</p>
        </section>

        {/* Account */}
        <section className="card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('settings.account')}
            </h2>
          </div>
          {user && (
            <div className="space-y-2 text-sm">
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">Email:</span> {user.email}
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">Provider:</span> {user.providerId}
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">Role:</span> {user.role}
              </p>
            </div>
          )}
        </section>

        {/* Security */}
        <section className="card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('settings.security')}
            </h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage your sessions, linked accounts, and security settings.
          </p>
        </section>

        {/* Actions */}
        <section className="space-y-3">
          <Button variant="outline" className="w-full" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
            {t('common.logout')}
          </Button>
          <Button variant="ghost" className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10">
            <Trash2 className="h-4 w-4" />
            {t('settings.deleteAccount')}
          </Button>
        </section>
      </div>
    </>
  );
}
