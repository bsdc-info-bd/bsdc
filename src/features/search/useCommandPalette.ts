/**
 * BSDC — src/features/search/useCommandPalette.ts
 * Purpose : The open state of the command palette, and the shortcut that toggles it.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The hook is its own module so the shell can own the shortcut without importing the
 *   palette itself: registering a global keystroke should not cost a screen's worth of JavaScript.
 *   The shortcut is ignored while a person is typing in a field of their own. Hijacking a keystroke
 *   somebody is using to write is the fastest way to lose their work and their goodwill.
 *   Opening is a toggle, so the same combination closes it and a person is never trapped.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';

/** The palette open state and its setter. */
export interface CommandPaletteState {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
}

/**
 * Tracks whether the palette is open, and listens for the global shortcut.
 * @param isStaff whether the viewer holds staff claims, kept so the registrar re-runs on a role change
 * @returns the open state and its setter
 */
export function useCommandPalette(isStaff: boolean): CommandPaletteState {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName.toLowerCase();
        const typing = tag === 'input' || tag === 'textarea' || target?.isContentEditable === true;
        if (typing && !open) return;
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, isStaff]);

  return { open, setOpen };
}
