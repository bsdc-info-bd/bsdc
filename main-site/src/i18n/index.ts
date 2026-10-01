import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { bn } from './locales/bn';
import { en, type Translation } from './locales/en';

export const SUPPORTED_LANGUAGES = ['bn', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = 'bsdc.language';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Resolution order: ?lang= query parameter, stored preference, browser
 * language, then Bangla (the default for the primary audience).
 */
export function detectLanguage(): Language {
  if (typeof window === 'undefined') return 'bn';
  const fromQuery = new URLSearchParams(window.location.search).get('lang');
  if (isLanguage(fromQuery)) return fromQuery;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // Storage can be blocked; fall through to the browser preference.
  }
  const navigatorLanguage = window.navigator.language.slice(0, 2);
  return isLanguage(navigatorLanguage) ? navigatorLanguage : 'bn';
}

export function applyDocumentLanguage(language: Language): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language;
  document.documentElement.dir = 'ltr';
}

const initialLanguage = detectLanguage();

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    bn: { translation: bn },
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
});

applyDocumentLanguage(initialLanguage);

export async function changeLanguage(language: Language): Promise<void> {
  await i18n.changeLanguage(language);
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Preference persistence is best-effort.
  }
  applyDocumentLanguage(language);
}

export type { Translation };
export default i18n;
