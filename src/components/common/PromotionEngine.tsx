/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * PromotionEngine — mounted once at the app root.
 *
 * Every 4 minutes (and on sign-in) it:
 *   1. computes REAL follow/post suggestions for the signed-in user,
 *   2. evaluates REAL reminders (streak, unread messages, profile, digest),
 *   3. delivers due reminders through toast + native/FCM push + formsubmit
 *      email (each channel individually enabled),
 *   4. exposes suggestions to the UI via a lightweight store.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { onChatList } from '@/lib/realtime';
import { computeSuggestions, deliverReminderChannels, evaluateReminders } from '@/lib/promotions';
import { setSuggestionCache, getSuggestionCache } from '@/lib/suggestionStore';
import { emailNotificationsEnabled } from '@/lib/emailNotifications';
import { getNotificationState } from '@/lib/pushNotifications';


export function PromotionEngine() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const soundEnabled = useUIStore((s) => s.soundEnabled);

  // --- unread count via the RTDB chat list (cheap, real-time) ---
  useEffect(() => {
    if (!profile?.uid) return;
    const unsub = onChatList(profile.uid, () => undefined);
    return unsub;
  }, [profile]);

  // --- reminders + suggestions loop ---
  useEffect(() => {
    if (!profile?.uid) return;
    let cancelled = false;
    let unread = 0;

    const unsubChats = onChatList(profile.uid, (chats) => {
      unread = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    });

    async function run() {
      try {
        // Real suggestions (cached 5 min, shared with the UI).
        const cache = getSuggestionCache();
        if (!cancelled && Date.now() - cache.at() > 5 * 60 * 1000) {
          const { fetchFollowingIds } = await import('@/lib/data');
          const following = new Set(await fetchFollowingIds(profile!.uid, 300).catch(() => [] as string[]));
          const suggestions = await computeSuggestions(profile!, following);
          if (!cancelled) setSuggestionCache(suggestions);
        }

        // Real reminders.
        const reminders = await evaluateReminders(profile!, unread);
        if (cancelled || reminders.length === 0) return;
        const reminder = reminders[0];
        const pushGranted = getNotificationState() === 'granted';
        toast.message(reminder.title, {
          description: reminder.body,
          duration: 8000,
          action: { label: 'Open', onClick: () => navigate(reminder.url) },
        });
        await deliverReminderChannels(reminder, profile!, {
          push: pushGranted,
          email: emailNotificationsEnabled(),
          sound: soundEnabled,
        });
      } catch {
        /* engine is best-effort */
      }
    }

    const first = window.setTimeout(() => void run(), 15000);
    const interval = window.setInterval(() => void run(), 4 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(interval);
      unsubChats();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  return null;
}
