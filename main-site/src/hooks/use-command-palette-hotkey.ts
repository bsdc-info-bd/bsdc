import { useEffect } from 'react';
import { useUiStore } from '@/store/ui-store';

/** Ctrl+K / Cmd+K opens the command palette; "/" focuses it from anywhere. */
export function useCommandPaletteHotkey(): void {
  const toggleCommandPalette = useUiStore((state) => state.toggleCommandPalette);
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        toggleCommandPalette();
        return;
      }
      if (event.key === '/' && !typing) {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleCommandPalette, setCommandPaletteOpen]);
}
