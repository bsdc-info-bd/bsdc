import { createClient, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { joinConversation, joinInbox } from '@/lib/messaging/messenger-channel';

const mocks = vi.hoisted(() => ({
  getSupabase: vi.fn(),
  ensureRealtimeAuth: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => mocks);

type Handler = (payload: { eventType: string; new: unknown; old?: unknown }) => void;
class FakeChannel {
  bindings: { type: string; filter: { table?: string; event?: string }; handler: Handler }[] = [];
  subscriptions = 0;
  teardowns = 0;
  constructor(public topic: string) {}
  on(type: string, filter: { table?: string; event?: string }, handler: Handler) {
    this.bindings.push({ type, filter, handler });
    return this;
  }
  subscribe(callback: (status: string) => void) {
    this.subscriptions++;
    callback('SUBSCRIBED');
    return this;
  }
  track() {
    return Promise.resolve();
  }
  teardown() {
    this.teardowns++;
  }
  send() {
    return Promise.resolve();
  }
  presenceState() {
    return {};
  }
  emitMember(eventType: string, current: unknown, old: unknown) {
    for (const binding of this.bindings) {
      if (binding.type === 'postgres_changes' && binding.filter.table === 'conversation_members') {
        binding.handler({ eventType, new: current, old });
      }
    }
  }
  emitMessage(id: string) {
    for (const binding of this.bindings) {
      if (binding.type === 'postgres_changes' && binding.filter.table === 'messages') {
        binding.handler({ eventType: 'INSERT', new: { id } });
      }
    }
  }
}

// Match the Supabase SDK's same-topic reuse, rather than creating a new object
// on every channel() call; that distinction is central to these regressions.
let channels: Map<string, FakeChannel>;
let calls: string[];
let removeChannel: ReturnType<typeof vi.fn>;
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
beforeEach(() => {
  channels = new Map();
  calls = [];
  removeChannel = vi.fn((channel: FakeChannel) => {
    channels.delete(channel.topic);
    return Promise.resolve('ok');
  });
  mocks.getSupabase.mockReturnValue({
    channel: (topic: string) => {
      calls.push(topic);
      if (!channels.has(topic)) channels.set(topic, new FakeChannel(topic));
      return channels.get(topic);
    },
    removeChannel,
    getChannels: () => [...channels.values()],
  });
  mocks.ensureRealtimeAuth.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('messenger realtime lifecycle', () => {
  it('keeps the inbox page and unread badge independently subscribed', async () => {
    const pageActivity = vi.fn();
    const badgeActivity = vi.fn();
    const stopPage = joinInbox('alice', { onActivity: pageActivity });
    const stopBadge = joinInbox('alice', { onActivity: badgeActivity });
    await flush();
    expect(calls).toHaveLength(2);
    expect(new Set(calls).size).toBe(2);
    const [page, badge] = [...channels.values()];
    expect(page?.subscriptions).toBe(1);
    expect(badge?.subscriptions).toBe(1);
    page?.emitMessage('one');
    badge?.emitMessage('one');
    expect(pageActivity).toHaveBeenCalledOnce();
    expect(badgeActivity).toHaveBeenCalledOnce();
    stopPage();
    await flush();
    badge?.emitMessage('two');
    expect(badgeActivity).toHaveBeenCalledTimes(2);
    expect(removeChannel).toHaveBeenCalledTimes(1);
    stopBadge();
    await flush();
  });

  it('shares a conversation channel without detaching a remaining subscriber', async () => {
    const onMessage = vi.fn();
    const handlers = { onMessage };
    const first = joinConversation('shared-room', 'alice', handlers);
    const second = joinConversation('shared-room', 'alice', handlers);
    await flush();
    expect(calls).toEqual(['conversation:shared-room']);
    const channel = channels.get('conversation:shared-room');
    expect(channel?.subscriptions).toBe(1);
    expect(first.isLive()).toBe(true);
    channel?.emitMessage('one');
    expect(onMessage).toHaveBeenCalledTimes(2);
    first.stop();
    expect(removeChannel).not.toHaveBeenCalled();
    channel?.emitMessage('two');
    expect(onMessage).toHaveBeenCalledTimes(3);
    second.stop();
    await flush();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });

  it('waits for an in-flight leave before reopening the same topic', async () => {
    let finishLeave: (() => void) | undefined;
    removeChannel.mockImplementationOnce(
      (channel: FakeChannel) =>
        new Promise<string>((resolve) => {
          finishLeave = () => {
            channels.delete(channel.topic);
            resolve('ok');
          };
        }),
    );
    const first = joinConversation('quick-room', 'alice', {});
    await flush();
    first.stop();
    const second = joinConversation('quick-room', 'alice', {});
    await flush();
    expect(calls).toHaveLength(1);
    expect(second.isLive()).toBe(false);
    expect(finishLeave).toBeDefined();
    finishLeave?.();
    await flush();
    expect(calls).toEqual(['conversation:quick-room', 'conversation:quick-room']);
    expect(second.isLive()).toBe(true);
    second.stop();
    await flush();
  });

  it('tears down a timed-out leave that the SDK has already removed', async () => {
    removeChannel.mockImplementationOnce((channel: FakeChannel) => {
      channels.delete(channel.topic);
      return Promise.resolve('timed out');
    });
    const first = joinConversation('timeout-room', 'alice', {});
    await flush();
    const old = channels.get('conversation:timeout-room');
    first.stop();
    const next = joinConversation('timeout-room', 'alice', {});
    await flush();
    expect(old?.teardowns).toBe(1);
    expect(calls).toEqual(['conversation:timeout-room', 'conversation:timeout-room']);
    expect(next.isLive()).toBe(true);
    next.stop();
    await flush();
  });

  it('retries an errored leave before reusing the canonical topic', async () => {
    removeChannel.mockResolvedValueOnce('error');
    const first = joinConversation('retry-room', 'alice', {});
    await flush();
    first.stop();
    const next = joinConversation('retry-room', 'alice', {});
    await flush();
    expect(removeChannel).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(['conversation:retry-room', 'conversation:retry-room']);
    expect(next.isLive()).toBe(true);
    next.stop();
    await flush();
  });

  it('quarantines a channel that repeatedly fails to leave without hurting other subscribers', async () => {
    removeChannel.mockRejectedValueOnce(new Error('disconnect')).mockResolvedValueOnce('error');
    const first = joinConversation('broken-room', 'alice', {});
    await flush();
    const stale = channels.get('conversation:broken-room');
    first.stop();
    const statuses = vi.fn();
    const onMessage = vi.fn();
    const next = joinConversation('broken-room', 'alice', { onMessage, onStatus: statuses });
    const another = joinConversation('broken-room', 'alice', { onMessage });
    await flush();
    expect(stale?.teardowns).toBe(1);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatch(/^conversation:broken-room:recovery:/);
    expect(statuses).toHaveBeenLastCalledWith('reconnecting');
    expect(next.isLive()).toBe(false);
    const recovery = channels.get(calls[1] ?? '');
    recovery?.emitMessage('safe');
    expect(onMessage).toHaveBeenCalledTimes(2);
    next.stop();
    recovery?.emitMessage('still-safe');
    expect(onMessage).toHaveBeenCalledTimes(3);
    another.stop();
    await flush();
    // Once the SDK finally forgets the orphan, the canonical topic is usable again.
    channels.delete('conversation:broken-room');
    const restored = joinConversation('broken-room', 'alice', {});
    await flush();
    expect(calls.at(-1)).toBe('conversation:broken-room');
    expect(restored.isLive()).toBe(true);
    restored.stop();
    await flush();
  });

  it('quarantines a real SDK same-topic channel when both leaves fail', async () => {
    const client = createClient('https://realtime.example.invalid', 'public-test-key');
    const originalChannel = client.channel.bind(client);
    vi.spyOn(client, 'channel').mockImplementation((topic, options) => {
      const channel = originalChannel(topic, options);
      vi.spyOn(channel, 'subscribe').mockImplementation((callback) => {
        callback?.(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
        return channel;
      });
      vi.spyOn(channel, 'track').mockResolvedValue('ok');
      return channel;
    });
    vi.spyOn(client, 'removeChannel').mockResolvedValue('error');
    mocks.getSupabase.mockReturnValue(client);
    const unrelated = originalChannel('some-other-feature');
    const first = joinConversation('real-sdk-room', 'alice', {});
    await flush();
    const old = client
      .getChannels()
      .find((channel) => channel.topic === 'realtime:conversation:real-sdk-room');
    expect(old).toBeDefined();
    first.stop();
    const next = joinConversation('real-sdk-room', 'alice', {});
    await flush();
    const current = client
      .getChannels()
      .find((channel) => channel.topic.startsWith('realtime:conversation:real-sdk-room:recovery:'));
    expect(current).toBeDefined();
    expect(current).not.toBe(old);
    expect(old?.state).toBe('closed');
    expect(client.getChannels()).toContain(unrelated);
    expect(next.isLive()).toBe(false);
    next.stop();
    await flush();
  });

  it('uses the old primary key for membership deletes and invalidates on incomplete payloads', async () => {
    const onMembers = vi.fn();
    const thread = joinConversation('members-room', 'alice', { onMembers });
    await flush();
    const channel = channels.get('conversation:members-room');
    channel?.emitMember('DELETE', {}, { uid: 'alice', conversation_id: 'members-room' });
    expect(onMembers).toHaveBeenLastCalledWith({ uid: 'alice', conversation_id: 'members-room' });
    channel?.emitMember('UPDATE', {}, {});
    expect(onMembers).toHaveBeenLastCalledWith(null);
    thread.stop();
    await flush();
  });

  it('does not join with a stale token and retries failed authentication', async () => {
    vi.useFakeTimers();
    mocks.ensureRealtimeAuth
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const onStatus = vi.fn();
    const thread = joinConversation('auth-retry-room', 'alice', { onStatus });
    await flush();
    const channel = channels.get('conversation:auth-retry-room');
    expect(mocks.ensureRealtimeAuth).toHaveBeenCalledWith('alice');
    expect(channel?.subscriptions).toBe(0);
    expect(onStatus).toHaveBeenLastCalledWith('offline');
    await vi.advanceTimersByTimeAsync(12_000);
    expect(channel?.subscriptions).toBe(1);
    expect(onStatus).toHaveBeenLastCalledWith('live');
    thread.stop();
    await flush();
    vi.useRealTimers();
  });

  it('keeps the inbox offline until authentication succeeds, then retries', async () => {
    vi.useFakeTimers();
    mocks.ensureRealtimeAuth
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const onStatus = vi.fn();
    const stop = joinInbox('bob', { onStatus });
    await flush();
    const channel = [...channels.values()][0];
    expect(mocks.ensureRealtimeAuth).toHaveBeenCalledWith('bob');
    expect(channel?.subscriptions).toBe(0);
    expect(onStatus).toHaveBeenLastCalledWith('offline');
    await vi.advanceTimersByTimeAsync(12_000);
    expect(channel?.subscriptions).toBe(1);
    expect(onStatus).toHaveBeenLastCalledWith('live');
    stop();
    await flush();
  });

  it('cancels a scheduled inbox authentication retry when stopped', async () => {
    vi.useFakeTimers();
    mocks.ensureRealtimeAuth.mockRejectedValue(new Error('offline'));
    const stop = joinInbox('bob', {});
    await flush();
    expect(mocks.ensureRealtimeAuth).toHaveBeenCalledTimes(1);
    stop();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(mocks.ensureRealtimeAuth).toHaveBeenCalledTimes(1);
  });

  it('never subscribes a stopped channel after delayed authentication', async () => {
    let finishAuth: (() => void) | undefined;
    mocks.ensureRealtimeAuth.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishAuth = resolve;
      }),
    );
    const first = joinConversation('auth-room', 'alice', {});
    await flush();
    const channel = channels.get('conversation:auth-room');
    expect(channel?.subscriptions).toBe(0);
    first.stop();
    finishAuth?.();
    await flush();
    expect(channel?.subscriptions).toBe(0);
  });

  it('suppresses previous-account events during an asynchronous leave', async () => {
    let finishLeave: (() => void) | undefined;
    removeChannel.mockImplementationOnce(
      (channel: FakeChannel) =>
        new Promise<string>((resolve) => {
          finishLeave = () => {
            channels.delete(channel.topic);
            resolve('ok');
          };
        }),
    );
    const oldListener = vi.fn();
    const old = joinConversation('switch-race', 'alice', { onMessage: oldListener });
    await flush();
    const channel = channels.get('conversation:switch-race');
    const newListener = vi.fn();
    const next = joinConversation('switch-race', 'bob', { onMessage: newListener });
    channel?.emitMessage('late-old');
    expect(oldListener).not.toHaveBeenCalled();
    expect(newListener).not.toHaveBeenCalled();
    finishLeave?.();
    await flush();
    channels.get('conversation:switch-race')?.emitMessage('new');
    expect(newListener).toHaveBeenCalledOnce();
    old.stop();
    next.stop();
    await flush();
  });

  it('closes the previous account channel before joining as another account', async () => {
    const oldListener = vi.fn();
    const old = joinConversation('account-room', 'alice', { onMessage: oldListener });
    await flush();
    const currentListener = vi.fn();
    const current = joinConversation('account-room', 'bob', { onMessage: currentListener });
    await flush();
    expect(removeChannel).toHaveBeenCalledTimes(1);
    expect(old.isLive()).toBe(false);
    channels.get('conversation:account-room')?.emitMessage('new');
    expect(oldListener).not.toHaveBeenCalled();
    expect(currentListener).toHaveBeenCalledOnce();
    // An old cleanup must not remove the replacement channel.
    old.stop();
    expect(current.isLive()).toBe(true);
    current.stop();
    await flush();
  });
});
