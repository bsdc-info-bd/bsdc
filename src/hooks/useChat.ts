/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createGroupChat,
  deleteMessage,
  editMessage,
  ensureDirectChat,
  markChatRead,
  onChatList,
  onChatMetadata,
  onMessages,
  onTyping,
  reactToMessage,
  sendMessage,
  setTyping,
  toggleChatMute,
  toggleChatPin,
  addChatParticipant,
  removeChatParticipant,
  pinMessage,
  getChatMetadata,
} from '@/lib/realtime';
import type { ChatMessage, ChatMetadata, ChatParticipant, UserChatEntry } from '@/types/chat';
import { useAuthStore } from '@/stores/authStore';

export function useChatList(): { chats: UserChatEntry[]; loading: boolean } {
  const profile = useAuthStore((s) => s.profile);
  const [chats, setChats] = useState<UserChatEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!profile?.uid) {
      setChats([]);
      setLoading(false);
      return;
    }
    const unsub = onChatList(profile.uid, (list) => {
      setChats(list);
      setLoading(false);
    });
    return unsub;
  }, [profile?.uid]);
  return { chats, loading };
}

export function useChat(chatId: string | null) {
  const profile = useAuthStore((s) => s.profile);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [metadata, setMetadata] = useState<ChatMetadata | null>(null);
  const [typing, setTypingUsers] = useState<{ isTyping: boolean; displayName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const typingTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      setMetadata(null);
      setLoading(false);
      return;
    }
    const unsubMsgs = onMessages(
      chatId,
      (msgs) => {
        setMessages(msgs);
        setLoading(false);
        if (profile?.uid) {
          const last = msgs[msgs.length - 1];
          void markChatRead(chatId, profile.uid, last?.createdAt || Date.now());
        }
      },
      () => setLoading(false),
    );
    const unsubMeta = onChatMetadata(chatId, setMetadata);
    const unsubTyping = profile?.uid ? onTyping(chatId, profile.uid, setTypingUsers) : () => undefined;
    return () => {
      unsubMsgs();
      unsubMeta();
      unsubTyping();
    };
  }, [chatId, profile?.uid]);

  const meParticipant = useMemo<ChatParticipant | null>(() => {
    if (!profile) return null;
    return {
      uid: profile.uid,
      displayName: profile.displayName,
      username: profile.username,
      avatar: profile.avatar,
      role: 'member',
      joinedAt: Date.now(),
    };
  }, [profile]);

  const send = useCallback(
    async (payload: Partial<Pick<ChatMessage, 'text' | 'imageUrl' | 'codeSnippet' | 'codeLanguage' | 'linkUrl' | 'linkTitle' | 'linkImage' | 'audioUrl' | 'audioDuration' | 'audioMime' | 'fileUrl' | 'fileName' | 'fileSize' | 'fileType'>> & { replyTo?: { id: string; text: string; sender: string } | null }) => {
      if (!meParticipant || !chatId || !metadata) return;
      await sendMessage({
        chatId,
        senderId: meParticipant.uid,
        senderName: meParticipant.displayName,
        senderAvatar: meParticipant.avatar,
        participantIds: metadata.participantIds,
        replyTo: payload.replyTo || null,
        ...payload,
      });
    },
    [meParticipant, chatId, metadata],
  );

  const notifyTyping = useCallback(
    (isTyping: boolean) => {
      if (!meParticipant || !chatId) return;
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      void setTyping(chatId, meParticipant.uid, meParticipant.displayName, isTyping);
      if (isTyping) {
        typingTimer.current = window.setTimeout(() => {
          void setTyping(chatId, meParticipant.uid, meParticipant.displayName, false);
        }, 4000);
      }
    },
    [meParticipant, chatId],
  );

  const openDirectChat = useCallback(
    async (other: { uid: string; displayName: string; username: string; avatar: string }): Promise<string | null> => {
      if (!meParticipant) return null;
      return ensureDirectChat(meParticipant, { ...other, role: 'member', joinedAt: Date.now() });
    },
    [meParticipant],
  );

  const createChat = useCallback(
    async (name: string, description: string, participants: { uid: string; displayName: string; username: string; avatar: string }[], type: 'group' | 'channel' = 'group', isPublic = false) => {
      if (!meParticipant) return null;
      const chatId = await createGroupChat(
        meParticipant,
        name,
        description,
        participants.map((p) => ({ ...p, role: 'member' as const, joinedAt: Date.now() })),
        type,
        isPublic,
      );
      return chatId;
    },
    [meParticipant],
  );

  const canPost = useMemo(() => {
    if (!metadata || !profile) return false;
    if (metadata.type !== 'channel') return true;
    const me = metadata.participants.find((p) => p.uid === profile.uid);
    return me?.role === 'owner' || me?.role === 'admin' || metadata.createdBy === profile.uid;
  }, [metadata, profile]);

  return {
    messages,
    metadata,
    typing,
    loading,
    send,
    notifyTyping,
    openDirectChat,
    createChat,
    canPost,
    react: (messageId: string, reaction: string) => chatId && reactToMessage(chatId, messageId, profile?.uid || '', reaction),
    edit: (messageId: string, text: string) => chatId && editMessage(chatId, messageId, text),
    remove: (messageId: string, forEveryone: boolean) =>
      chatId && profile && deleteMessage(chatId, messageId, forEveryone, profile.uid),
    pin: (messageId: string | null) => chatId && pinMessage(chatId, messageId),
    togglePin: (pinned: boolean) => chatId && profile && toggleChatPin(profile.uid, chatId, pinned),
    toggleMute: (muted: boolean) => chatId && profile && toggleChatMute(profile.uid, chatId, muted),
    addMember: (p: ChatParticipant) => chatId && addChatParticipant(chatId, p),
    removeMember: (uid: string) => chatId && removeChatParticipant(chatId, uid),
    fetchMeta: () => (chatId ? getChatMetadata(chatId) : null),
  };
}
