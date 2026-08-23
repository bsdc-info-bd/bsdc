/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * Global messenger watcher — mounted once at the app root.
 *
 * On ANY page: listens to the user's RTDB chat list in real time and, when a new
 * message arrives from someone else, fires:
 *   1. a comfortable WebAudio receive beep,
 *   2. an in-app toast with the sender, preview and an Open action,
 *   3. a browser notification (only when the user granted permission and the
 *      tab is hidden),
 * while respecting per-chat mute and skipping the currently open conversation.
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { onChatList } from '@/lib/realtime';
import { playBeep, unlockAudio } from '@/lib/chatSounds';
import { showDesktopNotification } from '@/lib/permissions';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import type { UserChatEntry } from '@/types/chat';

export function GlobalChatWatcher() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const soundEnabled = useUIStore((s) => s.soundEnabled);
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    // Unlock the audio context on the first gesture anywhere in the app.
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;
    const me = { name: profile.displayName, uid: profile.uid };
    const lastSeen = new Map<string, number>();
    let initialized = false;

    const unsub = onChatList(profile.uid, (chats: UserChatEntry[]) => {
      // Baseline the first snapshot so page loads never fire stale alerts.
      if (!initialized) {
        chats.forEach((c) => lastSeen.set(c.chatId, c.lastMessageAt || 0));
        initialized = true;
        return;
      }

      const currentPath = window.location.pathname;
      for (const chat of chats) {
        const prev = lastSeen.get(chat.chatId) || 0;
        lastSeen.set(chat.chatId, chat.lastMessageAt || 0);
        if ((chat.lastMessageAt || 0) <= prev) continue;
        if (chat.muted) continue;
        const fromMe = chat.lastSender === me.name;
        if (fromMe) continue;
        const isOpenHere = currentPath === `/messages/${chat.chatId}` || (currentPath === '/messages' && false);
        if (isOpenHere && !document.hidden) continue;

        const title = chat.name || chat.lastSender || 'BSDC';
        const body = chat.lastMessage?.slice(0, 90) || 'New message';
        const open = () => navigateRef.current(`/messages/${chat.chatId}`);

        // 1. Comfortable receive beep (respecting the sound toggle).
        if (soundRef.current) playBeep('received');
        // 2. In-app toast on every page.
        toast.message(title, { description: body, action: { label: 'Open', onClick: open }, duration: 6000 });
        // 3. Desktop/browser notification only when permitted and the tab is hidden.
        if (document.hidden) {
          showDesktopNotification(`${title} · BSDC`, body, { onClick: open });
        }
      }
    });

    return unsub;
  }, [profile?.uid, profile?.displayName]);

  return null;
}
