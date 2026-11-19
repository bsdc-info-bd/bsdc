import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Translation } from './locales/en';

/**
 * One instance of our own rather than i18next's default singleton: the default
 * export is a bound-function surface under CommonJS (which is what the test
 * runner loads) and the full instance under ESM, and a bundle registry needs
 * the same object in both.
 */
const i18n = createInstance();

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

/**
 * Each language is its own bundle, fetched when it is needed.
 *
 * The two bundles together are ~45% of the JavaScript a first visit used to
 * download — every visitor paid for a language they were never shown, before
 * anything could be painted. They are now separate chunks: the visitor's own
 * language is fetched once, in parallel with the rest of the application, and
 * the other one only if the language toggle is used.
 *
 * `initI18n()` has to finish before React renders, because a rendered tree
 * with no resources is a tree full of raw keys. It is awaited by the entry
 * point — after the prerendered HTML has already painted, so the wait is not
 * a blank screen.
 */
const bundles: Record<Language, () => Promise<Record<string, unknown>>> = {
  bn: () => import('./locales/bn'),
  en: () => import('./locales/en'),
};

/** Loads one language into the i18next instance; a no-op if it is already there. */
export async function loadLanguageBundle(language: Language): Promise<void> {
  if (i18n.hasResourceBundle(language, 'translation')) return;
  const module = await bundles[language]();
  const bundle = (module[language] ?? module.default) as Translation | undefined;
  if (!bundle) throw new Error(`BSDC: the ${language} language bundle is empty`);
  i18n.addResourceBundle(language, 'translation', bundle, true, true);
}

let initialising: Promise<void> | null = null;

/**
 * Loads the visitor's language and starts i18next. Idempotent: the entry point
 * and any test that needs a synchronous instance can call it, and the work
 * happens once.
 */
export function initI18n(): Promise<void> {
  initialising ??= (async () => {
    if (!i18n.isInitialized) {
      await i18n.use(initReactI18next).init({
        resources: {},
        lng: initialLanguage,
        fallbackLng: 'en',
        supportedLngs: [...SUPPORTED_LANGUAGES],
        interpolation: { escapeValue: false },
        returnNull: false,
        react: { useSuspense: false },
        // The language bundle is a chunk, added once it arrives.
        partialBundledLanguages: true,
        // The initialisation above must be complete when this promise resolves,
        // not one tick later.
        initImmediate: false,
      });
    }
    await loadLanguageBundle(initialLanguage);
    await i18n.changeLanguage(initialLanguage);
    applyDocumentLanguage(initialLanguage);
  })().catch((error: unknown) => {
    // A language bundle that cannot be fetched (an offline first visit, a
    // blocking extension) must not keep the application off the screen. The
    // keys render instead of the copy, and the next navigation retries.
    initialising = null;
    throw error;
  });
  return initialising;
}

export async function changeLanguage(language: Language): Promise<void> {
  await loadLanguageBundle(language);
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
