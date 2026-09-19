/**
 * BSDC — src/services/realtime/typing.ts
 * Purpose : Typing indicators and delivery receipts in the Realtime Database.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Typing is ephemeral by definition: it is worthless five seconds later. It therefore
 *   lives in the Realtime Database with an `onDisconnect` cleanup, and the durable message
 *   collection never hears about it.
 *   A typing record self-expires: the writer clears it after a short idle window, and readers
 *   ignore any record older than the window, so a device that died mid-keystroke cannot leave
 *   someone "typing" forever.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { receiptPath, typingPath } from '@/core/config/collections';
import { rtdbOnValue, rtdbRemove, rtdbSet, rtdbUpdate } from '@/services/firebase/database';
import { acquireListener, type Unsubscribe } from './registry';

/** How long a typing record stays valid without a refresh, in milliseconds. */
export const TYPING_TTL_MS = 4_000;

/** How often a typing client re-announces itself while the person keeps typing. */
export const TYPING_REFRESH_MS = 2_500;

/**
 * Announces that an account is typing in a conversation.
 * @param conversationId conversation id
 * @param uid account id
 */
export async function announceTyping(conversationId: string, uid: string): Promise<void> {
  await rtdbUpdate(typingPath(conversationId, uid), { at: Date.now() });
}

/**
 * Stops announcing typing.
 * @param conversationId conversation id
 * @param uid account id
 */
export async function stopTyping(conversationId: string, uid: string): Promise<void> {
  await rtdbRemove(typingPath(conversationId, uid));
}

/**
 * Watches who is typing in a conversation, excluding the viewer.
 * @param conversationId conversation id
 * @param viewerUid the viewer's account id
 * @param handler receives the ids of the accounts currently typing
 * @returns a release function
 */
export function watchTyping(
  conversationId: string,
  viewerUid: string,
  handler: (typingUids: readonly string[]) => void,
): Unsubscribe {
  return acquireListener(`typing:${conversationId}`, 'typing', () =>
    rtdbOnValue(typingPath(conversationId, viewerUid).replace(`/${viewerUid}`, ''), (value) => {
      if (value === null || typeof value !== 'object') {
        handler([]);
        return;
      }
      const now = Date.now();
      const entries = value as Record<string, { at?: number } | null>;
      const active = Object.entries(entries)
        .filter(([uid]) => uid !== viewerUid)
        .filter(
          ([, record]) => typeof record?.at === 'number' && now - (record.at ?? 0) < TYPING_TTL_MS,
        )
        .map(([uid]) => uid);
      handler(active);
    }),
  );
}

/**
 * Records that a message reached a recipient.
 * @param conversationId conversation id
 * @param messageId message id
 * @param uid recipient account id
 */
export async function markDelivered(
  conversationId: string,
  messageId: string,
  uid: string,
): Promise<void> {
  await rtdbSet(receiptPath(conversationId, messageId, uid), {
    state: 'delivered',
    at: Date.now(),
  });
}

/**
 * Records that a recipient read a message.
 * @param conversationId conversation id
 * @param messageId message id
 * @param uid recipient account id
 */
export async function markReadReceipt(
  conversationId: string,
  messageId: string,
  uid: string,
): Promise<void> {
  await rtdbSet(receiptPath(conversationId, messageId, uid), { state: 'read', at: Date.now() });
}
