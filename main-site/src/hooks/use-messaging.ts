import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConversationChannel, LiveStatus } from '@/lib/messaging/messenger-channel';
import type {
  ConversationMember,
  ConversationPin,
  ConversationState,
  ConversationSummary,
  InboxFilter,
  Message,
  MessageGroup,
  MessageSearchHit,
  SavedMessage,
} from '@/lib/messaging/message-types';
import {
  groupMessages,
  matchesFilter,
  sortConversations,
  upsertMessage,
} from '@/lib/messaging/message-types';
import { dataErrorKey } from '@/lib/supabase/errors';
import { useAuthStore } from '@/store/auth-store';

// Both modules reach a network SDK, so they are only ever loaded on demand —
// the app bar's unread badge must stay cheap.
const repository = () => import('@/lib/messaging/message-repository');
const channelModule = () => import('@/lib/messaging/messenger-channel');

/**
 * A poll is a last resort, not the transport: it runs only while the realtime
 * socket is not joined, and stops the moment the socket reports live.
 */
const FALLBACK_THREAD_MS = 12_000;
const FALLBACK_INBOX_MS = 30_000;
const META_DEBOUNCE_MS = 250;
const DRAFT_DEBOUNCE_MS = 900;
const READ_DEBOUNCE_MS = 400;

interface MemberSettings {
  pinned: boolean;
  archived: boolean;
  muted: boolean;
}

export interface InboxResult {
  conversations: ConversationSummary[];
  filter: InboxFilter;
  setFilter: (filter: InboxFilter) => void;
  query: string;
  setQuery: (query: string) => void;
  status: LiveStatus;
  isLoading: boolean;
  isError: boolean;
  unreadTotal: number;
  settingsOf: (conversationId: string) => MemberSettings;
  markRead: (conversationId: string) => void;
  refresh: () => void;
}

/** The inbox, driven by the change feed rather than by a timer. */
export function useInbox(): InboxResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [query, setQuery] = useState('');
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inboxQuery = useQuery({
    queryKey: ['inbox', uid],
    queryFn: async () => (await repository()).fetchInbox(),
    enabled: uid !== null,
    staleTime: 10_000,
    refetchInterval: status === 'live' ? false : FALLBACK_INBOX_MS,
  });

  const settingsQuery = useQuery({
    queryKey: ['inbox-settings', uid],
    queryFn: async () => (await repository()).fetchMyConversationSettings(),
    enabled: uid !== null,
    staleTime: 30_000,
  });

  // One channel for the session: a message anywhere refreshes the list, and
  // the refresh is coalesced so a burst of messages costs one read.
  useEffect(() => {
    if (uid === null) return;
    let stop: (() => void) | null = null;
    let cancelled = false;

    const touch = () => {
      if (pending.current !== null) clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        pending.current = null;
        void queryClient.invalidateQueries({ queryKey: ['inbox', uid] });
        void queryClient.invalidateQueries({ queryKey: ['inbox-settings', uid] });
        void queryClient.invalidateQueries({ queryKey: ['messages-unread', uid] });
      }, 400);
    };

    void channelModule().then((module) => {
      if (cancelled) return;
      stop = module.joinInbox(uid, { onActivity: touch, onStatus: setStatus });
    });

    return () => {
      cancelled = true;
      if (pending.current !== null) clearTimeout(pending.current);
      pending.current = null;
      stop?.();
    };
  }, [uid, queryClient]);

  const settings = useMemo(() => {
    const map = new Map<string, MemberSettings>();
    for (const [id, value] of settingsQuery.data ?? []) map.set(id, value);
    return map;
  }, [settingsQuery.data]);

  const settingsOf = useCallback(
    (conversationId: string): MemberSettings =>
      settings.get(conversationId) ?? { pinned: false, archived: false, muted: false },
    [settings],
  );

  const conversations = useMemo(() => {
    const all = inboxQuery.data ?? [];
    const listed = all.filter((summary) => {
      const state = settings.get(summary.id);
      const archived = state?.archived ?? false;
      if (filter === 'archived' && !archived) return false;
      if (filter !== 'archived' && archived) return false;
      if (filter === 'pinned' && !(state?.pinned ?? false)) return false;
      return matchesFilter(summary, filter === 'pinned' ? 'all' : filter, query);
    });
    const pinnedIds = new Set(
      [...settings.entries()].filter(([, value]) => value.pinned).map(([id]) => id),
    );
    return sortConversations(listed, pinnedIds);
  }, [inboxQuery.data, settings, filter, query]);

  const unreadTotal = useMemo(
    () =>
      (inboxQuery.data ?? []).reduce(
        (total, summary) => total + (settings.get(summary.id)?.muted === true ? 0 : summary.unread),
        0,
      ),
    [inboxQuery.data, settings],
  );

  const markRead = useCallback(
    (conversationId: string) => {
      void repository()
        .then(async (module) => module.markConversationRead(conversationId))
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ['inbox', uid] });
          void queryClient.invalidateQueries({ queryKey: ['messages-unread', uid] });
        })
        .catch(() => undefined);
    },
    [queryClient, uid],
  );

  return {
    conversations,
    filter,
    setFilter,
    query,
    setQuery,
    status,
    isLoading: inboxQuery.isLoading,
    isError: inboxQuery.isError,
    unreadTotal,
    settingsOf,
    markRead,
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: ['inbox', uid] });
      void queryClient.invalidateQueries({ queryKey: ['inbox-settings', uid] });
    },
  };
}

