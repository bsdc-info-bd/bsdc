import { ensureRealtimeAuth, getSupabase } from '@/lib/supabase/client';
import type { ConversationMemberRow, MessageRow } from '@/lib/supabase/types';

/**
 * The messenger's live transport.
 *
 * Everything durable arrives the moment Postgres commits it: the client joins
 * a Realtime channel per open conversation and subscribes to the change feed
 * for `messages`, `message_reactions`, `message_receipts`, `message_pins` and
 * `conversation_members`. Postgres evaluates row level security for every
 * event, so a member receives exactly the rows that member is allowed to read
 * — no client-side filtering of anybody else's data.
 *
 * Typing and who-is-in-the-thread ride the same socket as broadcast and
 * presence, which are ephemeral by definition and never touch a table.
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

/**
 * Joins one conversation. Returns immediately; the channel reports its health
 * through `onStatus`.
 */
export function joinConversation(
  conversationId: string,
  uid: string,
  handlers: ConversationChannelHandlers,
): ConversationChannel {
  const supabase = getSupabase();
  void ensureRealtimeAuth();
  const signals = new Map<string, number>();
  const channel = supabase.channel(`conversation:${conversationId}`, {
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
        const row = (payload.new ?? payload.old) as MessageRow;
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
        handlers.onMembers?.((payload.new as ConversationMemberRow | undefined) ?? null);
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
    })
    .subscribe((status) => {
      if (stopped) return;
      const next = mapStatus(status);
      if (next === 'live') {
        live = true;
        void channel.track({ uid, at: Date.now() });
      } else {
        live = false;
        // A dropped socket rejoins with whatever token it holds: renew it.
        void ensureRealtimeAuth();
      }
      handlers.onStatus?.(next);
    });

  return {
    isLive: () => live,
    signalTyping: (typing: boolean) => {
      if (!live) return;
      void channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: typing ? { uid, at: Date.now() } : { uid, at: 0 },
      });
    },
    stop: () => {
      stopped = true;
      live = false;
      clearInterval(sweep);
      signals.clear();
      void supabase.removeChannel(channel);
    },
  };
}

/**
 * The inbox: one channel for the whole signed-in session. Every event only
 * asks the list to refresh — the list itself is one cheap view read.
 */
export function joinInbox(uid: string, handlers: InboxChannelHandlers): () => void {
  const supabase = getSupabase();
  void ensureRealtimeAuth();
  let stopped = false;

  const channel = supabase
    .channel(`inbox:${uid}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () =>
      handlers.onActivity?.(),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () =>
      handlers.onActivity?.(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'conversation_members', filter: `uid=eq.${uid}` },
      () => handlers.onActivity?.(),
    )
    .subscribe((status) => {
      if (stopped) return;
      const next = mapStatus(status);
      if (next !== 'live') void ensureRealtimeAuth();
      handlers.onStatus?.(next);
    });

  return () => {
    stopped = true;
    void supabase.removeChannel(channel);
  };
}
