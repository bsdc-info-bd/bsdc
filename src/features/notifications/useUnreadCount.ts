/**
 * BSDC — src/features/notifications/useUnreadCount.ts
 * Purpose : One hook that owns the unread notification count for the whole shell.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The header badge, the bottom-nav badge and the notification route must never disagree,
 *   so they all read this hook, which subscribes once through the listener registry. The registry
 *   reference-counts the subscription, so three consumers still mean one socket listener.
 *   The device-mirror value is used as the first paint so the badge does not flash zero on load.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';
import { useSession } from '@/features/auth';
import { peekUnreadCount, watchUnreadCount } from '@/entities/notification/repository';

/**
 * Reads the live unread notification count.
 * @returns the number of unread notifications, zero when signed out
 */
export function useUnreadNotificationCount(): number {
  const { session } = useSession();
  const uid = session.uid;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (uid === null) {
      setCount(0);
      return;
    }
    let active = true;
    void peekUnreadCount(uid).then((value) => {
      if (active) setCount(value);
    });
    const release = watchUnreadCount(uid, (next) => {
      if (active) setCount(next);
    });
    return () => {
      active = false;
      release();
    };
  }, [uid]);

  return count;
}
