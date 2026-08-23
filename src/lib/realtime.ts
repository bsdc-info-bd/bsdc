/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import {
  ref,
  get,
  set,
  update,
  push,
  onValue,
  onDisconnect,
  remove,
  type DatabaseReference,
} from 'firebase/database';
import { rtdb } from '@/config/firebase';
import type { ChatMessage, ChatMetadata, ChatParticipant, ChatType, PresenceInfo, TypingInfo, UserChatEntry } from '@/types/chat';

const EMPTY_MESSAGE: Omit<ChatMessage, 'id'> = {
  senderId: '',
  senderName: '',
  senderAvatar: '',
  text: '',
  imageUrl: '',
  codeSnippet: '',
  codeLanguage: '',
  linkUrl: '',
  linkTitle: '',
  linkImage: '',
  replyToId: null,
  replyToText: '',
  replyToSender: '',
  reactions: {},
  readBy: {},
  edited: false,
  deleted: false,
  deletedFor: [],
  createdAt: 0,
};

export function normalizeChatMessage(raw: Record<string, unknown>, id: string): ChatMessage {
  return { ...EMPTY_MESSAGE, ...(raw as Partial<ChatMessage>), id };
}

export function normalizeChatMetadata(raw: Record<string, unknown>, id: string): ChatMetadata {
  const participants = Array.isArray(raw.participants) ? (raw.participants as ChatParticipant[]) : [];
  return {
    id,
    type: (raw.type as ChatType) || 'direct',
    name: (raw.name as string) || '',
    description: (raw.description as string) || '',
    photo: (raw.photo as string) || '',
    category: (raw.category as string) || '',
    isPublic: Boolean(raw.isPublic),
    participants,
    participantIds: Array.isArray(raw.participantIds) ? (raw.participantIds as string[]) : participants.map((p) => p.uid),
    createdBy: (raw.createdBy as string) || '',
    pinnedMessageId: (raw.pinnedMessageId as string) || null,
    lastMessage: (raw.lastMessage as string) || '',
    lastMessageAt: (raw.lastMessageAt as number) || 0,
    createdAt: (raw.createdAt as number) || 0,
  };
}

export function directChatId(a: string, b: string): string {
  return `dm_${[a, b].sort().join('_')}`;
}

export function chatRef(chatId: string, ...segments: string[]): DatabaseReference {
  return ref(rtdb(), ['chats', chatId, ...segments].join('/'));
}

export function userChatEntryRef(uid: string, chatId: string): DatabaseReference {
  return ref(rtdb(), `userChats/${uid}/${chatId}`);
}

/* ---------------------------------------------------------------- chats */

export async function ensureDirectChat(me: ChatParticipant, other: ChatParticipant): Promise<string> {
  const chatId = directChatId(me.uid, other.uid);
  const metaRef = chatRef(chatId, 'metadata');
  const snap = await get(metaRef);
  if (!snap.exists()) {
    const metadata: ChatMetadata = {
      id: chatId,
      type: 'direct',
      name: '',
      description: '',
      photo: '',
      category: '',
      isPublic: false,
      participants: [me, other],
      participantIds: [me.uid, other.uid],
      createdBy: me.uid,
      pinnedMessageId: null,
      lastMessage: '',
      lastMessageAt: Date.now(),
      createdAt: Date.now(),
    };
    await set(metaRef, metadata);
  }
  return chatId;
}

export async function createGroupChat(
  createdBy: ChatParticipant,
  name: string,
  description: string,
  participants: ChatParticipant[],
  type: ChatType = 'group',
  isPublic = false,
  category = '',
): Promise<string> {
  const chatId = push(ref(rtdb(), 'chats')).key || `grp_${Date.now()}`;
  const metadata: ChatMetadata = {
    id: chatId,
    type,
    name,
    description,
    photo: '',
    category,
    isPublic,
    participants: [createdBy, ...participants.filter((p) => p.uid !== createdBy.uid)],
    participantIds: [createdBy.uid, ...participants.filter((p) => p.uid !== createdBy.uid).map((p) => p.uid)],
    createdBy: createdBy.uid,
    pinnedMessageId: null,
    lastMessage: '',
    lastMessageAt: Date.now(),
    createdAt: Date.now(),
  };
  await set(chatRef(chatId, 'metadata'), metadata);
  return chatId;
}

