import { useEffect } from 'react';
import useLocalStorageState from 'use-local-storage-state';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'bsdc.theme';

export function getPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/** Applies the resolved theme class to <html>. Also mirrored inline in index.html for pre-paint correctness. */
export function applyThemeClass(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && getPrefersDark());
  document.documentElement.classList.toggle('dark', dark);
}

/**
 * Dark/light mode persisted via use-localstorage-state (brief §11),
 * respecting the system preference by default and while "system".
 */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const [stored, setStored] = useLocalStorageState<Theme>(STORAGE_KEY, {
    defaultValue: 'system',
  });
  const theme: Theme = stored ?? 'system';

  useEffect(() => {
    applyThemeClass(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyThemeClass('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  return { theme, setTheme: setStored };
}
