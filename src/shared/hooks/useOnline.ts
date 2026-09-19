/**
 * BSDC — src/shared/hooks/useOnline.ts
 * Purpose : Connectivity state with a deliberate "unknown until proven" start (PART 24.2).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : navigator.onLine is unreliable on captive portals, so the offline experience is always
 *           recoverable: this hook drives the banner, the queue indicator and the retry affordance.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';
import { emit } from '@/core/events/bus';

/**
 * Subscribes to online/offline events.
 * @returns true when the browser reports a connection
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const goOnline = (): void => {
      setOnline(true);
      emit('network:changed', { online: true });
    };
    const goOffline = (): void => {
      setOnline(false);
      emit('network:changed', { online: false });
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
