/**
 * BSDC — src/app/providers/ThemeProvider.tsx
 * Purpose : Applies appearance state to the document element and keeps the browser UI in sync
 *           (PART 08.01 theme engine rules).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : ADR-021 — the pre-paint script sets the initial theme before first paint; this provider
 *           takes over afterwards and keeps <meta name="theme-color">, data-density, data-font-scale
 *           and data-transparency current so no component needs to know about them.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, type ReactNode } from 'react';
import { effectiveTheme, useAppearance } from '@/shared/stores/appearance';
import { emit } from '@/core/events/bus';

/** Status-bar colour per theme for Android WebView (PART 27). */
const THEME_COLOR: Readonly<Record<string, string>> = {
  light: '#2d6a4f',
  dark: '#0b1220',
  oled: '#000000',
  blue: '#1877f2',
  'green-light': '#2d6a4f',
  'green-dark': '#07160f',
  'high-contrast': '#ffffff',
  sepia: '#f6f0e4',
  auto: '#2d6a4f',
};

/**
 * Applies the persisted appearance to the document.
 * @param children application tree
 * @returns the children unchanged (this provider renders no DOM)
 */
export function ThemeProvider({ children }: { children: ReactNode }): ReactNode {
  const theme = useAppearance((state) => state.theme);
  const density = useAppearance((state) => state.density);
  const fontScale = useAppearance((state) => state.fontScale);
  const reduceTransparency = useAppearance((state) => state.reduceTransparency);

  useEffect(() => {
    const root = document.documentElement;
    const resolved = effectiveTheme(theme);
    root.setAttribute('data-theme', resolved);
    root.style.colorScheme =
      resolved === 'light' || resolved === 'high-contrast' || resolved === 'sepia'
        ? 'light'
        : 'dark';

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = THEME_COLOR[resolved] ?? '#2d6a4f';

    emit('theme:changed', { theme: resolved });
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
  }, [density]);

  useEffect(() => {
    document.documentElement.setAttribute('data-font-scale', fontScale);
  }, [fontScale]);

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-transparency',
      reduceTransparency ? 'reduced' : 'full',
    );
  }, [reduceTransparency]);

  // Follow the OS when the user picked "auto".
  useEffect(() => {
    if (theme !== 'auto') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (): void => {
      const root = document.documentElement;
      const resolved = query.matches ? 'dark' : 'light';
      root.setAttribute('data-theme', resolved);
      root.style.colorScheme = resolved;
    };
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, [theme]);

  return children;
}