export function useUnreadMessageCount(): number {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const { data = 0 } = useQuery({
    queryKey: ['messages-unread', uid],
    queryFn: async () => (await repository()).fetchUnreadMessageCount(),
    enabled: uid !== null,
    staleTime: 10_000,
    refetchInterval: status === 'live' ? false : FALLBACK_INBOX_MS,
  });

  useEffect(() => {
    if (uid === null) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    void channelModule().then((module) => {
      if (cancelled) return;
      stop = module.joinInbox(uid, { onStatus: setStatus });
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [uid]);

  return data;
}

export interface SendOptions {
  replyTo?: string | null;
  kind?: Message['kind'];
}

export interface ConversationResult {
  messages: Message[];
  groups: MessageGroup[];
  members: ConversationMember[];
  pins: ConversationPin[];
  state: ConversationState | null;
  typingUids: string[];
  presentUids: string[];
  status: LiveStatus;
  latencyMs: number | null;
  isLoading: boolean;
  isError: boolean;
  isSending: boolean;
  hasOlder: boolean;
  send: (body: string, options?: SendOptions) => Promise<void>;
  retry: (message: Message) => Promise<void>;
  edit: (messageId: string, body: string) => Promise<void>;
  remove: (messageId: string) => Promise<void>;
  react: (messageId: string, reaction: string) => Promise<void>;
  star: (messageId: string) => Promise<void>;
  pin: (messageId: string) => Promise<void>;
  loadOlder: () => void;
  signalTyping: () => void;
  saveDraft: (body: string) => void;
  markRead: (messageId: string) => void;
}

/**
 * One conversation: lines from Postgres delivered by the Realtime change feed,
 * typing and presence over the same socket, read markers written when the
 * thread is on screen.
 */
export function useConversation(conversationId: string): ConversationResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const [older, setOlder] = useState<Message[]>([]);
  const [live, setLive] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(true);
  const [typingUids, setTypingUids] = useState<string[]>([]);
  const [presentUids, setPresentUids] = useState<string[]>([]);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const channel = useRef<ConversationChannel | null>(null);
  const lastTypingAt = useRef(0);
  const metaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readUpTo = useRef<string | null>(null);

  const keys = useMemo(
    () => ({
      messages: ['messages', conversationId],
      members: ['conversation-members', conversationId],
      state: ['conversation-state', conversationId],
      pins: ['conversation-pins', conversationId],
    }),
    [conversationId],
  );

  const enabled = conversationId.length > 0;

  const query = useQuery({
    queryKey: keys.messages,
    queryFn: async () => (await repository()).fetchConversationMessages(conversationId, null, 60),
    enabled,
    staleTime: 10_000,
    refetchInterval: status === 'live' ? false : FALLBACK_THREAD_MS,
  });

  const membersQuery = useQuery({
    queryKey: keys.members,
    queryFn: async () => (await repository()).fetchMembers(conversationId),
    enabled,
    staleTime: 30_000,
  });

  const stateQuery = useQuery({
    queryKey: keys.state,
    queryFn: async () => (await repository()).fetchConversationState(conversationId),
    enabled,
    staleTime: 60_000,
  });

  const pinsQuery = useQuery({
    queryKey: keys.pins,
    queryFn: async () => (await repository()).fetchPinnedMessages(conversationId),
    enabled,
    staleTime: 30_000,
  });

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);

  const authorOf = useCallback(
    (senderUid: string | null) =>
      senderUid === null
        ? null
        : (members.find((entry) => entry.uid === senderUid)?.profile ?? null),
    [members],
  );

  // Handlers live in refs so a re-render never has to rejoin the socket.
  const authorRef = useRef(authorOf);
  authorRef.current = authorOf;

  /** Re-reads the visible window; used when a reaction or receipt moves. */
  const refreshWindow = useCallback(
    (delay = META_DEBOUNCE_MS) => {
      if (metaTimer.current !== null) return;
      metaTimer.current = setTimeout(() => {
        metaTimer.current = null;
        void repository()
          .then(async (module) => module.fetchConversationMessages(conversationId, null, 60))
          .then((page) => {
            queryClient.setQueryData<Message[]>(keys.messages, (current) => {
              const known = new Set((current ?? []).map((message) => message.id));
              const fresh = page.map((message) => {
                const pending = (current ?? []).find((entry) => entry.id === message.id);
                return pending?.clientState === undefined
                  ? message
                  : { ...message, clientState: pending.clientState };
              });
              const keptLive = (current ?? []).filter((message) => !known.has(message.id));
              let merged: Message[] = [];
              for (const message of [...fresh, ...keptLive])
                merged = upsertMessage(merged, message);
              return merged;
            });
            void queryClient.invalidateQueries({ queryKey: keys.pins });
          })
          .catch(() => undefined);
      }, delay);
    },
    [conversationId, keys, queryClient],
  );

  const refreshRef = useRef(refreshWindow);
  refreshRef.current = refreshWindow;

  // The live socket for this thread.
  useEffect(() => {
    if (!enabled || uid === null) return;
    let stop: (() => void) | null = null;
    let cancelled = false;

    void channelModule().then((module) => {
      if (cancelled) return;
      const joined = module.joinConversation(conversationId, uid, {
        onStatus: setStatus,
        onTyping: setTypingUids,
        onPresence: setPresentUids,
        onLatency: setLatencyMs,
        onMessage: (row, event) => {
          if (event === 'DELETE') {
            refreshRef.current(0);
            return;
          }
          queryClient.setQueryData<Message[]>(keys.messages, (current) => {
            if (event === 'UPDATE') {
              const existing = (current ?? []).find((message) => message.id === row.id);
              if (existing !== undefined) {
                const { clientState: _settled, ...rest } = existing;
                void _settled;
                return upsertMessage(current ?? [], {
                  ...rest,
                  body: row.body,
                  editedAt: row.edited_at,
                  deletedAt: row.deleted_at,
                });
              }
            }
            const author = authorRef.current(row.sender_uid);
            if (author === null && row.sender_uid !== uid) refreshRef.current();
            return upsertMessage(current ?? [], {
              id: row.id,
              conversationId: row.conversation_id,
              senderUid: row.sender_uid,
              kind: row.kind,
              body: row.body,
              mediaUrl: row.media_url,
              mediaName: row.media_name,
              codeLanguage: row.code_language,
              replyTo: row.reply_to,
              replyBody: null,
              replySender: null,
              editedAt: row.edited_at,
              deletedAt: row.deleted_at,
              createdAt: row.created_at,
              author,
              reactions: {},
              myReactions: [],
              readBy: [],
              starred: false,
              pinned: false,
            });
          });
          void queryClient.invalidateQueries({ queryKey: ['inbox', uid] });
        },
        onMessageMeta: () => refreshRef.current(),
        onMembers: () => {
          void queryClient.invalidateQueries({ queryKey: keys.members });
        },
      });
      channel.current = joined;
      stop = joined.stop;
    });

    return () => {
      cancelled = true;
      stop?.();
      channel.current = null;
      setTypingUids([]);
      setPresentUids([]);
    };
  }, [enabled, conversationId, uid, queryClient, keys]);

  const recent = useMemo(() => query.data ?? [], [query.data]);
  const messages = useMemo(() => {
    let list: Message[] = [];
    for (const message of [...older, ...recent, ...live]) list = upsertMessage(list, message);
    return list;
  }, [older, recent, live]);

  const groups = useMemo(() => groupMessages(messages), [messages]);

  // Reading the thread marks it read, which clears the badge; the per-line
  // receipt is what turns one tick into two.
  const lastIncoming = useMemo(
    () => [...messages].reverse().find((message) => message.senderUid !== uid) ?? null,
    [messages, uid],
  );

  useEffect(() => {
    if (!enabled || uid === null || lastIncoming === null) return;
    if (readUpTo.current === lastIncoming.id) return;
    readUpTo.current = lastIncoming.id;
    if (readTimer.current !== null) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      readTimer.current = null;
      void repository()
        .then(async (module) => {
          await module.markConversationRead(conversationId);
          await module.markMessageRead(lastIncoming.id);
        })
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ['inbox', uid] });
          void queryClient.invalidateQueries({ queryKey: ['messages-unread', uid] });
        })
        .catch(() => undefined);
    }, READ_DEBOUNCE_MS);
  }, [enabled, conversationId, uid, lastIncoming, queryClient]);

  const sendMutation = useMutation({
    mutationFn: async (input: { body: string; replyTo: string | null; kind: Message['kind'] }) =>
      (await repository()).sendMessage({
        conversationId,
        body: input.body,
        replyTo: input.replyTo,
        kind: input.kind,
      }),
    onMutate: (input) => {
      const optimistic: Message = {
        id: `pending:${crypto.randomUUID()}`,
        conversationId,
        senderUid: uid,
        kind: input.kind,
        body: input.body,
        mediaUrl: '',
        mediaName: '',
        codeLanguage: '',
        replyTo: input.replyTo,
        replyBody: null,
        replySender: null,
        editedAt: null,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        author: authorRef.current(uid),
        reactions: {},
        myReactions: [],
        readBy: [],
        starred: false,
        pinned: false,
        clientState: 'pending',
      };
      setLive((current) => upsertMessage(current, optimistic));
      return { optimisticId: optimistic.id };
    },
    onSuccess: (row, _input, context) => {
      const confirmed: Message = {
        id: row.id,
        conversationId: row.conversationId,
        senderUid: row.senderUid,
        kind: row.kind,
        body: row.body,
        mediaUrl: row.mediaUrl,
        mediaName: row.mediaName,
        codeLanguage: row.codeLanguage,
        replyTo: row.replyTo,
        replyBody: null,
        replySender: null,
        editedAt: row.editedAt,
        deletedAt: row.deletedAt,
        createdAt: row.createdAt,
        author: authorRef.current(row.senderUid),
        reactions: {},
        myReactions: [],
        readBy: [],
        starred: false,
        pinned: false,
      };
      setLive((current) => {
        const withoutPending = current.filter((message) => message.id !== context?.optimisticId);
        return upsertMessage(withoutPending, confirmed);
      });
      if (uid !== null) void queryClient.invalidateQueries({ queryKey: ['inbox', uid] });
    },
    onError: (_error, _input, context) => {
      setLive((current) =>
        current.map((message) =>
          message.id === context?.optimisticId ? { ...message, clientState: 'failed' } : message,
        ),
      );
    },
  });

  const retry = useCallback(
    async (message: Message) => {
      setLive((current) => current.filter((entry) => entry.id !== message.id));
      await sendMutation.mutateAsync({
        body: message.body,
        replyTo: message.replyTo,
        kind: message.kind,
      });
    },
    [sendMutation],
  );

  const editMutation = useMutation({
    mutationFn: async ({ messageId, body }: { messageId: string; body: string }) =>
      (await repository()).editMessage(messageId, body),
    onSuccess: () => refreshRef.current(0),
  });

  const deleteMutation = useMutation({
    mutationFn: async (messageId: string) => (await repository()).deleteMessage(messageId),
    onSuccess: () => refreshRef.current(0),
  });

  const reactionMutation = useMutation({
    mutationFn: async ({ messageId, reaction }: { messageId: string; reaction: string }) =>
      (await repository()).toggleMessageReaction(messageId, reaction),
    onMutate: ({ messageId, reaction }) => {
      const apply = (message: Message): Message => {
        if (message.id !== messageId) return message;
        const mine = message.myReactions.includes(reaction);
        const count = Math.max(0, (message.reactions[reaction] ?? 0) + (mine ? -1 : 1));
        const reactions = { ...message.reactions };
        if (count === 0) delete reactions[reaction];
        else reactions[reaction] = count;
        return {
          ...message,
          reactions,
          myReactions: mine
            ? message.myReactions.filter((value) => value !== reaction)
            : [...message.myReactions, reaction],
        };
      };
      queryClient.setQueryData<Message[]>(keys.messages, (current) => (current ?? []).map(apply));
      setLive((current) => current.map(apply));
    },
    onError: () => refreshRef.current(0),
  });

  const starMutation = useMutation({
    mutationFn: async (messageId: string) => (await repository()).toggleMessageStar(messageId),
    onMutate: (messageId) => {
      const apply = (message: Message): Message =>
        message.id === messageId ? { ...message, starred: !message.starred } : message;
      queryClient.setQueryData<Message[]>(keys.messages, (current) => (current ?? []).map(apply));
      setLive((current) => current.map(apply));
    },
    onError: () => refreshRef.current(0),
  });

  const pinMutation = useMutation({
    mutationFn: async (messageId: string) => (await repository()).toggleMessagePin(messageId),
    onMutate: (messageId) => {
      const apply = (message: Message): Message =>
        message.id === messageId ? { ...message, pinned: !message.pinned } : message;
      queryClient.setQueryData<Message[]>(keys.messages, (current) => (current ?? []).map(apply));
      setLive((current) => current.map(apply));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.pins });
    },
  });

  const loadOlder = useCallback(() => {
    const oldest = messages[0]?.createdAt;
    if (oldest === undefined || !hasOlder) return;
    void repository()
      .then(async (module) => module.fetchConversationMessages(conversationId, oldest, 60))
      .then((page) => {
        if (page.length === 0) {
          setHasOlder(false);
          return;
        }
        setOlder((current) => {
          let list = current;
          for (const message of page) list = upsertMessage(list, message);
          return list;
        });
      })
      .catch(() => undefined);
  }, [conversationId, messages, hasOlder]);

  const signalTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingAt.current < 2_500) return;
    lastTypingAt.current = now;
    channel.current?.signalTyping(true);
  }, []);

  const clearTyping = useCallback(() => {
    lastTypingAt.current = 0;
    channel.current?.signalTyping(false);
  }, []);

  const saveDraft = useCallback(
    (body: string) => {
      if (uid === null) return;
      if (draftTimer.current !== null) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        draftTimer.current = null;
        void repository()
          .then(async (module) =>
            module.updateConversationSettings(conversationId, uid, {
              draft_body: body.slice(0, 4_000),
            }),
          )
          .then(() => {
            queryClient.setQueryData<ConversationState | null>(keys.state, (current) =>
              current === null || current === undefined ? current : { ...current, draftBody: body },
            );
          })
          .catch(() => undefined);
      }, DRAFT_DEBOUNCE_MS);
    },
    [conversationId, keys, queryClient, uid],
  );

  const markRead = useCallback(
    (messageId: string) => {
      if (uid === null) return;
      readUpTo.current = messageId;
      void repository()
        .then(async (module) => {
          await module.markMessageRead(messageId);
          await module.markConversationRead(conversationId);
        })
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ['messages-unread', uid] });
        })
        .catch(() => undefined);
    },
    [conversationId, queryClient, uid],
  );

  return {
    messages,
    groups,
    members,
    pins: pinsQuery.data ?? [],
    state: stateQuery.data ?? null,
    typingUids,
    presentUids,
    status,
    latencyMs,
    isLoading: query.isLoading,
    isError: query.isError,
    isSending: sendMutation.isPending,
    hasOlder,
    send: async (body, options) => {
      const trimmed = body.trim();
      if (trimmed.length === 0) return;
      await sendMutation.mutateAsync({
        body: trimmed,
        replyTo: options?.replyTo ?? null,
        kind: options?.kind ?? 'text',
      });
      clearTyping();
    },
    retry,
    edit: async (messageId, body) => {
      await editMutation.mutateAsync({ messageId, body });
    },
    remove: async (messageId) => {
      await deleteMutation.mutateAsync(messageId);
    },
    react: async (messageId, reaction) => {
      await reactionMutation.mutateAsync({ messageId, reaction });
    },
    star: async (messageId) => {
      await starMutation.mutateAsync(messageId);
    },
    pin: async (messageId) => {
      await pinMutation.mutateAsync(messageId);
    },
    loadOlder,
    signalTyping,
    saveDraft,
    markRead,
  };
}

