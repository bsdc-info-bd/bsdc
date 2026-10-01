import { useEffect, useState } from 'react';
import { isConfigured } from '@/lib/env';
import type { PresenceRecord, PresenceState } from '@/lib/realtime/presence';
import { useAuthStore } from '@/store/auth-store';

/** Publishes the signed-in member's presence for as long as the app is open. */
export function usePublishPresence(): void {
  const uid = useAuthStore((state) => state.user?.uid ?? null);

  useEffect(() => {
    if (!uid || !isConfigured.firebase) return;
    let stop: (() => void) | null = null;
    let cancelled = false;

    void import('@/lib/realtime/presence')
      .then(({ trackPresence }) => {
        if (!cancelled) stop = trackPresence(uid);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [uid]);
}

/** Watches another member's presence; reports "offline" until data arrives. */
export function usePresence(uid: string | null): PresenceState {
  const [state, setState] = useState<PresenceState>('offline');

  useEffect(() => {
    if (!uid || !isConfigured.firebase) return;
    let stop: (() => void) | null = null;
    let cancelled = false;

    void import('@/lib/realtime/presence')
      .then(({ subscribeToPresence }) => {
        if (cancelled) return;
        stop = subscribeToPresence(uid, (presence: PresenceRecord) => setState(presence.state));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [uid]);

  return state;
}
