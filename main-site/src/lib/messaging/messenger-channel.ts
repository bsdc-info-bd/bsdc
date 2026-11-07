import type { RealtimeChannel } from '@supabase/supabase-js';
import { ensureRealtimeAuth, getSupabase, type BsdcSupabaseClient } from '@/lib/supabase/client';
import type { ConversationMemberRow, MessageRow } from '@/lib/supabase/types';

/**
 * The messenger's live transport.
 *
 * Everything durable arrives the moment Postgres commits it: the client joins
 * a Realtime channel per open conversation and subscribes to the change feed
 * for `messages`, `message_reactions`, `message_receipts`, `message_pins` and
 * `conversation_members`. Postgres Changes applies table RLS to inserts and
 * updates; deletes cannot be RLS-checked and expose only primary keys when RLS
 * is enabled. Neither rule applies to broadcast or presence.
 *
 * Typing and who-is-in-the-thread ride public broadcast and presence topics.
 * These ephemeral signals are NOT protected by the message table's RLS; see
 * docs/messenger.md for the private-channel authorization still required.
 *
 * The inbox has its own channel: `messages` inserts and `conversations`
 * updates tell it to refresh, instead of a twenty-second poll.
 */

export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

export type LiveEvent = 'INSERT' | 'UPDATE' | 'DELETE';

export interface ConversationChannelHandlers {
  /** A durable change to a line of this conversation. */
  onMessage?: (row: MessageRow, event: LiveEvent) => void;
  /** Reactions, receipts or pins moved; the lines are cheap to re-read. */
  onMessageMeta?: () => void;
  /** Somebody joined or left the thread, or changed their read marker. */
  onMembers?: (row: ConversationMemberRow | null) => void;
  /** Members currently typing in this thread. */
  onTyping?: (uids: string[]) => void;
  /** Members currently present in this thread. */
  onPresence?: (uids: string[]) => void;
  /** Transport health, so the screen can say "live" or fall back to polling. */
  onStatus?: (status: LiveStatus) => void;
  /** Broadcast round trip measured in milliseconds, for the status chip. */
  onLatency?: (ms: number) => void;
}

export interface InboxChannelHandlers {
  /** Something happened that changes the conversation list. */
  onActivity?: () => void;
  onStatus?: (status: LiveStatus) => void;
}

export interface ConversationChannel {
  /** True while the socket is joined and events are flowing. */
  readonly isLive: () => boolean;
  /** Publishes or clears this member's typing signal. */
  signalTyping: (typing: boolean) => void;
  /** Leaves the channel and releases every listener. */
  stop: () => void;
}

const TYPING_TTL_MS = 6_000;
const AUTH_REFRESH_MS = 45 * 60 * 1_000;
const AUTH_RETRY_MS = 12_000;

function mapStatus(status: string): LiveStatus {
  switch (status) {
    case 'SUBSCRIBED':
      return 'live';
    case 'CHANNEL_ERROR':
      return 'reconnecting';
    case 'TIMED_OUT':
      return 'offline';
    default:
      return 'connecting';
  }
}

/** Members typing right now: their signal is younger than the window. */
export function liveTypers(
  signals: ReadonlyMap<string, number>,
  viewerUid: string,
  now = Date.now(),
): string[] {
  const list: string[] = [];
  for (const [uid, at] of signals) {
    if (uid !== viewerUid && now - at < TYPING_TTL_MS) list.push(uid);
  }
  return list.sort();
}

function presenceUids(state: Record<string, unknown[]>): string[] {
  const uids = new Set<string>();
  for (const [key, metas] of Object.entries(state)) {
    for (const meta of metas) {
      const uid = (meta as { uid?: unknown } | null)?.uid;
      if (typeof uid === 'string' && uid.length > 0) uids.add(uid);
      else if (key.length > 0) uids.add(key);
    }
  }
  return [...uids].sort();
}

// An error while leaving may leave the old channel in the SDK's same-topic
// registry. Never attach new listeners to that closed/stale object. A recovery
// topic can still receive RLS-filtered Postgres changes; ephemeral presence and
// typing are paused and the UI reports reconnecting until the canonical topic
// is available again (usually after a socket reset or reload).
const abandonedConversationChannels = new Map<string, RealtimeChannel>();
const channelPrefix = Math.random().toString(36).slice(2);
let channelSequence = 0;

async function removeMessengerChannel(
  client: BsdcSupabaseClient,
  channel: RealtimeChannel,
): Promise<boolean> {
  // The SDK only calls teardown on 'ok'. Retry a failed leave once; after a
  // timeout the Phoenix close handler may already have removed the channel.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if ((await client.removeChannel(channel)) === 'ok') return true;
    } catch {
      // A rejected leave must not strand the next subscription.
    }
    if (!client.getChannels().includes(channel)) {
      channel.teardown();
      return true;
    }
  }
  channel.teardown();
  return !client.getChannels().includes(channel);
}

