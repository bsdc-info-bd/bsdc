/**
 * BSDC — src/entities/conversation/repository.ts
 * Purpose : Messenger persistence: threads, message pages, sends and read receipts.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Threads are paged by `lastMessageAt`; messages inside a thread are paged by
 *   `createdAt` ascending so the newest message is at the bottom where a chat expects it.
 *   Sending writes the mirror first (the bubble appears instantly), queues the mutation and then
 *   attempts the remote write; the client id makes the server echo collapse into the same bubble.
 *   Typing indicators and presence are not here — they are the Realtime Database's job.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { COLLECTIONS, SUBCOLLECTIONS, messagePath } from '@/core/config/collections';
import { firestoreDb } from '@/services/firebase/app';
import { fromQuery, translateFirestoreError } from '@/services/firebase/firestore';
import { acquireListener, type Unsubscribe } from '@/services/realtime/registry';
import { mirrorGet, mirrorList, mirrorPut } from '@/services/offline/mirror';
import {
  readThrough,
  writeThrough,
  type ReadThroughResult,
  type WriteThroughResult,
} from '@/services/offline/sync';
import type { ChatMessage, Conversation } from './model';

/** Messages loaded per page. */
export const MESSAGE_PAGE_SIZE = 30;

/** Conversations loaded per page. */
export const CONVERSATION_PAGE_SIZE = 25;

/**
 * Lists the viewer's conversations.
 * @param uid viewer account id
 * @param limit page size
 * @returns the conversations with their provenance
 */
export async function listConversations(
  uid: string,
  limit: number = CONVERSATION_PAGE_SIZE,
): Promise<ReadThroughResult<Conversation>> {
  return await readThrough<Conversation>(
    'conversations',
    async () => {
      const {
        collection,
        query: buildQuery,
        where,
        orderBy,
        limit: cap,
        getDocs,
      } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        const snapshot = await getDocs(
          buildQuery(
            collection(db, COLLECTIONS.conversations),
            where('participantUids', 'array-contains', uid),
            where('deletedAt', '==', null),
            orderBy('lastMessageAt', 'desc'),
            cap(limit),
          ),
        );
        return fromQuery<Conversation>(snapshot);
      } catch (error) {
        throw translateFirestoreError(error, 'conversation.list');
      }
    },
    {
      orderBy: 'lastMessageAt',
      direction: 'desc',
      where: [(conversation: Conversation) => conversation.participantUids.includes(uid)],
    },
  );
}

/**
 * Loads the latest page of messages in a conversation.
 * @param conversationId conversation id
 * @param limit page size
 * @returns the messages with their provenance
 */
export async function listMessages(
  conversationId: string,
  limit: number = MESSAGE_PAGE_SIZE,
): Promise<ReadThroughResult<ChatMessage>> {
  return await readThrough<ChatMessage>(
    'messages',
    async () => {
      const {
        collection,
        query: buildQuery,
        where,
        orderBy,
        limit: cap,
        getDocs,
      } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        const snapshot = await getDocs(
          buildQuery(
            collection(db, COLLECTIONS.conversations, conversationId, SUBCOLLECTIONS.messages),
            where('deletedAt', '==', null),
            orderBy('createdAt', 'asc'),
            cap(limit),
          ),
        );
        return fromQuery<ChatMessage>(snapshot);
      } catch (error) {
        throw translateFirestoreError(error, 'message.list');
      }
    },
    {
      orderBy: 'createdAt',
      direction: 'asc',
      where: [(message: ChatMessage) => message.conversationId === conversationId],
    },
  );
}

/**
 * Reads the messages already on this device, newest last.
 * @param conversationId conversation id
 * @returns the mirrored messages
 */
export async function peekMessages(conversationId: string): Promise<readonly ChatMessage[]> {
  return await mirrorList<ChatMessage>('messages', {
    where: [(message: ChatMessage) => message.conversationId === conversationId],
    orderBy: 'createdAt',
    direction: 'asc',
  });
}

/**
 * Sends a message.
 * @param message the message entity
 * @returns the write outcome
 */
export async function sendMessage(message: ChatMessage): Promise<WriteThroughResult> {
  return await writeThrough(
    'messages',
    message,
    {
      kind: 'message.send',
      entityId: message.clientId,
      payload: message as unknown as Readonly<Record<string, unknown>>,
    },
    async () => {
      const { doc, setDoc, updateDoc, serverTimestamp } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await setDoc(doc(db, messagePath(message.conversationId, message.id)), message);
        await updateDoc(doc(db, COLLECTIONS.conversations, message.conversationId), {
          lastMessagePreview: message.body.slice(0, 120),
          lastMessageAt: serverTimestamp(),
          lastMessageSenderUid: message.senderUid,
        });
      } catch (error) {
        throw translateFirestoreError(error, 'message.send');
      }
    },
  );
}

/**
 * Marks every message in a conversation as read for the viewer.
 * @param conversationId conversation id
 * @param uid viewer account id
 * @returns the write outcome
 */
export async function markConversationRead(
  conversationId: string,
  uid: string,
): Promise<WriteThroughResult> {
  const messages = await peekMessages(conversationId);
  const now = new Date().toISOString();
  for (const message of messages) {
    if (message.senderUid === uid || message.readBy.includes(uid)) continue;
    await mirrorPut('messages', {
      ...message,
      readBy: [...message.readBy, uid],
      updatedAt: now,
    });
  }

  return await writeThrough(
    'messages',
    {
      id: `${conversationId}:${uid}`,
      conversationId,
      uid,
      readAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    {
      kind: 'notification.read',
      entityId: `${conversationId}:${uid}`,
      payload: { conversationId },
    },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, COLLECTIONS.conversations, conversationId), {
          [`unread.${uid}`]: 0,
          updatedAt: now,
        });
      } catch (error) {
        throw translateFirestoreError(error, 'conversation.read');
      }
    },
  );
}

/**
 * Watches a conversation's messages live.
 * @param conversationId conversation id
 * @param limit maximum messages to keep subscribed
 * @param handler receives the current messages
 * @returns a release function
 */
export function watchMessages(
  conversationId: string,
  handler: (messages: readonly ChatMessage[]) => void,
  limit: number = MESSAGE_PAGE_SIZE,
): Unsubscribe {
  return acquireListener(`messages:${conversationId}`, 'messages', async () => {
    const {
      collection,
      query: buildQuery,
      where,
      orderBy,
      limit: cap,
      onSnapshot,
    } = await import('firebase/firestore');
    const db = await firestoreDb();
    return onSnapshot(
      buildQuery(
        collection(db, COLLECTIONS.conversations, conversationId, SUBCOLLECTIONS.messages),
        where('deletedAt', '==', null),
        orderBy('createdAt', 'asc'),
        cap(limit),
      ),
      (snapshot) => {
        const messages = fromQuery<ChatMessage>(snapshot);
        void (async () => {
          const { mirrorMerge } = await import('@/services/offline/mirror');
          await mirrorMerge('messages', messages);
          handler(messages);
        })();
      },
    );
  });
}

/**
 * Reads one conversation from the device mirror.
 * @param conversationId conversation id
 * @returns the conversation, or undefined
 */
export async function peekConversation(conversationId: string): Promise<Conversation | undefined> {
  return await mirrorGet<Conversation>('conversations', conversationId);
}
