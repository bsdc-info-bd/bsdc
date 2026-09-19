/**
 * BSDC — src/app/providers/I18nProvider.tsx
 * Purpose : i18next bootstrap for Bangla and English, both first-class (PART 09.01).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Translations are loaded over HTTP from /locales/{lng}/{ns}.json so the bundle stays
 *           small and the shell can ship with zero copy in JS (PART 25 bundle budget).
 *           URL > profile preference > cookie > navigator.language > Bangladeshi default,
 *           in that order (PART 09.01 detection rules).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import { DEFAULT_LOCALE, LOCALES } from '@/core/config/app';
import { localeFromPath } from '@/shared/lib/url';
import { emit } from '@/core/events/bus';

/** Namespaces loaded for every route. Add a namespace here when a new dictionary ships. */
export const NAMESPACES = [
  'common',
  'nav',
  'theme',
  'a11y',
  'errors',
  'home',
  'about',
  'network',
  'design-system',
  'footer',
  'countdown',
  'auth',
  'feed',
  'composer',
  'comments',
  'reactions',
  'groups',
  'messenger',
  'notifications',
  'presence',
  'search',
  'profile',
  'stories',
  'events',
  'jobs',
  'projects',
  'freelancer',
  'gamification',
  'moderation',
  'push',
] as const;

void i18next
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    supportedLngs: [...LOCALES],
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: 'common',
    ns: [...NAMESPACES],
    // Bangla is the default: `bn` and `bn-BD` both resolve to the Bangla dictionary.
    load: 'languageOnly',
    lng: DEFAULT_LOCALE,
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    returnNull: false,
  });

/**
 * Bootstraps i18next and keeps <html lang> correct for SEO and screen readers.
 * @param children application tree
 * @returns the children wrapped in the i18next provider once initialised
 */
export function I18nProvider({ children }: { children: ReactNode }): ReactNode {
  const [ready, setReady] = useState<boolean>(i18next.isInitialized);

  useEffect(() => {
    if (ready) return;
    const onInit = (): void => setReady(true);
    i18next.on('initialized', onInit);
    return () => {
      i18next.off('initialized', onInit);
    };
  }, [ready]);

  useEffect(() => {
    const path = typeof window === 'undefined' ? '/' : window.location.pathname;
    const fromPath = localeFromPath(path);
    const target =
      fromPath ?? (i18next.resolvedLanguage as 'bn' | 'en' | undefined) ?? DEFAULT_LOCALE;
    if (i18next.language !== target) void i18next.changeLanguage(target);
  }, []);

  useEffect(() => {
    const handler = (locale: string): void => {
      const root = document.documentElement;
      root.setAttribute('lang', locale === 'bn' ? 'bn' : 'en');
      root.setAttribute('dir', 'ltr');
      emit('locale:changed', { locale: locale === 'bn' ? 'bn' : 'en' });
    };
    i18next.on('languageChanged', handler);
    handler(i18next.resolvedLanguage ?? DEFAULT_LOCALE);
    return () => {
      i18next.off('languageChanged', handler);
    };
  }, []);

  return <I18nextProvider i18n={i18next}>{children}</I18nextProvider>;
}