interface ConversationTransport extends Omit<ConversationChannel, 'stop'> {
  stop: () => Promise<void>;
}

/** Open the single transport shared by this tab's listeners for a thread. */
function openConversationChannel(
  conversationId: string,
  uid: string,
  handlers: ConversationChannelHandlers,
): ConversationTransport {
  const supabase = getSupabase();
  const signals = new Map<string, number>();
  const canonicalTopic = `conversation:${conversationId}`;
  const abandoned = abandonedConversationChannels.get(conversationId);
  const recovering = abandoned !== undefined && supabase.getChannels().includes(abandoned);
  if (abandoned !== undefined && !recovering) abandonedConversationChannels.delete(conversationId);
  const topic = recovering
    ? `${canonicalTopic}:recovery:${channelPrefix}:${++channelSequence}`
    : canonicalTopic;
  const channel = supabase.channel(topic, {
    config: { presence: { key: uid }, broadcast: { self: false } },
  });
  let live = false;
  let stopped = false;

  const emitTypers = () => {
    handlers.onTyping?.(liveTypers(signals, uid));
  };
  const sweep = setInterval(emitTypers, 1_500);

  channel
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as MessageRow;
        if (row !== undefined && row !== null && typeof row.id === 'string') {
          handlers.onMessage?.(row, payload.eventType as LiveEvent);
        } else {
          handlers.onMessageMeta?.();
        }
      },
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () =>
      handlers.onMessageMeta?.(),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_receipts' }, () =>
      handlers.onMessageMeta?.(),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_pins' }, () =>
      handlers.onMessageMeta?.(),
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversation_members',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const candidate = payload.eventType === 'DELETE' ? payload.old : payload.new;
        const row = candidate as ConversationMemberRow | undefined;
        handlers.onMembers?.(row && typeof row.uid === 'string' ? row : null);
      },
    )
    .on('broadcast', { event: 'typing' }, (message) => {
      const payload = message.payload as { uid?: unknown; at?: unknown } | null;
      const who = payload?.uid;
      const when = payload?.at;
      if (typeof who !== 'string' || who === uid) return;
      if (when === null || when === undefined) signals.set(who, Date.now());
      else
        signals.set(who, typeof when === 'number' ? when : Date.parse(String(when)) || Date.now());
      emitTypers();
    })
    .on('broadcast', { event: 'ping' }, (message) => {
      const payload = message.payload as { at?: unknown; from?: unknown } | null;
      if (payload?.from === uid || typeof payload?.at !== 'number') return;
      handlers.onLatency?.(Math.max(0, Date.now() - payload.at));
    })
    .on('presence', { event: 'sync' }, () => {
      handlers.onPresence?.(presenceUids(channel.presenceState() as Record<string, unknown[]>));
    });

  // Authenticate the intended account before subscribing. Failed token
  // bootstrap must not fall through to the socket's cached previous token.
  let authRetry: ReturnType<typeof setTimeout> | null = null;
  const connect = () => {
    void ensureRealtimeAuth(uid)
      .then(() => {
        if (stopped) return;
        channel.subscribe((status) => {
          if (stopped) return;
          const next = mapStatus(status);
          if (next === 'live') {
            live = true;
            if (!recovering) void channel.track({ uid, at: Date.now() });
          } else {
            live = false;
            void ensureRealtimeAuth(uid).catch(() => undefined);
          }
          handlers.onStatus?.(recovering && next === 'live' ? 'reconnecting' : next);
        });
      })
      .catch(() => {
        if (stopped) return;
        handlers.onStatus?.('offline');
        authRetry = setTimeout(connect, AUTH_RETRY_MS);
      });
  };
  connect();
  const authRefresh = setInterval(
    () => void ensureRealtimeAuth(uid).catch(() => undefined),
    AUTH_REFRESH_MS,
  );

  return {
    isLive: () => live && !recovering,
    signalTyping: (typing: boolean) => {
      if (!live || recovering) return;
      void channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: typing ? { uid, at: Date.now() } : { uid, at: 0 },
      });
    },
    stop: async () => {
      if (stopped) return;
      stopped = true;
      live = false;
      clearInterval(sweep);
      clearInterval(authRefresh);
      if (authRetry !== null) clearTimeout(authRetry);
      signals.clear();
      const removed = await removeMessengerChannel(supabase, channel);
      if (!removed && topic === canonicalTopic) {
        abandonedConversationChannels.set(conversationId, channel);
      }
    },
  };
}

interface SharedConversation {
  id: string;
  uid: string;
  handlers: Set<ConversationChannelHandlers>;
  transport: ConversationTransport | null;
  status: LiveStatus;
  closed: boolean;
}

const conversations = new Map<string, SharedConversation>();
const closingConversations = new Map<string, Promise<void>>();

