import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConversationChannel, LiveStatus } from '@/lib/messaging/messenger-channel';
import type * as MessengerChannelModule from '@/lib/messaging/messenger-channel';
import type * as MessageRepositoryModule from '@/lib/messaging/message-repository';
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
  compareMessageInstants,
  groupMessages,
  matchesFilter,
  sortConversations,
  upsertMessage,
} from '@/lib/messaging/message-types';
import { dataErrorKey } from '@/lib/supabase/errors';
import { readOutbox, writeOutbox } from '@/lib/messaging/outbox';
import { useAuthStore } from '@/store/auth-store';

// Both modules reach a network SDK, so they are only ever loaded on demand —
// the app bar's unread badge must stay cheap.
let repositoryPromise: Promise<typeof MessageRepositoryModule> | null = null;
let channelPromise: Promise<typeof MessengerChannelModule> | null = null;
const repository = () => {
  repositoryPromise ??= import('@/lib/messaging/message-repository').catch((error: unknown) => {
    repositoryPromise = null;
    throw error;
  });
  return repositoryPromise;
};
const channelModule = () => {
  channelPromise ??= import('@/lib/messaging/messenger-channel').catch((error: unknown) => {
    channelPromise = null;
    throw error;
  });
  return channelPromise;
};

/**
 * A poll is a last resort, not the transport: it runs only while the realtime
 * socket is not joined. A slower reconciliation while live also repairs missed
 * events after token refreshes, reconnections and transient publication gaps.
 */
const FALLBACK_THREAD_MS = 12_000;
const FALLBACK_INBOX_MS = 30_000;
const LIVE_RECONCILE_MS = 60_000;
const META_DEBOUNCE_MS = 250;
const DRAFT_DEBOUNCE_MS = 900;
const READ_DEBOUNCE_MS = 400;
const draftWrites = new Map<string, Promise<void>>();
interface PendingDraft {
  body: string;
  failed: boolean;
}
// A server refresh must not overwrite a newer, locally edited draft while its
// debounced write is still in flight. Keys are scoped to both account and room.
const pendingDrafts = new Map<string, PendingDraft>();
const draftCache = new Map<string, string>();
const draftKey = (uid: string, conversationId: string) => JSON.stringify([uid, conversationId]);

function writeDraftInOrder(conversationId: string, uid: string, body: string): Promise<void> {
  const key = draftKey(uid, conversationId);
  const previous = draftWrites.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await (
        await repository()
      ).updateConversationSettings(conversationId, uid, {
        draft_body: body.slice(0, 8_000),
      });
    });
  draftWrites.set(key, next);
  void next
    .finally(() => {
      if (draftWrites.get(key) === next) draftWrites.delete(key);
    })
    .catch(() => undefined);
  return next;
}

interface MemberSettings {
  pinned: boolean;
  archived: boolean;
  muted: boolean;
}

