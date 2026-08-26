/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { Suspense, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Users, FileText, ShieldAlert, BarChart3, FileDown, Megaphone, Settings,
  Rocket, FileBadge, Star, ShoppingBag, Radio, ScrollText, Database, Gavel, ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { roleAtLeast } from '@/types/user';
import { FullPageLoader } from '@/components/ui/Skeleton';
import { SEOHead } from '@/components/seo/SEOHead';
import { toast } from 'sonner';

const ADMIN_NAV = [
  { to: '/admin', labelKey: 'admin.dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', labelKey: 'admin.users', icon: Users },
  { to: '/admin/content', labelKey: 'admin.content', icon: FileText },
  { to: '/admin/moderation', labelKey: 'admin.moderation', icon: ShieldAlert },
  { to: '/admin/analytics', labelKey: 'admin.analytics', icon: BarChart3 },
  { to: '/admin/reports-pdf', labelKey: 'admin.reports', icon: FileDown },
  { to: '/admin/ads', labelKey: 'admin.ads', icon: Megaphone },
  { to: '/admin/licenses', labelKey: 'admin.licenses', icon: FileBadge },
  { to: '/admin/creators', labelKey: 'admin.creators', icon: Star },
  { to: '/admin/marketplace', labelKey: 'admin.marketplace', icon: ShoppingBag },
  { to: '/admin/broadcast', labelKey: 'admin.broadcast', icon: Radio },
  { to: '/admin/logs', labelKey: 'admin.logs', icon: ScrollText },
  { to: '/admin/database', labelKey: 'admin.database', icon: Database },
  { to: '/admin/settings', labelKey: 'admin.settings', icon: Settings },
  { to: '/admin/launch', labelKey: 'admin.launch', icon: Rocket },
];

const MOD_NAV = [
  { to: '/mod', labelKey: 'mod.title', icon: Gavel, end: true },
  { to: '/admin/moderation', labelKey: 'mod.queue', icon: ShieldAlert },
  { to: '/admin/content', labelKey: 'admin.content', icon: FileText },
];

export function AdminLayout({ mode = 'admin' }: { mode?: 'admin' | 'mod' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const nav = mode === 'admin' ? ADMIN_NAV : MOD_NAV;

  useEffect(() => {
    if (profile && !roleAtLeast(profile.role, mode === 'admin' ? 'admin' : 'moderator')) {
      toast.error('Insufficient permissions');
      navigate('/', { replace: true });
    }
  }, [profile, mode, navigate]);

  if (!profile || !roleAtLeast(profile.role, mode === 'admin' ? 'admin' : 'moderator')) {
    return <FullPageLoader />;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SEOHead title={`${mode === 'admin' ? t('admin.title') : t('mod.title')} — BSDC`} description="BSDC staff console." path={mode === 'admin' ? '/admin' : '/mod'} noindex />
      <header className="sticky top-0 z-40 border-b border-surface-dark-border bg-[#0d1117] text-white">
        <div className="mx-auto flex h-14 w-full max-w-[1800px] items-center gap-3 px-3 sm:px-5">
          <NavLink to={mode === 'admin' ? '/admin' : '/mod'} className="flex items-center gap-2 font-extrabold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient text-sm">B</span>
            <span className="hidden sm:inline">{mode === 'admin' ? t('admin.title') : t('mod.title')}</span>
          </NavLink>
          <NavLink to="/" className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-neutral-300 hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            <span className="hidden min-[420px]:inline">BSDC</span>
          </NavLink>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1800px] flex-1">
        <nav aria-label="Admin navigation" className="bsdc-scroll-x sticky top-14 hidden max-h-[calc(100dvh-3.5rem)] w-56 shrink-0 overflow-y-auto border-r border-surface-light-border p-3 dark:border-surface-dark-border md:block">
          <ul className="space-y-0.5">
            {nav.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'bsdc-tap flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300' : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-surface-dark-raised',
                    )
                  }
                >
                  <item.icon style={{ width: 18, height: 18 }} aria-hidden />
                  {t(item.labelKey)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1 p-3 sm:p-5">
          <nav aria-label="Admin mobile navigation" className="bsdc-scroll-x mb-4 flex gap-2 overflow-x-auto md:hidden">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold',
                    isActive ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300' : 'border-surface-light-border text-neutral-500 dark:border-surface-dark-border',
                  )
                }
              >
                <item.icon className="h-3.5 w-3.5" aria-hidden />
                {t(item.labelKey)}
              </NavLink>
            ))}
          </nav>
          <Suspense fallback={<FullPageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