function closeConversation(entry: SharedConversation): void {
  if (entry.closed) return;
  entry.closed = true;
  // An account switch can close a still-listened-to entry before its network
  // leave resolves. Never forward those late events to the previous account.
  entry.handlers.clear();
  if (conversations.get(entry.id) === entry) conversations.delete(entry.id);
  if (entry.transport === null) return;

  const closing = entry.transport.stop();
  closingConversations.set(entry.id, closing);
  void closing.then(() => {
    if (closingConversations.get(entry.id) === closing) closingConversations.delete(entry.id);
  });
}

/**
 * Supabase reuses channel objects for the same topic. Share a single transport
 * for simultaneous subscribers, and wait for an old leave before rejoining:
 * otherwise a quick thread switch can reuse a channel that is being removed.
 * Normally all members use the same topic for typing and presence broadcasts.
 * A rare failed leave falls back to data-only recovery instead of reusing it.
 */
export function joinConversation(
  conversationId: string,
  uid: string,
  handlers: ConversationChannelHandlers,
): ConversationChannel {
  let entry = conversations.get(conversationId);
  if (entry !== undefined && entry.uid !== uid) {
    closeConversation(entry);
    entry = undefined;
  }
  if (entry === undefined) {
    const next: SharedConversation = {
      id: conversationId,
      uid,
      handlers: new Set(),
      transport: null,
      status: 'connecting',
      closed: false,
    };
    conversations.set(conversationId, next);
    entry = next;
    const previousLeave = closingConversations.get(conversationId) ?? Promise.resolve();
    void previousLeave
      .then(() => {
        if (next.closed) return;
        next.transport = openConversationChannel(conversationId, uid, {
          onMessage: (row, event) => {
            for (const listener of next.handlers) listener.onMessage?.(row, event);
          },
          onMessageMeta: () => {
            for (const listener of next.handlers) listener.onMessageMeta?.();
          },
          onMembers: (row) => {
            for (const listener of next.handlers) listener.onMembers?.(row);
          },
          onTyping: (uids) => {
            for (const listener of next.handlers) listener.onTyping?.(uids);
          },
          onPresence: (uids) => {
            for (const listener of next.handlers) listener.onPresence?.(uids);
          },
          onStatus: (status) => {
            next.status = status;
            for (const listener of next.handlers) listener.onStatus?.(status);
          },
          onLatency: (ms) => {
            for (const listener of next.handlers) listener.onLatency?.(ms);
          },
        });
      })
      .catch(() => {
        if (next.closed) return;
        next.status = 'offline';
        for (const listener of next.handlers) listener.onStatus?.('offline');
      });
  }

  const shared = entry;
  // A caller may reuse the same handlers object for more than one subscription.
  const listener = { ...handlers };
  shared.handlers.add(listener);
  listener.onStatus?.(shared.status);
  let stopped = false;
  return {
    isLive: () => !shared.closed && (shared.transport?.isLive() ?? false),
    signalTyping: (typing) => {
      if (!shared.closed) shared.transport?.signalTyping(typing);
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      shared.handlers.delete(listener);
      if (shared.handlers.size === 0) closeConversation(shared);
    },
  };
}

// Supabase reuses same-topic channel objects, but inbox consumers (the page
// and the app-bar badge) have independent lifetimes. They need unique topics
// so unmounting one subscriber cannot silently unsubscribe the other.
/**
 * The inbox: a channel per subscriber for the signed-in session. Every event only
 * asks the list to refresh — the list itself is one cheap view read.
 */
export function joinInbox(uid: string, handlers: InboxChannelHandlers): () => void {
  const supabase = getSupabase();
  let stopped = false;

  const channel = supabase
    .channel(`inbox:${uid}:${channelPrefix}:${++channelSequence}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
      if (!stopped) handlers.onActivity?.();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
      if (!stopped) handlers.onActivity?.();
    })
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'conversation_members', filter: `uid=eq.${uid}` },
      () => {
        if (!stopped) handlers.onActivity?.();
      },
    );

  let authRetry: ReturnType<typeof setTimeout> | null = null;
  const connect = () => {
    void ensureRealtimeAuth(uid)
      .then(() => {
        if (stopped) return;
        channel.subscribe((status) => {
          if (stopped) return;
          const next = mapStatus(status);
          if (next !== 'live') void ensureRealtimeAuth(uid).catch(() => undefined);
          handlers.onStatus?.(next);
        });
      })
      .catch(() => {
        if (stopped) return;
        handlers.onStatus?.('offline');
        authRetry = setTimeout(connect, AUTH_RETRY_MS);
      });
  };
  connect();
  const authRefresh = setInterval(
    () => void ensureRealtimeAuth(uid).catch(() => undefined),
    AUTH_REFRESH_MS,
  );

  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(authRefresh);
    if (authRetry !== null) clearTimeout(authRetry);
    void removeMessengerChannel(supabase, channel);
  };
}
