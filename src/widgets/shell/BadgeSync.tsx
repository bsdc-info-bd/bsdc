/**
 * BSDC — src/widgets/shell/BadgeSync.tsx
 * Purpose : Populates the shell badge counts. Rendered lazily, after the first paint.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : This component is the only thing in the shell that imports the messenger and
 *   notification repositories. Keeping it behind a lazy boundary means the badge logic — and the
 *   Firebase code it pulls in — never delays Largest Contentful Paint, and a route that does not
 *   need badges never pays for them.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect } from 'react';
import { useBadgeStore } from '@/shared/stores/badges';
import { useSession } from '@/features/auth';
import { useUnreadNotificationCount } from '@/features/notifications';
import { useUnreadConversationCount } from '@/features/messenger';

/**
 * Syncs unread counts into the badge store.
 * @returns null — the component renders nothing by design
 */
export function BadgeSync(): null {
  const { session } = useSession();
  const notifications = useUnreadNotificationCount();
  const messages = useUnreadConversationCount();
  const setCounts = useBadgeStore((state) => state.setCounts);

  useEffect(() => {
    setCounts({ messages, notifications });
  }, [messages, notifications, setCounts]);

  useEffect(() => {
    if (session.status !== 'signed-in') setCounts({ messages: 0, notifications: 0 });
  }, [session.status, setCounts]);

  return null;
}