export interface InboxResult {
  conversations: ConversationSummary[];
  /** Includes conversations hidden by the current inbox filter. */
  allConversations: ConversationSummary[];
  filter: InboxFilter;
  setFilter: (filter: InboxFilter) => void;
  query: string;
  setQuery: (query: string) => void;
  status: LiveStatus;
  isLoading: boolean;
  isError: boolean;
  unreadTotal: number;
  settingsOf: (conversationId: string) => MemberSettings;
  markRead: (conversationId: string) => Promise<void>;
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
    refetchInterval: status === 'live' ? LIVE_RECONCILE_MS : FALLBACK_INBOX_MS,
  });

  const settingsQuery = useQuery({
    queryKey: ['inbox-settings', uid],
    queryFn: async () => (await repository()).fetchMyConversationSettings(uid ?? ''),
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

    void channelModule()
      .then((module) => {
        if (cancelled) return;
        stop = module.joinInbox(uid, { onActivity: touch, onStatus: setStatus });
      })
      .catch(() => {
        if (!cancelled) setStatus('offline');
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
    async (conversationId: string) => {
      await (await repository()).markConversationRead(conversationId);
      void queryClient.invalidateQueries({ queryKey: ['inbox', uid] });
      void queryClient.invalidateQueries({ queryKey: ['messages-unread', uid] });
    },
    [queryClient, uid],
  );

  return {
    conversations,
    allConversations: inboxQuery.data ?? [],
    filter,
    setFilter,
    query,
    setQuery,
    status,
    isLoading: inboxQuery.isLoading || settingsQuery.isLoading,
    isError: inboxQuery.isError || settingsQuery.isError,
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
  const queryClient = useQueryClient();
  const { data = 0 } = useQuery({
    queryKey: ['messages-unread', uid],
    queryFn: async () => (await repository()).fetchUnreadMessageCount(),
    enabled: uid !== null,
    staleTime: 10_000,
    refetchInterval: status === 'live' ? LIVE_RECONCILE_MS : FALLBACK_INBOX_MS,
  });

  useEffect(() => {
    if (uid === null) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    void channelModule()
      .then((module) => {
        if (cancelled) return;
        stop = module.joinInbox(uid, {
          onStatus: setStatus,
          onActivity: () => {
            void queryClient.invalidateQueries({ queryKey: ['messages-unread', uid] });
          },
        });
      })
      .catch(() => {
        if (!cancelled) setStatus('offline');
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [uid, queryClient]);

  return data;
}

export interface SendOptions {
  replyTo?: string | null;
  kind?: Message['kind'];
  mediaUrl?: string;
  mediaName?: string;
  codeLanguage?: string;
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
  isLoadingOlder: boolean;
  initialDraft: string;
  draftSaveFailed: boolean;
  retryDraft: () => void;
  refresh: () => void;
  send: (body: string, options?: SendOptions) => Promise<void>;
  retry: (message: Message) => Promise<void>;
  discard: (message: Message) => void;
  edit: (messageId: string, body: string) => Promise<void>;
  remove: (messageId: string) => Promise<void>;
  react: (messageId: string, reaction: string) => Promise<void>;
  star: (messageId: string) => Promise<void>;
  pin: (messageId: string) => Promise<void>;
  loadOlder: () => Promise<string | null>;
  loadUntil: (messageId: string) => Promise<boolean>;
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
  const [olderExhausted, setOlderExhausted] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const loadingOlder = useRef(false);
  const [typingUids, setTypingUids] = useState<string[]>([]);
  const [presentUids, setPresentUids] = useState<string[]>([]);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [draftSaveFailed, setDraftSaveFailed] = useState(
    () => uid !== null && (pendingDrafts.get(draftKey(uid, conversationId))?.failed ?? false),
  );
  const activeDraftKey = uid === null ? null : draftKey(uid, conversationId);
  const activeDraftKeyRef = useRef(activeDraftKey);
  activeDraftKeyRef.current = activeDraftKey;
  useEffect(() => {
    setDraftSaveFailed(
      activeDraftKey !== null && (pendingDrafts.get(activeDraftKey)?.failed ?? false),
    );
  }, [activeDraftKey]);
  const channel = useRef<ConversationChannel | null>(null);
  const lastTypingAt = useRef(0);
  const metaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readUpTo = useRef<string | null>(null);
  const readPending = useRef<string | null>(null);

  const keys = useMemo(
    () => ({
      messages: ['messages', uid, conversationId],
      members: ['conversation-members', uid, conversationId],
      state: ['conversation-state', uid, conversationId],
      pins: ['conversation-pins', uid, conversationId],
      outbox: ['message-outbox', uid, conversationId],
    }),
    [conversationId, uid],
  );

  const enabled = conversationId.length > 0 && uid !== null;

  // A tab-scoped outbox survives navigation and reloads, and is keyed by user
  // and conversation. Session storage is removed when the browser tab closes.
  const outboxQuery = useQuery<Message[]>({
    queryKey: keys.outbox,
    queryFn: () => Promise.resolve([]),
    initialData: () => (uid === null ? [] : readOutbox(uid, conversationId)),
    enabled: false,
    gcTime: 24 * 60 * 60 * 1_000,
  });
  const outbox = outboxQuery.data;
  const updateOutbox = useCallback(
    (update: (current: Message[]) => Message[]) => {
      queryClient.setQueryData<Message[]>(keys.outbox, (current) => {
        const next = update(current ?? []);
        if (uid !== null) writeOutbox(uid, conversationId, next);
        return next;
      });
    },
    [queryClient, keys.outbox, uid, conversationId],
  );

  const query = useQuery({
    queryKey: keys.messages,
    queryFn: async () => (await repository()).fetchConversationMessages(conversationId, null, 60),
    enabled,
    staleTime: 10_000,
    refetchInterval: status === 'live' ? LIVE_RECONCILE_MS : FALLBACK_THREAD_MS,
  });

  const membersQuery = useQuery({
    queryKey: keys.members,
    queryFn: async () => (await repository()).fetchMembers(conversationId),
    enabled,
    staleTime: 30_000,
  });

  const stateQuery = useQuery({
    queryKey: keys.state,
    queryFn: async () => {
      const state = await (await repository()).fetchConversationState(conversationId);
      if (uid !== null) {
        const key = draftKey(uid, conversationId);
        if (!pendingDrafts.has(key) && !draftWrites.has(key)) {
          draftCache.delete(key);
        }
      }
      return state;
    },
    enabled,
    staleTime: 60_000,
    // Membership may be revoked while Realtime is disconnected or an event is
    // missed. Periodically recheck so an open composer cannot stay enabled.
    refetchInterval: status === 'live' ? LIVE_RECONCILE_MS : FALLBACK_THREAD_MS,
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
            queryClient.setQueryData<Message[]>(keys.messages, page);
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

    void channelModule()
      .then((module) => {
        if (cancelled) return;
        const joined = module.joinConversation(conversationId, uid, {
          onStatus: setStatus,
          onTyping: setTypingUids,
          onPresence: setPresentUids,
          onLatency: setLatencyMs,
          onMessage: (row, event) => {
            // A lost HTTP response can follow a commit. Reconcile the local
            // copy as soon as the matching durable live row is received.
            if (event !== 'DELETE' && row.sender_uid === uid && row.client_id) {
              updateOutbox((current) =>
                current.filter((message) => message.clientId !== row.client_id),
              );
            }
            if (event === 'DELETE') {
              setOlder((current) => current.filter((message) => message.id !== row.id));
              queryClient.setQueryData<Message[]>(keys.messages, (current) =>
                (current ?? []).filter((message) => message.id !== row.id),
              );
              refreshRef.current(0);
              return;
            }
            if (event === 'UPDATE') {
              setOlder((current) =>
                current.map((message) =>
                  message.id === row.id
                    ? {
                        ...message,
                        body: row.body,
                        editedAt: row.edited_at,
                        deletedAt: row.deleted_at,
                      }
                    : message,
                ),
              );
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
                    ...(row.client_id ? { clientId: row.client_id } : {}),
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
                ...(row.client_id ? { clientId: row.client_id } : {}),
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
          onMembers: (row) => {
            void queryClient.invalidateQueries({ queryKey: keys.members });
            if (row === null || row.uid === uid) {
              // Leaving or losing access must disable this composer promptly.
              void queryClient.invalidateQueries({ queryKey: keys.state });
              void queryClient.invalidateQueries({ queryKey: ['inbox', uid] });
            }
          },
        });
        channel.current = joined;
        stop = joined.stop;
      })
      .catch(() => {
        if (!cancelled) setStatus('offline');
      });

    return () => {
      cancelled = true;
      stop?.();
      channel.current = null;
      setTypingUids([]);
      setPresentUids([]);
    };
  }, [enabled, conversationId, uid, queryClient, keys, updateOutbox]);

  const recent = useMemo(() => query.data ?? [], [query.data]);
  useEffect(() => {
    if (uid === null || outbox.length === 0) return;
    const confirmed = new Set(
      recent
        .filter((message) => message.senderUid === uid && message.clientId !== undefined)
        .map((message) => message.clientId),
    );
    if (outbox.some((message) => confirmed.has(message.clientId))) {
      updateOutbox((current) => current.filter((message) => !confirmed.has(message.clientId)));
    }
  }, [uid, recent, outbox, updateOutbox]);

  const messages = useMemo(() => {
    let list: Message[] = [];
    for (const message of [...older, ...recent, ...outbox]) list = upsertMessage(list, message);
    return list.map((message) => {
      if (message.senderUid !== uid || message.clientState !== undefined) return message;
      const readers = members
        .filter(
          (member) =>
            member.uid !== uid &&
            member.leftAt === null &&
            compareMessageInstants(member.lastReadAt, message.createdAt) >= 0,
        )
        .map((member) => member.uid);
      return { ...message, readBy: [...new Set([...message.readBy, ...readers])] };
    });
  }, [older, recent, outbox, members, uid]);

  const groups = useMemo(() => groupMessages(messages), [messages]);

  const hasOlder = !olderExhausted && (older.length > 0 || recent.length >= 60);

  type SendInput = {
    clientId: string;
    body: string;
    replyTo: string | null;
    kind: Message['kind'];
    mediaUrl: string;
    mediaName: string;
    codeLanguage: string;
  };

  const sendMutation = useMutation({
    mutationFn: async (input: SendInput) =>
      (await repository()).sendMessage({ conversationId, ...input }),
    onMutate: (input) => {
      const optimistic: Message = {
        id: `pending:${input.clientId}`,
        clientId: input.clientId,
        conversationId,
        senderUid: uid,
        kind: input.kind,
        body: input.body,
        mediaUrl: input.mediaUrl,
        mediaName: input.mediaName,
        codeLanguage: input.codeLanguage,
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
      updateOutbox((current) => {
        const existing = current.find((message) => message.id === optimistic.id);
        return upsertMessage(current, {
          ...optimistic,
          createdAt: existing?.createdAt ?? optimistic.createdAt,
        });
      });
    },
    onSuccess: (row, input) => {
      // A change-feed row can arrive before the HTTP response. Preserve any
      // richer receipt/reaction data it already carries and remove only our
      // matching pending item.
      queryClient.setQueryData<Message[]>(keys.messages, (current) => {
        if ((current ?? []).some((message) => message.id === row.id)) return current;
        return upsertMessage(current ?? [], { ...row, author: authorRef.current(row.senderUid) });
      });
      updateOutbox((current) => current.filter((message) => message.clientId !== input.clientId));
      refreshRef.current(0);
      if (uid !== null) void queryClient.invalidateQueries({ queryKey: ['inbox', uid] });
    },
    onError: (_error, input) => {
      updateOutbox((current) =>
        current.map((message) =>
          message.clientId === input.clientId ? { ...message, clientState: 'failed' } : message,
        ),
      );
    },
  });

  const retry = useCallback(
    async (message: Message) => {
      if (message.clientId === undefined || message.clientState !== 'failed') return;
      await sendMutation.mutateAsync({
        clientId: message.clientId,
        body: message.body,
        replyTo: message.replyTo,
        kind: message.kind,
        mediaUrl: message.mediaUrl,
        mediaName: message.mediaName,
        codeLanguage: message.codeLanguage,
      });
    },
    [sendMutation],
  );

  const patchMessage = useCallback(
    (messageId: string, apply: (message: Message) => Message) => {
      const patch = (list: Message[]) =>
        list.map((message) => (message.id === messageId ? apply(message) : message));
      queryClient.setQueryData<Message[]>(keys.messages, (current) => patch(current ?? []));
      setOlder(patch);
    },
    [keys.messages, queryClient],
  );

  const editMutation = useMutation({
    mutationFn: async ({ messageId, body }: { messageId: string; body: string }) =>
      (await repository()).editMessage(messageId, body),
    onSuccess: (_result, { messageId, body }) => {
      patchMessage(messageId, (message) => ({
        ...message,
        body: body.trim(),
        editedAt: new Date().toISOString(),
      }));
      refreshRef.current(0);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (messageId: string) => (await repository()).deleteMessage(messageId),
    onSuccess: (_result, messageId) => {
      patchMessage(messageId, (message) => ({
        ...message,
        body: '',
        deletedAt: new Date().toISOString(),
      }));
      refreshRef.current(0);
    },
  });

  const reactionMutation = useMutation({
    mutationFn: async ({ messageId, reaction }: { messageId: string; reaction: string }) =>
      (await repository()).toggleMessageReaction(messageId, reaction),
    onSuccess: (result, { messageId, reaction }) => {
      patchMessage(messageId, (message) => {
        const reactions = { ...message.reactions };
        if (result.total === 0) delete reactions[reaction];
        else reactions[reaction] = result.total;
        return {
          ...message,
          reactions,
          myReactions: result.reacted
            ? [...new Set([...message.myReactions, reaction])]
            : message.myReactions.filter((value) => value !== reaction),
        };
      });
    },
  });

  const starMutation = useMutation({
    mutationFn: async (messageId: string) => (await repository()).toggleMessageStar(messageId),
    onSuccess: (starred, messageId) => {
      patchMessage(messageId, (message) => ({ ...message, starred }));
      void queryClient.invalidateQueries({ queryKey: ['saved-messages', uid] });
    },
  });

  const pinMutation = useMutation({
    mutationFn: async (messageId: string) => (await repository()).toggleMessagePin(messageId),
    onSuccess: (pinned, messageId) => {
      patchMessage(messageId, (message) => ({ ...message, pinned }));
      void queryClient.invalidateQueries({ queryKey: keys.pins });
    },
  });

  const loadOlder = useCallback(async () => {
    const oldest = messages.find((message) => message.clientState === undefined);
    if (oldest === undefined || !hasOlder || loadingOlder.current) return null;
    loadingOlder.current = true;
    setIsLoadingOlder(true);
    try {
      const page = await (
        await repository()
      ).fetchConversationMessages(conversationId, oldest.createdAt, 60, oldest.id);
      if (page.length < 60) setOlderExhausted(true);
      setOlder((current) => {
        let list = current;
        for (const message of page) list = upsertMessage(list, message);
        return list;
      });
      // Lets the view wait until React has actually rendered the new page
      // before restoring the reader's scroll position.
      return page[0]?.id ?? null;
    } finally {
      loadingOlder.current = false;
      setIsLoadingOlder(false);
    }
  }, [conversationId, messages, hasOlder]);

  // Search and pins can point outside the newest page. Load contiguous older
  // pages, bounded per click, rather than pretending an off-screen jump worked.
  const loadUntil = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (messages.some((message) => message.id === messageId)) return true;
      if (!hasOlder || loadingOlder.current) return false;
      let before = messages.find((message) => message.clientState === undefined);
      if (before === undefined) return false;
      loadingOlder.current = true;
      setIsLoadingOlder(true);
      try {
        for (let i = 0; i < 10; i += 1) {
          const page = await (
            await repository()
          ).fetchConversationMessages(conversationId, before.createdAt, 60, before.id);
          setOlder((current) => {
            let list = current;
            for (const message of page) list = upsertMessage(list, message);
            return list;
          });
          if (page.length < 60) setOlderExhausted(true);
          if (page.some((message) => message.id === messageId)) return true;
          if (page.length < 60 || page[0] === undefined) return false;
          before = page[0];
        }
        return false;
      } finally {
        loadingOlder.current = false;
        setIsLoadingOlder(false);
      }
    },
    [conversationId, messages, hasOlder],
  );

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
      const key = draftKey(uid, conversationId);
      const pending: PendingDraft = { body, failed: false };
      pendingDrafts.set(key, pending);
      draftCache.set(key, body);
      setDraftSaveFailed(false);
      // Keep the unsent text available immediately on return to this room.
      queryClient.setQueryData<ConversationState | null>(keys.state, (current) =>
        current === null || current === undefined ? current : { ...current, draftBody: body },
      );
      if (draftTimer.current !== null) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        draftTimer.current = null;
        void writeDraftInOrder(conversationId, uid, body)
          .then(() => {
            // An older write may finish after newer typing. It must not reset
            // the cached draft or clear the newer write's pending overlay.
            if (pendingDrafts.get(key) !== pending) return;
            let populated = false;
            queryClient.setQueryData<ConversationState | null>(keys.state, (current) => {
              if (current === null || current === undefined) return current;
              populated = true;
              return { ...current, draftBody: body };
            });
            if (populated) draftCache.delete(key);
            pendingDrafts.delete(key);
            if (activeDraftKeyRef.current === key) setDraftSaveFailed(false);
          })
          .catch(() => {
            if (pendingDrafts.get(key) !== pending) return;
            pending.failed = true;
            if (activeDraftKeyRef.current === key) setDraftSaveFailed(true);
          });
      }, DRAFT_DEBOUNCE_MS);
    },
    [conversationId, keys, queryClient, uid],
  );

  const markRead = useCallback(
    (messageId: string) => {
      if (uid === null || readUpTo.current === messageId || readPending.current === messageId)
        return;
      if (readTimer.current !== null) clearTimeout(readTimer.current);
      readPending.current = messageId;
      readTimer.current = setTimeout(() => {
        readTimer.current = null;
        void repository()
          .then(async (module) => module.markMessageRead(messageId))
          .then(() => {
            readUpTo.current = messageId;
            void queryClient.invalidateQueries({ queryKey: ['inbox', uid] });
            void queryClient.invalidateQueries({ queryKey: ['messages-unread', uid] });
          })
          .catch(() => undefined)
          .finally(() => {
            if (readPending.current === messageId) readPending.current = null;
          });
      }, READ_DEBOUNCE_MS);
    },
    [queryClient, uid],
  );

  useEffect(
    () => () => {
      if (metaTimer.current !== null) clearTimeout(metaTimer.current);
      if (readTimer.current !== null) clearTimeout(readTimer.current);
      // Draft writes intentionally finish even after the member switches rooms.
    },
    [],
  );

  return {
    messages,
    groups,
    members,
    pins: pinsQuery.data ?? [],
    state:
      stateQuery.data === null || stateQuery.data === undefined
        ? null
        : {
            ...stateQuery.data,
            draftBody:
              uid === null
                ? stateQuery.data.draftBody
                : (pendingDrafts.get(draftKey(uid, conversationId))?.body ??
                  draftCache.get(draftKey(uid, conversationId)) ??
                  stateQuery.data.draftBody),
          },
    typingUids,
    presentUids,
    status,
    latencyMs,
    isLoading: query.isLoading || stateQuery.isLoading,
    isError:
      query.isError || stateQuery.isError || (stateQuery.isSuccess && stateQuery.data === null),
    isSending: sendMutation.isPending,
    hasOlder,
    isLoadingOlder,
    initialDraft:
      uid === null
        ? ''
        : (pendingDrafts.get(draftKey(uid, conversationId))?.body ??
          stateQuery.data?.draftBody ??
          draftCache.get(draftKey(uid, conversationId)) ??
          ''),
    draftSaveFailed,
    retryDraft: () => {
      if (uid === null) return;
      const pending = pendingDrafts.get(draftKey(uid, conversationId));
      if (pending !== undefined) saveDraft(pending.body);
    },
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: keys.messages });
      void queryClient.invalidateQueries({ queryKey: keys.state });
      void queryClient.invalidateQueries({ queryKey: keys.members });
    },
    send: async (body, options) => {
      const trimmed = body.trim();
      const kind = options?.kind ?? 'text';
      if (trimmed.length === 0 && kind === 'text') return;
      await sendMutation.mutateAsync({
        clientId: crypto.randomUUID(),
        body: trimmed,
        replyTo: options?.replyTo ?? null,
        kind,
        mediaUrl: options?.mediaUrl ?? '',
        mediaName: options?.mediaName ?? '',
        codeLanguage: options?.codeLanguage ?? '',
      });
      clearTyping();
    },
    retry,
    discard: (message) => {
      if (message.clientState === 'failed')
        updateOutbox((current) => current.filter((entry) => entry.id !== message.id));
    },
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
    loadUntil,
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
): { hits: MessageSearchHit[]; isLoading: boolean; isError: boolean; retry: () => void } {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const trimmed = query.trim();
  const result = useQuery({
    queryKey: ['message-search', uid, conversationId, trimmed],
    queryFn: async () => (await repository()).searchMessages(trimmed, conversationId, 40),
    enabled: enabled && uid !== null && trimmed.length >= 2,
    staleTime: 5_000,
  });
  return {
    hits: result.data ?? [],
    isLoading: result.isLoading,
    isError: result.isError,
    retry: () => {
      void result.refetch();
    },
  };
}

/**
 * Writable settings for one member. The inbox already has a bulk settings
 * read and can opt out of a redundant per-row state query.
 */
export function useConversationSettings(
  conversationId: string,
  loadState = true,
): {
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
  const key = useMemo(() => ['conversation-state', uid, conversationId], [uid, conversationId]);
  const query = useQuery({
    queryKey: key,
    queryFn: async () => (await repository()).fetchConversationState(conversationId),
    enabled: loadState && conversationId.length > 0 && uid !== null,
    staleTime: 60_000,
  });

  const patch = useCallback(
    (next: Partial<ConversationState>) => {
      queryClient.setQueryData<ConversationState | null>(key, (current) =>
        current === null || current === undefined ? current : { ...current, ...next },
      );
      queryClient.setQueryData<Map<string, MemberSettings>>(['inbox-settings', uid], (current) => {
        const existing = current?.get(conversationId);
        if (current === undefined || existing === undefined) return current;
        const updated = new Map(current);
        updated.set(conversationId, {
          pinned: next.isPinned ?? existing.pinned,
          archived: next.isArchived ?? existing.archived,
          muted: next.muted ?? existing.muted,
        });
        return updated;
      });
      void queryClient.invalidateQueries({ queryKey: ['inbox', uid] });
    },
    [conversationId, key, queryClient, uid],
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
    state: loadState ? (query.data ?? null) : null,
    errorKey,
    dismissError: () => setErrorKey(null),
    setPinned: (pinned) => pinMutation.mutate(pinned),
    setArchived: (archived) => archiveMutation.mutate(archived),
    setMuted: (muted) => muteMutation.mutate(muted),
  };
}

/** The viewer's saved lines, from every conversation. */
export function useSavedMessages(enabled = true): {
  saved: SavedMessage[];
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
} {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const query = useQuery({
    queryKey: ['saved-messages', uid],
    queryFn: async () => (await repository()).fetchSavedMessages(),
    enabled: enabled && uid !== null,
    staleTime: 30_000,
  });
  return {
    saved: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    retry: () => {
      void query.refetch();
    },
  };
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
