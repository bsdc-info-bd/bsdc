import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { LiveStatus } from '@/lib/messaging/messenger-channel';
import type * as MessageRepositoryModule from '@/lib/messaging/message-repository';
import type * as MessengerChannelModule from '@/lib/messaging/messenger-channel';
import { useAuthStore } from '@/store/auth-store';

/**
 * The unread badge in the app bar.
 *
 * It lives in its own module because the app bar is on every page: importing
 * it from `use-messaging` put the whole messaging layer — thread state,
 * drafts, the outbox, typing indicators, search — on the critical path of
 * every first paint, to render a number. The repository and the realtime
 * channel were already loaded on demand; now the file that asks them is too.
 */
const FALLBACK_INBOX_MS = 30_000;
const LIVE_RECONCILE_MS = 60_000;

let repositoryPromise: Promise<typeof MessageRepositoryModule> | null = null;
let channelPromise: Promise<typeof MessengerChannelModule> | null = null;

const repository = () => {
  repositoryPromise ??= import('@/lib/messaging/message-repository').catch((error: unknown) => {
    repositoryPromise = null;
    throw error;
  });
  return repositoryPromise;
};

const channelModule = () => {
  channelPromise ??= import('@/lib/messaging/messenger-channel').catch((error: unknown) => {
    channelPromise = null;
    throw error;
  });
  return channelPromise;
};

/**
 * A poll is a last resort, not the transport: it runs only while the realtime
 * socket is not joined. A slower reconciliation while live also repairs missed
 * events after token refreshes, reconnections and transient publication gaps.
 */
export function useUnreadMessageCount(): number {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const queryClient = useQueryClient();
  const { data = 0 } = useQuery({
    queryKey: ['messages-unread', uid],
    queryFn: async () => (await repository()).fetchUnreadMessageCount(),
    enabled: uid !== null,
    staleTime: 10_000,
    refetchInterval: status === 'live' ? LIVE_RECONCILE_MS : FALLBACK_INBOX_MS,
  });

  useEffect(() => {
    if (uid === null) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    void channelModule()
      .then((module) => {
        if (cancelled) return;
        stop = module.joinInbox(uid, {
          onStatus: setStatus,
          onActivity: () => {
            void queryClient.invalidateQueries({ queryKey: ['messages-unread', uid] });
          },
        });
      })
      .catch(() => {
        if (!cancelled) setStatus('offline');
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [uid, queryClient]);

  return data;
}
