import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoutes } from 'react-router-dom';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { SkipLink } from '@/components/layout/skip-link';
import { useTheme } from '@/hooks/use-theme';
import { appRoutes } from '@/routes';

/**
 * Application shell: theme + language synchronization, skip link,
 * header/footer chrome, and the routed page area.
 *
 * Note: App itself is router-agnostic (BrowserRouter is mounted in
 * main.tsx) so tests can drive it with MemoryRouter at any path.
 */
export function App() {
  // Mounts the theme class + system-preference subscription for the session.
  useTheme();

  const { i18n } = useTranslation();
  useEffect(() => {
    const lang = i18n.resolvedLanguage?.startsWith('bn') ? 'bn' : 'en';
    document.documentElement.lang = lang;
  }, [i18n.resolvedLanguage]);

  const element = useRoutes(appRoutes);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SkipLink />
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col">
        {element}
      </main>
      <SiteFooter />
    </div>
  );
}
