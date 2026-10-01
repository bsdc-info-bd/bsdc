import { useEffect } from 'react';
import { useThemeStore } from '@/store/theme-store';

/** Applies OS theme changes while the preference is "system". */
export function useSystemThemeSync(): void {
  const syncWithSystem = useThemeStore((state) => state.syncWithSystem);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => syncWithSystem();
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, [syncWithSystem]);
}