/** Search across every conversation the member can read, or inside one. */
export function useMessageSearch(
  query: string,
  conversationId: string | null,
  enabled = true,
): { hits: MessageSearchHit[]; isLoading: boolean } {
  const trimmed = query.trim();
  const result = useQuery({
    queryKey: ['message-search', conversationId, trimmed],
    queryFn: async () => (await repository()).searchMessages(trimmed, conversationId, 40),
    enabled: enabled && trimmed.length >= 2,
    staleTime: 5_000,
  });
  return { hits: result.data ?? [], isLoading: result.isLoading };
}

/** The settings a member has not told us about yet. */
const UNLOADED_STATE: ConversationState = {
  muted: false,
  isPinned: false,
  isArchived: false,
  draftBody: '',
  lastReadAt: '',
};

/**
 * One conversation's member settings, writable from the inbox or the thread.
 *
 * Pin, archive and mute all live on the member's own `conversation_members`
 * row, which is a write the caller cannot see the result of: nothing on screen
 * changes except what the client changes. Two things follow from that.
 *
 * The optimistic patch has to work before the settings query has resolved —
 * a member who opens a conversation and archives it immediately would
 * otherwise have the patch thrown away and the toggle snap back, which reads
 * as a button that does nothing.
 *
 * And a failure has to be reported. Archiving can be refused (a deployment
 * whose grant does not yet cover the column, a lost connection), and a refused
 * write that quietly reverts is indistinguishable from a broken one.
 */
