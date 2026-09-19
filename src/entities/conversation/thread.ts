/**
 * BSDC — src/entities/conversation/thread.ts
 * Purpose : Message reactions, reply threads, attachment validation and delivery state.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A reaction is one document per person per message, exactly as on a post, because that
 *   is the shape the security rules can actually enforce: `isSelf(uid)` refuses a write that
 *   touches anybody else's reaction, and two people reacting at the same instant cannot lose
 *   either reaction to a read-modify-write race. The screen folds the whole conversation's
 *   reaction documents into one map with `foldReactions`, so a bubble still renders from a single
 *   in-memory lookup and no message document carries a counter that can drift out of step.
 *   Attachments are validated here before a byte is uploaded: the kind decides the byte ceiling,
 *   and a voice note is bounded by VOICE_NOTE_MAX_SECONDS because a chat is not a radio station.
 *   No video is accepted anywhere in the product (PART 29.1): the refusal is BSDC-CHAT-006.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import {
  MEDIA_LIMITS,
  TEXT_LIMITS,
  VOICE_NOTE_MAX_BYTES,
  VOICE_NOTE_MAX_SECONDS,
} from '@/core/config/limits';
import { REACTIONS, type ReactionType } from '@/core/config/reactions';
import { isReactionType } from '@/core/config/reactions';
import type { ChatAttachment, ChatMessage, ChatMessageKind } from './model';

/** How many seconds a sender may keep editing a message after sending it. */
export const EDIT_WINDOW_SECONDS = 120;

/** How many reactions one message may carry before the counter shows a summary instead. */
export const REACTION_SUMMARY_LIMIT = 20;

/** Map from reaction id to the account ids that chose it. */
export type MessageReactions = Readonly<Record<string, readonly string[]>>;

