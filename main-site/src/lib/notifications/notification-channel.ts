import type { RealtimeChannel } from '@supabase/supabase-js';
import { ensureRealtimeAuth, getSupabase } from '@/lib/supabase/client';
import type { NotificationRow } from '@/lib/supabase/types';

export interface NotificationStreamHandlers {
  onNotification: (row: NotificationRow, eventType: 'INSERT' | 'UPDATE') => void;
  onStatus?: (status: 'connecting' | 'live' | 'reconnecting' | 'offline') => void;
}

const AUTH_REFRESH_MS = 45 * 60 * 1_000;
const AUTH_RETRY_MS = 12_000;

/**
 * Joins a per-member Supabase Realtime subscription over `public.notifications`
 * (`REPLICA IDENTITY FULL`, RLS-filtered) so in-app badges, notification inbox,
 * and live toast previews react immediately without polling delays.
 */
export function joinNotificationStream(
  uid: string,
  handlers: NotificationStreamHandlers,
): () => void {
  let stopped = false;
  let channel: RealtimeChannel | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const client = getSupabase();
  const topic = `notifications:${uid}:${Math.random().toString(36).slice(2, 8)}`;

  async function start(): Promise<void> {
    if (stopped) return;
    try {
      await ensureRealtimeAuth(uid);
    } catch {
      if (stopped) return;
      handlers.onStatus?.('reconnecting');
      retryTimer = setTimeout(() => void start(), AUTH_RETRY_MS);
      return;
    }
    if (stopped) return;

    handlers.onStatus?.('connecting');
    channel = client
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `uid=eq.${uid}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow | undefined;
          if (row && typeof row.id === 'string') handlers.onNotification(row, 'INSERT');
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `uid=eq.${uid}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow | undefined;
          if (row && typeof row.id === 'string') handlers.onNotification(row, 'UPDATE');
        },
      )
      .subscribe((status: string) => {
        if (stopped) return;
        switch (status) {
          case 'SUBSCRIBED':
            handlers.onStatus?.('live');
            break;
          case 'CHANNEL_ERROR':
            handlers.onStatus?.('reconnecting');
            break;
          case 'TIMED_OUT':
            handlers.onStatus?.('offline');
            break;
        }
      });

    refreshTimer = setInterval(() => {
      void ensureRealtimeAuth(uid).catch(() => undefined);
    }, AUTH_REFRESH_MS);
  }

  void start();

  return () => {
    stopped = true;
    if (refreshTimer !== null) clearInterval(refreshTimer);
    if (retryTimer !== null) clearTimeout(retryTimer);
    const active = channel;
    channel = null;
    if (active !== null) {
      void client.removeChannel(active).catch(() => undefined);
    }
  };
}
