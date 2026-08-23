/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';

/**
 * Global keyboard shortcuts:
 *  Ctrl/Cmd+K — command palette · N — new post · G then H/P/M/N/S — navigate
 *  ? — shortcuts help · J/K — move feed focus · Esc closes overlays.
 */
export function useKeyboardShortcuts(): void {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const setShortcutsOpen = useUIStore((s) => s.setShortcutsOpen);
  const gPressed = useRef(false);
  const gTimer = useRef<number | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const editable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('[role="textbox"], .monaco-monsaco-editor, .cm-editor'));

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
        return;
      }
      if (editable) return;

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (e.key.toLowerCase() === 'n' && profile) {
        e.preventDefault();
        navigate('/create');
        return;
      }
      if (e.key.toLowerCase() === 'g') {
        gPressed.current = true;
        if (gTimer.current) window.clearTimeout(gTimer.current);
        gTimer.current = window.setTimeout(() => {
          gPressed.current = false;
        }, 1200);
        return;
      }
      if (gPressed.current) {
        const map: Record<string, string> = {
          h: '/',
          p: profile ? `/p/${profile.username}` : '/login',
          m: '/messages',
          n: '/notifications',
          s: '/settings',
        };
        const dest = map[e.key.toLowerCase()];
        gPressed.current = false;
        if (dest) {
          e.preventDefault();
          navigate(dest);
        }
        return;
      }
      if (e.key === 'j' || e.key === 'k') {
        window.dispatchEvent(new CustomEvent('bsdc:feed-navigate', { detail: e.key === 'j' ? 1 : -1 }));
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      if (gTimer.current) window.clearTimeout(gTimer.current);
    };
  }, [navigate, profile, setCommandPaletteOpen, setShortcutsOpen]);
}
