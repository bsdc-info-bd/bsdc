import { create } from 'zustand';

export const THEME_STORAGE_KEY = 'bsdc.theme';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
  syncWithSystem: () => void;
}

function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Storage may be unavailable in private modes.
  }
  return 'system';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return prefersDark() ? 'dark' : 'light';
  return preference;
}

/** Writes the theme to the document so CSS custom properties swap instantly. */
export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset['theme'] = resolved;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'dark' ? '#0B1512' : '#1B4332';
}

const initialPreference = readStoredPreference();
const initialResolved = resolveTheme(initialPreference);

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: initialPreference,
  resolved: initialResolved,
  setPreference: (preference) => {
    const resolved = resolveTheme(preference);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Persistence is best-effort; the session still applies the theme.
    }
    applyTheme(resolved);
    set({ preference, resolved });
  },
  toggle: () => {
    get().setPreference(get().resolved === 'dark' ? 'light' : 'dark');
  },
  syncWithSystem: () => {
    if (get().preference !== 'system') return;
    const resolved = resolveTheme('system');
    applyTheme(resolved);
    set({ resolved });
  },
}));

applyTheme(initialResolved);
