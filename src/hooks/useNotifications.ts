/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useMemo, useState } from 'react';
import { markAllNotificationsRead, markNotificationRead, onNotifications } from '@/lib/notifications';
import type { AppNotification } from '@/types/domain';
import { useUIStore } from '@/stores/uiStore';
import { audioSrc } from '@/lib/utils';

export function useNotifications(uid: string | null) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const soundEnabled = useUIStore((s) => s.soundEnabled);

  useEffect(() => {
    if (!uid) {
      setItems([]);
      setLoading(false);
      return () => undefined;
    }
    setLoading(true);
    let prevCount = -1;
    const unsub = onNotifications(
      uid,
      (list) => {
        setItems(list);
        setLoading(false);
        const unread = list.filter((n) => !n.read).length;
        if (prevCount >= 0 && list.length > prevCount && unread > 0 && soundEnabled) {
          playChime();
        }
        prevCount = list.length;
      },
      () => setLoading(false),
    );
    return unsub;
  }, [uid, soundEnabled]);

  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items]);

  async function markRead(id: string) {
    if (!uid) return;
    await markNotificationRead(uid, id).catch(() => undefined);
  }

  async function markAllRead() {
    if (!uid) return;
    await markAllNotificationsRead(uid).catch(() => undefined);
  }

  return { items, unreadCount, loading, markRead, markAllRead };
}

let chimeAudio: HTMLAudioElement | null = null;
function playChime() {
  try {
    if (!chimeAudio) chimeAudio = new Audio(audioSrc());
    chimeAudio.currentTime = 0;
    void chimeAudio.play().catch(() => undefined);
  } catch {
    /* audio unavailable */
  }
}
