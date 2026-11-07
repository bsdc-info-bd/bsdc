import type { Message } from './message-types';

const prefix = 'bsdc:message-outbox:';

function key(uid: string, conversationId: string): string {
  return `${prefix}${encodeURIComponent(uid)}:${encodeURIComponent(conversationId)}`;
}

/**
 * Keep only unconfirmed outgoing lines in this tab's session. A reload may have
 * interrupted an HTTP response after the database committed, so pending lines
 * come back as retryable failures and retain their original idempotency key.
 * Storage can be disabled or full: the in-memory outbox remains usable.
 */
function isStoredMessage(item: unknown, uid: string, conversationId: string): item is Message {
  if (typeof item !== 'object' || item === null) return false;
  const row = item as Record<string, unknown>;
  return (
    row.conversationId === conversationId &&
    row.senderUid === uid &&
    typeof row.clientId === 'string' &&
    row.id === `pending:${row.clientId}` &&
    typeof row.body === 'string' &&
    typeof row.createdAt === 'string' &&
    typeof row.mediaUrl === 'string' &&
    typeof row.mediaName === 'string' &&
    typeof row.codeLanguage === 'string' &&
    typeof row.kind === 'string' &&
    ['text', 'image', 'audio', 'video', 'file', 'snippet', 'system'].includes(row.kind) &&
    (row.replyTo === null || typeof row.replyTo === 'string') &&
    Array.isArray(row.readBy) &&
    Array.isArray(row.myReactions) &&
    typeof row.reactions === 'object' &&
    row.reactions !== null &&
    (row.clientState === 'pending' || row.clientState === 'failed')
  );
}

export function readOutbox(uid: string, conversationId: string): Message[] {
  try {
    const raw = sessionStorage.getItem(key(uid, conversationId));
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[])
      .filter((item): item is Message => isStoredMessage(item, uid, conversationId))
      .map((message) => ({ ...message, clientState: 'failed' as const }));
  } catch {
    return [];
  }
}

export function writeOutbox(
  uid: string,
  conversationId: string,
  messages: readonly Message[],
): void {
  try {
    const storageKey = key(uid, conversationId);
    if (messages.length === 0) sessionStorage.removeItem(storageKey);
    else sessionStorage.setItem(storageKey, JSON.stringify(messages));
  } catch {
    // The live in-memory queue is still available if storage is blocked/full.
  }
}
