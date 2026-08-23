/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useTranslation } from 'react-i18next';

export function useTheme() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  return { theme, setTheme, toggleTheme, isDark: theme === 'dark' };
}

export function useLanguage() {
  const language = useUIStore((s) => s.language);
  const setLanguageState = useUIStore((s) => s.setLanguage);
  const { i18n } = useTranslation();

  useEffect(() => {
    if (i18n.language !== language) void i18n.changeLanguage(language);
  }, [language, i18n]);

  const setLanguage = (lang: 'en' | 'bn') => setLanguageState(lang);
  return { language, setLanguage };
}