export interface SendMessageInput {
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  text?: string;
  imageUrl?: string;
  codeSnippet?: string;
  codeLanguage?: string;
  linkUrl?: string;
  linkTitle?: string;
  linkImage?: string;
  replyTo?: { id: string; text: string; sender: string } | null;
  participantIds: string[];
}

export async function sendMessage(input: SendMessageInput): Promise<string> {
  const msgRef = push(chatRef(input.chatId, 'messages'));
  const messageId = msgRef.key || `m_${Date.now()}`;
  const message: ChatMessage = {
    ...EMPTY_MESSAGE,
    id: messageId,
    senderId: input.senderId,
    senderName: input.senderName,
    senderAvatar: input.senderAvatar,
    text: input.text || '',
    imageUrl: input.imageUrl || '',
    codeSnippet: input.codeSnippet || '',
    codeLanguage: input.codeLanguage || '',
    linkUrl: input.linkUrl || '',
    linkTitle: input.linkTitle || '',
    linkImage: input.linkImage || '',
    replyToId: input.replyTo?.id || null,
    replyToText: input.replyTo?.text || '',
    replyToSender: input.replyTo?.sender || '',
    readBy: { [input.senderId]: Date.now() },
    createdAt: Date.now(),
  };
  const preview =
    message.text ||
    (message.imageUrl ? 'Photo' : '') ||
    (message.codeSnippet ? 'Code snippet' : 'Message');
  await Promise.all([
    set(msgRef, message),
    update(chatRef(input.chatId, 'metadata'), { lastMessage: preview.slice(0, 80), lastMessageAt: Date.now() }),
    ...input.participantIds.map((uid) =>
      update(userChatEntryRef(uid, input.chatId), {
        chatId: input.chatId,
        lastMessage: preview.slice(0, 80),
        lastMessageAt: Date.now(),
        lastSender: input.senderName,
      }),
    ),
  ]);
  return messageId;
}

export async function markChatRead(chatId: string, uid: string, lastMessageAt: number): Promise<void> {
  await update(userChatEntryRef(uid, chatId), { unreadCount: 0, lastMessageAt });
}

export async function deleteMessage(chatId: string, messageId: string, forEveryone: boolean, uid: string): Promise<void> {
  const msgRef = chatRef(chatId, 'messages', messageId);
  if (forEveryone) {
    await update(msgRef, { deleted: true, text: '', imageUrl: '' });
  } else {
    const snap = await get(msgRef);
    const existing = Array.isArray((snap.val() as ChatMessage | null)?.deletedFor) ? (snap.val() as ChatMessage).deletedFor : [];
    await update(msgRef, { deletedFor: [...existing, uid] });
  }
}

export async function editMessage(chatId: string, messageId: string, text: string): Promise<void> {
  await update(chatRef(chatId, 'messages', messageId), { text, edited: true });
}

export async function reactToMessage(chatId: string, messageId: string, uid: string, reaction: string): Promise<void> {
  const msgRef = chatRef(chatId, 'messages', messageId, 'reactions', uid);
  const snap = await get(msgRef);
  if (snap.exists() && snap.val() === reaction) {
    await remove(msgRef);
  } else {
    await set(msgRef, reaction);
  }
}

export function onMessages(chatId: string, cb: (messages: ChatMessage[]) => void, onError?: (e: Error) => void): () => void {
  const messagesRef = chatRef(chatId, 'messages');
  return onValue(
    messagesRef,
    (snap) => {
      const val = (snap.val() as Record<string, Record<string, unknown>> | null) || {};
      const messages = Object.entries(val)
        .map(([id, raw]) => normalizeChatMessage(raw, id))
        .sort((a, b) => a.createdAt - b.createdAt);
      cb(messages);
    },
    (e) => onError?.(e as Error),
  );
}

export function onChatList(uid: string, cb: (chats: UserChatEntry[]) => void): () => void {
  const listRef = ref(rtdb(), `userChats/${uid}`);
  return onValue(listRef, (snap) => {
    const val = (snap.val() as Record<string, Omit<UserChatEntry, 'chatId'>> | null) || {};
    const chats = Object.entries(val)
      .map(([chatId, entry]) => ({ chatId, ...entry }))
      .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
    cb(chats);
  });
}

export function onChatMetadata(chatId: string, cb: (meta: ChatMetadata | null) => void): () => void {
  const metaRef = chatRef(chatId, 'metadata');
  return onValue(metaRef, (snap) => {
    cb(snap.exists() ? normalizeChatMetadata(snap.val() as Record<string, unknown>, chatId) : null);
  });
}