export function useConversationSettings(conversationId: string): {
  state: ConversationState | null;
  /** An i18n key, when the last pin, archive or mute was refused. */
  errorKey: string | null;
  dismissError: () => void;
  setPinned: (pinned: boolean) => void;
  setArchived: (archived: boolean) => void;
  setMuted: (muted: boolean) => void;
} {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const key = useMemo(() => ['conversation-state', conversationId], [conversationId]);
  const query = useQuery({
    queryKey: key,
    queryFn: async () => (await repository()).fetchConversationState(conversationId),
    enabled: conversationId.length > 0,
    staleTime: 60_000,
  });

  const patch = useCallback(
    (next: Partial<ConversationState>) => {
      queryClient.setQueryData<ConversationState | null>(key, (current) => ({
        ...(current ?? UNLOADED_STATE),
        ...next,
      }));
      void queryClient.invalidateQueries({ queryKey: ['inbox', uid] });
      void queryClient.invalidateQueries({ queryKey: ['inbox-settings', uid] });
    },
    [key, queryClient, uid],
  );

  const failed = useCallback(
    (error: unknown) => {
      // Read the cache back from the database: the optimistic value is now a
      // claim the server refused, and leaving it up would be a lie.
      void queryClient.invalidateQueries({ queryKey: key });
      setErrorKey(dataErrorKey(error));
    },
    [key, queryClient],
  );

  const settle = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ['inbox-settings', uid] });
  }, [key, queryClient, uid]);

  const pinMutation = useMutation({
    mutationFn: async (pinned: boolean) => {
      if (uid === null) return;
      await (
        await repository()
      ).updateConversationSettings(conversationId, uid, { is_pinned: pinned });
    },
    onMutate: (pinned) => {
      setErrorKey(null);
      patch({ isPinned: pinned });
    },
    onError: failed,
    onSettled: settle,
  });

  const archiveMutation = useMutation({
    mutationFn: async (archived: boolean) => {
      if (uid === null) return;
      await (
        await repository()
      ).updateConversationSettings(conversationId, uid, { is_archived: archived });
    },
    onMutate: (archived) => {
      setErrorKey(null);
      patch({ isArchived: archived });
    },
    onError: failed,
    onSettled: settle,
  });

  const muteMutation = useMutation({
    mutationFn: async (muted: boolean) => {
      if (uid === null) return;
      await (await repository()).setConversationMuted(conversationId, uid, muted);
    },
    onMutate: (muted) => {
      setErrorKey(null);
      patch({ muted });
    },
    onError: failed,
    onSettled: settle,
  });

  return {
    state: query.data ?? null,
    errorKey,
    dismissError: () => setErrorKey(null),
    setPinned: (pinned) => pinMutation.mutate(pinned),
    setArchived: (archived) => archiveMutation.mutate(archived),
    setMuted: (muted) => muteMutation.mutate(muted),
  };
}