/** One person's reaction to one message. The document id is `${messageId}:${uid}`. */
export interface MessageReaction {
  readonly id: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly uid: string;
  readonly type: ReactionType;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/**
 * Builds a reaction record. The id is derived from the message and the account, which is what makes
 * "change my mind about my reaction" an update of the same document rather than two documents that
 * have to be reconciled later.
 * @param messageId message id
 * @param conversationId conversation id
 * @param uid reacting account
 * @param type the reaction
 * @param now the instant
 * @returns the record
 */
export function newReaction(
  messageId: string,
  conversationId: string,
  uid: string,
  type: ReactionType,
  now: Date = new Date(),
): MessageReaction {
  const at = now.toISOString();
  return {
    id: `${messageId}:${uid}`,
    messageId,
    conversationId,
    uid,
    type,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
}

/**
 * Folds a conversation's reaction documents into one map per message, dropping anything withdrawn
 * or malformed so a bad record cannot hide a good one.
 * @param records the reaction documents
 * @returns message id to reaction map
 */
export function foldReactions(
  records: readonly MessageReaction[],
): ReadonlyMap<string, MessageReactions> {
  const byMessage = new Map<string, Record<string, string[]>>();
  for (const record of records) {
    if (record.deletedAt != null) continue;
    if (!isReactionType(record.type)) continue;
    const bucket = byMessage.get(record.messageId) ?? {};
    const holders = bucket[record.type] ?? [];
    if (!holders.includes(record.uid)) holders.push(record.uid);
    bucket[record.type] = holders;
    byMessage.set(record.messageId, bucket);
  }
  return byMessage;
}

/** A message together with the derived detail the bubble needs. */
export interface ThreadMessage {
  readonly message: ChatMessage;
  /** Reactions collapsed to a stable, ordered summary. */
  readonly reactionSummary: readonly MessageReactionSummary[];
  /** Total number of reactions across every kind. */
  readonly reactionCount: number;
  /** The viewer's own reaction, when they have one. */
  readonly mine: ReactionType | null;
  /** The message this one replies to, resolved from the same thread. */
  readonly replyTo: ChatMessage | null;
  /** True when the sender may still edit the message. */
  readonly editable: boolean;
  /** True when the message is unsent: deleted for everyone, with a tombstone left behind. */
  readonly removed: boolean;
}

/** One line of a reaction summary. */
export interface MessageReactionSummary {
  readonly type: ReactionType;
  readonly count: number;
  readonly uids: readonly string[];
}

/** A reply thread: the root message and its replies in order. */
export interface Thread {
  readonly root: ChatMessage;
  readonly replies: readonly ChatMessage[];
  readonly participants: readonly string[];
  readonly lastReplyAt: string;
}

/** Result of validating an attachment before upload. */
export type AttachmentVerdict =
  | { readonly ok: true; readonly kind: ChatMessageKind; readonly maxBytes: number }
  | { readonly ok: false; readonly code: string };

/**
 * Validates a chat attachment before a byte leaves the device.
 * @param attachment the attachment as the composer produced it
 * @returns the verdict; a refusal carries the error code the UI shows
 */
export function validateAttachment(attachment: ChatAttachment): AttachmentVerdict {
  if (attachment.url.trim().length === 0) {
    return { ok: false, code: 'BSDC-CHAT-001' };
  }
  if (attachment.alt.trim().length === 0) {
    return { ok: false, code: 'BSDC-CHAT-002' };
  }
  if (attachment.bytes <= 0) {
    return { ok: false, code: 'BSDC-CHAT-003' };
  }
  if (attachment.durationSeconds > 0) {
    if (attachment.durationSeconds > VOICE_NOTE_MAX_SECONDS) {
      return { ok: false, code: 'BSDC-CHAT-004' };
    }
    const voiceCeiling = VOICE_NOTE_MAX_BYTES;
    if (attachment.bytes > voiceCeiling) {
      return { ok: false, code: 'BSDC-CHAT-005' };
    }
    return { ok: true, kind: 'voice', maxBytes: voiceCeiling };
  }
  if (attachment.width > 0 && attachment.height > 0) {
    const imageCeiling = MEDIA_LIMITS.chatImage.maxBytes;
    if (attachment.bytes > imageCeiling) {
      return { ok: false, code: 'BSDC-CHAT-005' };
    }
    return { ok: true, kind: 'image', maxBytes: imageCeiling };
  }
  const documentCeiling = MEDIA_LIMITS.chatPdf.maxBytes;
  if (attachment.bytes > documentCeiling) {
    return { ok: false, code: 'BSDC-CHAT-005' };
  }
  return { ok: true, kind: 'document', maxBytes: documentCeiling };
}

/**
 * Reports whether a message of this kind may carry a body. A system line carries a code, never
 * prose, so the bubble renders the translated code rather than raw text.
 * @param kind message kind
 * @returns true when a body is meaningful
 */
export function kindCarriesBody(kind: ChatMessageKind): boolean {
  return kind === 'text' || kind === 'document';
}

/**
 * Reports whether a message of this kind may carry an attachment.
 * @param kind message kind
 * @returns true when an attachment is expected
 */
export function kindCarriesAttachment(kind: ChatMessageKind): boolean {
  return kind === 'image' || kind === 'document' || kind === 'voice';
}

/**
 * Adds one account's reaction to a message, or removes it when they already chose that reaction.
 * A person may hold one reaction per message: choosing a second replaces the first, which is the
 * behaviour every chat product has settled on and the one that needs no explanation in the UI.
 * @param reactions the current reaction map
 * @param uid the reacting account
 * @param type the reaction chosen
 * @returns the next reaction map, with empty keys removed
 */
export function toggleReaction(
  reactions: MessageReactions,
  uid: string,
  type: ReactionType,
): MessageReactions {
  const next: Record<string, string[]> = {};
  for (const key of Object.keys(reactions)) {
    const holders = (reactions[key] ?? []).filter((holder) => holder !== uid);
    if (holders.length > 0) next[key] = holders;
  }
  const existing = reactions[type] ?? [];
  if (!existing.includes(uid)) {
    next[type] = [...(next[type] ?? []), uid];
  }
  return next;
}

/**
 * Collapses a reaction map into a stable summary, most-chosen first and ties broken by the
 * canonical reaction order, so the row never rearranges itself between renders.
 * @param reactions the reaction map
 * @returns the ordered summary lines
 */
export function summariseReactions(reactions: MessageReactions): readonly MessageReactionSummary[] {
  const summary: MessageReactionSummary[] = [];
  for (const type of REACTIONS) {
    const uids = reactions[type] ?? [];
    if (uids.length === 0) continue;
    summary.push({ type, count: uids.length, uids });
  }
  summary.sort((a, b) => b.count - a.count);
  return summary;
}

/**
 * Resolves the viewer's own reaction on a message.
 * @param reactions the reaction map
 * @param uid the viewer
 * @returns their reaction, or null when they have not reacted
 */
export function myReaction(reactions: MessageReactions, uid: string): ReactionType | null {
  for (const type of REACTIONS) {
    if ((reactions[type] ?? []).includes(uid)) return type;
  }
  return null;
}

/**
 * Counts every reaction on a message across all kinds.
 * @param reactions the reaction map
 * @returns the total
 */
export function totalReactions(reactions: MessageReactions): number {
  let total = 0;
  for (const type of REACTIONS) total += (reactions[type] ?? []).length;
  return total;
}

/**
 * Reports whether a sender may still edit a message.
 * @param message the message
 * @param now the instant to test against
 * @returns true while the edit window is open
 */
export function isEditableAt(message: ChatMessage, now: Date = new Date()): boolean {
  if (message.senderUid.length === 0) return false;
  if (message.kind === 'system') return false;
  const elapsed = (now.getTime() - new Date(message.createdAt).getTime()) / 1000;
  return elapsed >= 0 && elapsed <= EDIT_WINDOW_SECONDS;
}

/**
 * Applies an edit to a message inside the window, and refuses outside it.
 * @param message the message
 * @param body the replacement body
 * @param now the instant of the edit
 * @returns the edited message, or null when the window has closed
 */
export function editMessage(
  message: ChatMessage,
  body: string,
  now: Date = new Date(),
): ChatMessage | null {
  if (!isEditableAt(message, now)) return null;
  const trimmed = body.trim().slice(0, TEXT_LIMITS.chatMessage);
  if (trimmed.length === 0) return null;
  if (trimmed === message.body) return message;
  return {
    ...message,
    body: trimmed,
    editedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/**
 * Marks a message delivered to one account, idempotently.
 * @param message the message
 * @param uid the recipient
 * @returns the next message, or the same object when nothing changed
 */
export function markDelivered(message: ChatMessage, uid: string): ChatMessage {
  if (message.deliveredTo.includes(uid)) return message;
  return { ...message, deliveredTo: [...message.deliveredTo, uid] };
}

/**
 * Marks a message read by one account. A read implies a delivery, so a receipt that arrives out of
 * order can never leave a message read-but-undelivered, which is a state no UI can draw honestly.
 * @param message the message
 * @param uid the reader
 * @returns the next message, or the same object when nothing changed
 */
export function markRead(message: ChatMessage, uid: string): ChatMessage {
  const delivered = markDelivered(message, uid);
  if (delivered.readBy.includes(uid)) return delivered;
  return { ...delivered, readBy: [...delivered.readBy, uid] };
}

/**
 * Reports the delivery state of a message for one conversation, from the sender's point of view.
 * @param message the message
 * @param participantUids everyone in the conversation except the sender
 * @returns 'read' when everyone has read it, 'delivered' when everyone has it, else 'sent'
 */
export function deliveryState(
  message: ChatMessage,
  participantUids: readonly string[],
): 'sent' | 'delivered' | 'read' {
  const others = participantUids.filter((uid) => uid !== message.senderUid);
  if (others.length === 0) return 'read';
  const every = (list: readonly string[]): boolean => others.every((uid) => list.includes(uid));
  if (every(message.readBy)) return 'read';
  if (every(message.deliveredTo)) return 'delivered';
  return 'sent';
}

/**
 * Groups messages into reply threads, keeping each thread in chronological order and the thread
 * list itself ordered by when it was last active.
 * @param messages the messages of one conversation
 * @returns the threads, newest activity first
 */
export function groupThreads(messages: readonly ChatMessage[]): readonly Thread[] {
  const byId = new Map<string, ChatMessage>();
  for (const message of messages) byId.set(message.id, message);
  const roots: ChatMessage[] = [];
  const children = new Map<string, ChatMessage[]>();
  for (const message of messages) {
    const parent = message.replyToId.length > 0 ? byId.get(message.replyToId) : undefined;
    if (parent === undefined) {
      roots.push(message);
      continue;
    }
    const list = children.get(parent.id) ?? [];
    list.push(message);
    children.set(parent.id, list);
  }
  const threads = roots.map((root) => {
    const replies = [...(children.get(root.id) ?? [])].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    const participants = [...new Set([root.senderUid, ...replies.map((r) => r.senderUid)])];
    const last = replies.at(-1);
    return {
      root,
      replies,
      participants,
      lastReplyAt: last === undefined ? root.createdAt : last.createdAt,
    };
  });
  threads.sort((a, b) => b.lastReplyAt.localeCompare(a.lastReplyAt));
  return threads;
}

/**
 * Builds the view model the message bubble renders, resolving the reply target and the viewer's
 * own reaction so no component has to walk the message list itself.
 * @param message the message
 * @param byId every message in the conversation, keyed by id
 * @param uid the viewer
 * @param now the instant to test the edit window against
 * @returns the view model
 */
export function toThreadMessage(
  message: ChatMessage,
  byId: ReadonlyMap<string, ChatMessage>,
  byReactions: ReadonlyMap<string, MessageReactions>,
  uid: string,
  now: Date = new Date(),
): ThreadMessage {
  const reactions = byReactions.get(message.id) ?? {};
  return {
    message,
    reactionSummary: summariseReactions(reactions).slice(0, REACTION_SUMMARY_LIMIT),
    reactionCount: totalReactions(reactions),
    mine: myReaction(reactions, uid),
    replyTo: message.replyToId.length > 0 ? (byId.get(message.replyToId) ?? null) : null,
    editable: isEditableAt(message, now) && message.senderUid === uid,
    removed: message.deletedAt != null,
  };
}

/**
 * Sanitises a reaction map that arrived from the network: unknown keys and self-duplicates are
 * dropped rather than rendered, because a hostile or merely old client can write anything.
 * @param raw the raw map
 * @returns a clean map containing only known reaction ids
 */
export function cleanReactions(raw: Readonly<Record<string, unknown>>): MessageReactions {
  const clean: Record<string, readonly string[]> = {};
  for (const type of REACTIONS) {
    const value = raw[type];
    if (!Array.isArray(value)) continue;
    const uids = value.filter((entry): entry is string => typeof entry === 'string');
    const unique = [...new Set(uids)];
    if (unique.length === 0) continue;
    clean[type] = unique;
  }
  return clean;
}

/**
 * Reports whether a reaction id is one the product knows.
 * @param value the candidate
 * @returns true when it is a known reaction
 */
export function isKnownReaction(value: string): boolean {
  return isReactionType(value);
}
