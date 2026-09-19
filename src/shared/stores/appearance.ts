/**
 * BSDC — src/shared/stores/appearance.ts
 * Purpose : Global appearance state: theme, density, font scale, numerals, motion, transparency
 *           and locale (PART 08.01, PART 08.08, PART 09.01).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : ADR-021 — this store is persisted under `bsdc:appearance` and is read by the pre-paint
 *           inline script in index.html, which is why the persisted shape is { state, version }.
 *           Any change to the shape must keep that contract or the theme will flash on load.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Locale } from '@/core/config/app';

/** The nine switchable themes (PART 08.01). */
export const THEMES = [
  'light',
  'dark',
  'oled',
  'blue',
  'green-light',
  'green-dark',
  'high-contrast',
  'sepia',
  'auto',
] as const;
export type ThemeName = (typeof THEMES)[number];

/** Density modes (PART 08.08). */
export const DENSITIES = ['comfortable', 'compact', 'spacious'] as const;
export type Density = (typeof DENSITIES)[number];

/** Accepted font scales (PART 08.04 R-12). */
export const FONT_SCALES = ['1', '1.125', '1.25', '1.5', '2'] as const;
export type FontScale = (typeof FONT_SCALES)[number];

/** Appearance state and actions. */
export interface AppearanceState {
  theme: ThemeName;
  density: Density;
  fontScale: FontScale;
  numerals: 'bn' | 'en';
  motion: 'full' | 'reduced';
  reduceTransparency: boolean;
  largeTargets: boolean;
  locale: Locale;
  setTheme: (theme: ThemeName) => void;
  setDensity: (density: Density) => void;
  setFontScale: (scale: FontScale) => void;
  setNumerals: (numerals: 'bn' | 'en') => void;
  setMotion: (motion: 'full' | 'reduced') => void;
  setReduceTransparency: (value: boolean) => void;
  setLargeTargets: (value: boolean) => void;
  setLocale: (locale: Locale) => void;
}

/**
 * Resolves the system theme for the `auto` option.
 * @returns 'dark' when the OS prefers dark, otherwise 'light'
 */
export function resolveAutoTheme(): Exclude<ThemeName, 'auto'> {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Resolves a theme name to the concrete theme that should be painted.
 * @param theme selected theme (may be 'auto')
 * @returns a concrete theme name
 */
export function effectiveTheme(theme: ThemeName): Exclude<ThemeName, 'auto'> {
  return theme === 'auto' ? resolveAutoTheme() : theme;
}

export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      theme: 'light',
      density: 'comfortable',
      fontScale: '1',
      numerals: 'bn',
      motion: 'full',
      reduceTransparency: false,
      largeTargets: false,
      locale: 'bn',
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      setFontScale: (fontScale) => set({ fontScale }),
      setNumerals: (numerals) => set({ numerals }),
      setMotion: (motion) => set({ motion }),
      setReduceTransparency: (reduceTransparency) => set({ reduceTransparency }),
      setLargeTargets: (largeTargets) => set({ largeTargets }),
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: 'bsdc:appearance',
      version: 1,
      partialize: (state): Partial<AppearanceState> => ({
        theme: state.theme,
        density: state.density,
        fontScale: state.fontScale,
        numerals: state.numerals,
        motion: state.motion,
        reduceTransparency: state.reduceTransparency,
        largeTargets: state.largeTargets,
        locale: state.locale,
      }),
    },
  ),
);
