import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ConversationMember,
  ConversationSummary,
  Message,
  MessageGroup,
} from '@/lib/messaging/message-types';
import { activeTypers, groupMessages } from '@/lib/messaging/message-types';
import { useAuthStore } from '@/store/auth-store';

// Both modules reach the Supabase SDK or the Firebase SDK, so they are only
// ever loaded on demand — the app bar's unread badge must stay cheap.
const repository = () => import('@/lib/messaging/message-repository');
const typingModule = () => import('@/lib/messaging/typing');

const INBOX_POLL_MS = 20_000;
const THREAD_POLL_MS = 7_000;
const TYPING_THROTTLE_MS = 3_000;

export interface InboxResult {
  conversations: ConversationSummary[];
  isLoading: boolean;
  isError: boolean;
  refresh: () => void;
}

export function useInbox(): InboxResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['inbox', uid],
    queryFn: async () => (await repository()).fetchInbox(),
    enabled: uid !== null,
    refetchInterval: INBOX_POLL_MS,
    staleTime: INBOX_POLL_MS,
  });

  return {
    conversations: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: ['inbox', uid] });
    },
  };
}

export function useUnreadMessageCount(): number {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const { data = 0 } = useQuery({
    queryKey: ['messages-unread', uid],
    queryFn: async () => (await repository()).fetchUnreadMessageCount(),
    enabled: uid !== null,
    refetchInterval: INBOX_POLL_MS,
    staleTime: INBOX_POLL_MS,
  });
  return data;
}

export interface ConversationResult {
  messages: Message[];
  groups: MessageGroup[];
  members: ConversationMember[];
  typingUids: string[];
  isLoading: boolean;
  isError: boolean;
  isSending: boolean;
  send: (body: string) => Promise<void>;
  edit: (messageId: string, body: string) => Promise<void>;
  remove: (messageId: string) => Promise<void>;
  loadOlder: () => void;
  hasOlder: boolean;
  signalTyping: () => void;
}

/**
 * One conversation: messages from Postgres, typing from Realtime Database,
 * read markers written whenever the thread is on screen.
 */
export function useConversation(conversationId: string): ConversationResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const [before, setBefore] = useState<string | null>(null);
  const [older, setOlder] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(true);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const lastTypingAt = useRef(0);
  const stopTyping = useRef<(() => void) | null>(null);

  const messagesKey = ['messages', conversationId];

  const query = useQuery({
    queryKey: messagesKey,
    queryFn: async () => (await repository()).fetchMessages(conversationId, null),
    enabled: conversationId.length > 0,
    refetchInterval: THREAD_POLL_MS,
    staleTime: THREAD_POLL_MS,
  });

  const membersQuery = useQuery({
    queryKey: ['conversation-members', conversationId],
    queryFn: async () => (await repository()).fetchMembers(conversationId),
    enabled: conversationId.length > 0,
    staleTime: 60_000,
  });

  const recent = useMemo(() => query.data ?? [], [query.data]);
  const messages = useMemo(() => {
    const seen = new Set<string>();
    return [...older, ...recent].filter((message) =>
      seen.has(message.id) ? false : (seen.add(message.id), true),
    );
  }, [older, recent]);

  const groups = useMemo(() => groupMessages(messages), [messages]);

  // Reading the thread marks it read, which is what clears the badge.
  useEffect(() => {
    if (conversationId.length === 0 || uid === null || recent.length === 0) return;
    void repository()
      .then(async (module) => module.markConversationRead(conversationId))
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['inbox', uid] });
        void queryClient.invalidateQueries({ queryKey: ['messages-unread', uid] });
      })
      .catch(() => undefined);
  }, [conversationId, uid, recent.length, queryClient]);

  // Typing signals in and out.
  useEffect(() => {
    if (conversationId.length === 0) return;
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    void typingModule().then((module) => {
      if (cancelled) return;
      unsubscribe = module.subscribeTyping(conversationId, setTyping);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      stopTyping.current?.();
      stopTyping.current = null;
    };
  }, [conversationId]);

  const signalTyping = useCallback(() => {
    if (uid === null) return;
    const now = Date.now();
    if (now - lastTypingAt.current < TYPING_THROTTLE_MS) return;
    lastTypingAt.current = now;
    void typingModule().then((module) => {
      stopTyping.current = module.publishTyping(conversationId, uid);
    });
  }, [conversationId, uid]);

  const sendMutation = useMutation({
    mutationFn: async (body: string) => (await repository()).sendMessage({ conversationId, body }),
    onSuccess: () => {
      if (uid !== null) {
        void typingModule().then((module) => {
          module.clearTyping(conversationId, uid);
        });
      }
      void queryClient.invalidateQueries({ queryKey: messagesKey });
      void queryClient.invalidateQueries({ queryKey: ['inbox', uid] });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ messageId, body }: { messageId: string; body: string }) =>
      (await repository()).editMessage(messageId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: messagesKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (messageId: string) => (await repository()).deleteMessage(messageId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: messagesKey });
    },
  });

  const loadOlder = useCallback(() => {
    const oldest = messages[0]?.createdAt ?? before;
    if (oldest === null || oldest === undefined || !hasOlder) return;
    void repository()
      .then(async (module) => module.fetchMessages(conversationId, oldest))
      .then((page) => {
        if (page.length === 0) {
          setHasOlder(false);
          return;
        }
        setBefore(page[0]?.createdAt ?? null);
        setOlder((current) => [...page, ...current]);
      })
      .catch(() => undefined);
  }, [conversationId, messages, before, hasOlder]);

  return {
    messages,
    groups,
    members: membersQuery.data ?? [],
    typingUids: activeTypers(typing, uid ?? '', Date.now()),
    isLoading: query.isLoading,
    isError: query.isError,
    isSending: sendMutation.isPending,
    send: async (body) => {
      await sendMutation.mutateAsync(body);
    },
    edit: async (messageId, body) => {
      await editMutation.mutateAsync({ messageId, body });
    },
    remove: async (messageId) => {
      await deleteMutation.mutateAsync(messageId);
    },
    loadOlder,
    hasOlder,
    signalTyping,
  };
}
