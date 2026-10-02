import {
  getDatabase,
  limitToLast,
  onValue,
  push,
  query,
  ref,
  serverTimestamp,
} from 'firebase/database';
import { getFirebase } from './client';
import type { CorporateEnv } from './env';
import { channelPath, type ChatMessage } from '../domain/chat';

/**
 * Corporate messages live in the bsdc-second realtime database while who may
 * read a channel stays in Postgres. The split is deliberate: delivery wants
 * a socket, authorisation wants an auditable row.
 */
type RawMessage = {
  readonly authorUid?: unknown;
  readonly authorName?: unknown;
  readonly body?: unknown;
  readonly sentAt?: unknown;
};

/** Reads one stored message defensively; the realtime store is schemaless. */
export function toMessage(channelId: string, id: string, raw: unknown): ChatMessage | null {
  if (raw === null || typeof raw !== 'object') return null;
  const value = raw as RawMessage;
  const body = typeof value.body === 'string' ? value.body : '';
  if (body === '') return null;
  return {
    id,
    channelId,
    authorUid: typeof value.authorUid === 'string' ? value.authorUid : 'unknown',
    authorName: typeof value.authorName === 'string' ? value.authorName : 'Unknown',
    body,
    sentAt: typeof value.sentAt === 'number' ? value.sentAt : 0,
  };
}

/** Subscribes to the last `count` messages of a channel. Returns the stopper. */
export function subscribeMessages(
  env: CorporateEnv,
  channelId: string,
  count: number,
  handler: (messages: readonly ChatMessage[]) => void,
  onError: (error: Error) => void,
): () => void {
  const database = getDatabase(getFirebase(env));
  const node = query(ref(database, channelPath(channelId)), limitToLast(count));
  return onValue(
    node,
    (snapshot) => {
      const messages: ChatMessage[] = [];
      snapshot.forEach((child) => {
        const message = toMessage(channelId, child.key ?? '', child.val());
        if (message) messages.push(message);
      });
      handler(messages);
    },
    onError,
  );
}

export async function sendMessage(
  env: CorporateEnv,
  channelId: string,
  author: { readonly uid: string; readonly name: string },
  body: string,
): Promise<void> {
  const database = getDatabase(getFirebase(env));
  await push(ref(database, channelPath(channelId)), {
    authorUid: author.uid,
    authorName: author.name,
    body,
    sentAt: serverTimestamp(),
  });
}
