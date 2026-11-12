import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { isConfigured } from '@/lib/env';
import { ROUTES } from '@/lib/site';
import type { NotificationRow } from '@/lib/supabase/types';
import { useAuthStore } from '@/store/auth-store';

function targetRouteFor(row: NotificationRow): string {
  if (row.kind === 'message' && row.conversation_id) {
    return `${ROUTES.messages}/${row.conversation_id}`;
  }
  if (row.kind === 'moderation' || row.kind === 'feedback') return ROUTES.notifications;
  return ROUTES.notifications;
}

/**
 * Mounts once in AppShell while authenticated: lazily loads the Realtime stream
 * for `public.notifications` (keeping `@supabase/supabase-js` out of the initial
 * entry bundle) and listens to service worker wakes so badges, inbox, and
 * Messenger counters stay live across tabs.
 */
export function useNotificationRealtime(): void {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const seenIds = useRef(new Set<string>());
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    if (uid === null || !isConfigured.supabase) return;

    let disposed = false;
    let stopStream: (() => void) | null = null;

    const refreshAll = (includeMessages = false) => {
      void queryClient.invalidateQueries({ queryKey: ['notifications', uid] });
      void queryClient.invalidateQueries({ queryKey: ['notifications-unread', uid] });
      if (includeMessages) {
        void queryClient.invalidateQueries({ queryKey: ['conversations', uid] });
        void queryClient.invalidateQueries({ queryKey: ['messenger-unread', uid] });
      }
    };

    void import('@/lib/notifications/notification-channel')
      .then(({ joinNotificationStream }) => {
        if (disposed) return;
        stopStream = joinNotificationStream(uid, {
          onNotification(row, eventType) {
            refreshAll(row.kind === 'message');
            if (eventType !== 'INSERT' || row.read_at !== null) return;
            if (seenIds.current.has(row.id)) return;
            seenIds.current.add(row.id);
            if (seenIds.current.size > 100) seenIds.current.clear();

            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

            const currentPath = pathRef.current;
            if (currentPath === ROUTES.notifications) return;
            if (
              row.kind === 'message' &&
              row.conversation_id &&
              currentPath.startsWith(`${ROUTES.messages}/${row.conversation_id}`)
            ) {
              return;
            }

            const label = t(`notifications.kinds.${row.kind}`, {
              actor: t('notifications.someone'),
              defaultValue: t('notifications.title'),
            });
            const preview = row.body?.trim();
            const route = targetRouteFor(row);

            toast.info(label, {
              ...(preview ? { description: preview } : {}),
              action: {
                label: t('notifications.open'),
                onClick: () => navigate(route),
              },
            });
          },
        });
      })
      .catch(() => undefined);

    const onServiceWorkerMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; url?: unknown } | undefined;
      if (data?.type !== 'bsdc:notification') return;
      const url = typeof data.url === 'string' ? data.url : '';
      refreshAll(url.startsWith('/messages'));
    };

    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    sw?.addEventListener('message', onServiceWorkerMessage);

    return () => {
      disposed = true;
      stopStream?.();
      sw?.removeEventListener('message', onServiceWorkerMessage);
    };
  }, [uid, queryClient, t, navigate]);
}
