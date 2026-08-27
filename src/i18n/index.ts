import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import bn from './locales/bn.json';
import en from './locales/en.json';

/**
 * i18n — Bangla and English are co-equal from day one (brief §10).
 * Detection order: explicit user choice (localStorage) → navigator
 * language → English fallback. Every user-facing string lives in the
 * resource bundles; components must never hardcode copy.
 */

export const SUPPORTED_LANGUAGES = ['en', 'bn'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';
export const LANGUAGE_STORAGE_KEY = 'bsdc.locale';

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'bn';
}

export function detectLanguage(): Language {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    /* localStorage unavailable (private mode, jsdom edge cases) */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en';
  return nav.startsWith('bn') ? 'bn' : DEFAULT_LANGUAGE;
}

export function changeLanguage(language: Language): void {
  void i18n.changeLanguage(language);
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    /* non-fatal: preference just won't persist */
  }
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      bn: { translation: bn },
    },
    lng: detectLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });
}

export default i18n;