/** The viewer's saved lines, from every conversation. */
export function useSavedMessages(enabled = true): { saved: SavedMessage[]; isLoading: boolean } {
  const query = useQuery({
    queryKey: ['saved-messages'],
    queryFn: async () => (await repository()).fetchSavedMessages(),
    enabled,
    staleTime: 30_000,
  });
  return { saved: query.data ?? [], isLoading: query.isLoading };
}

/** Leaving a group, or a direct chat, from the inbox. */
export function useLeaveConversation(): (conversationId: string) => Promise<void> {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (conversationId: string) =>
      (await repository()).leaveConversation(conversationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inbox', uid] });
    },
  });
  return async (conversationId) => {
    await mutation.mutateAsync(conversationId);
  };
}

/** Starting a conversation: by uid, or a group with a title. */
export function useStartConversation(): {
  openDirect: (otherUid: string) => Promise<string>;
  openGroup: (title: string, members: string[]) => Promise<string>;
} {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();

  const direct = useMutation({
    mutationFn: async (handle: string) => {
      const module = await repository();
      const otherUid = await module.resolveMemberUid(handle);
      return module.openDirectConversation(otherUid);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inbox', uid] });
    },
  });

  const group = useMutation({
    mutationFn: async (input: { title: string; members: string[] }) => {
      const module = await repository();
      const uids: string[] = [];
      for (const handle of input.members) uids.push(await module.resolveMemberUid(handle));
      return module.createGroupConversation(input.title, uids);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inbox', uid] });
    },
  });

  return {
    openDirect: async (handle) => direct.mutateAsync(handle),
    openGroup: async (title, members) => group.mutateAsync({ title, members }),
  };
}