export async function getChatMetadata(chatId: string): Promise<ChatMetadata | null> {
  const snap = await get(chatRef(chatId, 'metadata'));
  return snap.exists() ? normalizeChatMetadata(snap.val() as Record<string, unknown>, chatId) : null;
}

export async function pinMessage(chatId: string, messageId: string | null): Promise<void> {
  await update(chatRef(chatId, 'metadata'), { pinnedMessageId: messageId });
}

export async function toggleChatPin(uid: string, chatId: string, pinned: boolean): Promise<void> {
  await update(userChatEntryRef(uid, chatId), { pinned });
}

export async function toggleChatMute(uid: string, chatId: string, muted: boolean): Promise<void> {
  await update(userChatEntryRef(uid, chatId), { muted });
}

export async function addChatParticipant(chatId: string, participant: ChatParticipant): Promise<void> {
  const metaRef = chatRef(chatId, 'metadata');
  const snap = await get(metaRef);
  const meta = normalizeChatMetadata((snap.val() as Record<string, unknown>) || {}, chatId);
  if (meta.participantIds.includes(participant.uid)) return;
  await update(metaRef, {
    participants: [...meta.participants, participant],
    participantIds: [...meta.participantIds, participant.uid],
  });
  await update(userChatEntryRef(participant.uid, chatId), {
    chatId,
    type: meta.type,
    name: meta.name,
    photo: meta.photo,
    participantIds: [...meta.participantIds, participant.uid],
    lastMessage: meta.lastMessage,
    lastMessageAt: meta.lastMessageAt,
    lastSender: '',
    unreadCount: 0,
    pinned: false,
    muted: false,
  });
}

export async function removeChatParticipant(chatId: string, uid: string): Promise<void> {
  const metaRef = chatRef(chatId, 'metadata');
  const snap = await get(metaRef);
  const meta = normalizeChatMetadata((snap.val() as Record<string, unknown>) || {}, chatId);
  await update(metaRef, {
    participants: meta.participants.filter((p) => p.uid !== uid),
    participantIds: meta.participantIds.filter((id) => id !== uid),
  });
  await remove(userChatEntryRef(uid, chatId));
}

/* -------------------------------------------------------------- typing */

export async function setTyping(chatId: string, uid: string, displayName: string, isTyping: boolean): Promise<void> {
  const typingRef = ref(rtdb(), `typing/${chatId}/${uid}`);
  if (isTyping) {
    await set(typingRef, { isTyping, displayName, updatedAt: Date.now() } satisfies TypingInfo);
  } else {
    await remove(typingRef);
  }
}

export function onTyping(chatId: string, myUid: string, cb: (typing: TypingInfo[]) => void): () => void {
  const typingRef = ref(rtdb(), `typing/${chatId}`);
  return onValue(typingRef, (snap) => {
    const val = (snap.val() as Record<string, TypingInfo> | null) || {};
    cb(Object.entries(val).filter(([uid]) => uid !== myUid).map(([, info]) => info));
  });
}

/* ------------------------------------------------------------ presence */

export function initPresence(uid: string): () => void {
  const presenceRef = ref(rtdb(), `presence/${uid}`);
  const connRef = ref(rtdb(), '.info/connected');
  return onValue(connRef, (snap) => {
    if (snap.val() === true) {
      onDisconnect(presenceRef)
        .set({ online: false, lastSeen: Date.now() } satisfies PresenceInfo)
        .then(() => set(presenceRef, { online: true, lastSeen: Date.now() } satisfies PresenceInfo))
        .catch(() => undefined);
    }
  });
}

export function onPresence(uid: string, cb: (info: PresenceInfo) => void): () => void {
  const presenceRef = ref(rtdb(), `presence/${uid}`);
  return onValue(presenceRef, (snap) => {
    const val = (snap.val() as Partial<PresenceInfo> | null) || {};
    cb({ online: Boolean(val.online), lastSeen: val.lastSeen || 0 });
  });
}

export function onManyPresence(uids: string[], cb: (map: Record<string, PresenceInfo>) => void): () => void {
  const presenceRoot = ref(rtdb(), 'presence');
  return onValue(presenceRoot, (snap) => {
    const val = (snap.val() as Record<string, Partial<PresenceInfo>> | null) || {};
    const map: Record<string, PresenceInfo> = {};
    for (const uid of uids) {
      const info = val[uid];
      if (info) map[uid] = { online: Boolean(info.online), lastSeen: info.lastSeen || 0 };
    }
    cb(map);
  });
}

export { ref };
