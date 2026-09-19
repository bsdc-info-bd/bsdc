/**
 * BSDC — src/features/messenger/useUnreadConversations.ts
 * Purpose : The unread conversation count shown on the messenger tab.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The count is the sum of the viewer's own unread entry across threads, which is how the
 *   conversation document models it. It refreshes whenever the thread list changes, so opening a
 *   conversation and reading it clears the badge without a manual refresh.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/features/auth';
import { listConversations } from '@/entities/conversation/repository';

/**
 * Reads the viewer's unread conversation count.
 * @returns the number of conversations with unread messages
 */
export function useUnreadConversationCount(): number {
  const { session } = useSession();
  const uid = session.uid;
  const [count, setCount] = useState(0);

  const refresh = useCallback(async (): Promise<void> => {
    if (uid === null) {
      setCount(0);
      return;
    }
    const page = await listConversations(uid);
    const total = page.items.reduce(
      (sum, conversation) => sum + (conversation.unread[uid] ?? 0),
      0,
    );
    setCount(total);
  }, [uid]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 45_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return count;
}
