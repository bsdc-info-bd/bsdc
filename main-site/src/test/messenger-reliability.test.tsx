import type { User } from 'firebase/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useConversation,
  useConversationSettings,
  useUnreadMessageCount,
} from '@/hooks/use-messaging';
import { blankMessage, type Message } from '@/lib/messaging/message-types';
import { readOutbox, writeOutbox } from '@/lib/messaging/outbox';
import { DEFAULT_CLAIMS, useAuthStore } from '@/store/auth-store';
import type {
  ConversationChannelHandlers,
  InboxChannelHandlers,
} from '@/lib/messaging/messenger-channel';
import type { MessageRow } from '@/lib/supabase/types';

const mocks = vi.hoisted(() => ({
  fetchConversationMessages: vi.fn(),
  fetchMembers: vi.fn(),
  fetchConversationState: vi.fn(),
  fetchPinnedMessages: vi.fn(),
  sendMessage: vi.fn(),
  updateConversationSettings: vi.fn(),
  markMessageRead: vi.fn(),
  fetchInbox: vi.fn(),
  fetchMyConversationSettings: vi.fn(),
  fetchUnreadMessageCount: vi.fn(),
  joinConversation: vi.fn(),
  joinInbox: vi.fn(),
  threadHandlers: null as ConversationChannelHandlers | null,
  inboxHandlers: [] as InboxChannelHandlers[],
}));
vi.mock('@/lib/messaging/message-repository', () => mocks);
vi.mock('@/lib/messaging/messenger-channel', () => ({
  joinConversation: mocks.joinConversation,
  joinInbox: mocks.joinInbox,
}));

const state = { muted: false, isPinned: false, isArchived: false, draftBody: '', lastReadAt: '' };
const message = (id: string, body = id, overrides: Partial<Message> = {}): Message => ({
  ...blankMessage({ id, conversation_id: 'room', created_at: '2026-01-01T00:00:00.000Z' }),
  senderUid: 'alice',
  body,
  ...overrides,
});
function signIn(uid: string) {
  useAuthStore.getState().setSession({ uid } as User, DEFAULT_CLAIMS);
}
function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}
beforeEach(async () => {
  await import('@/lib/messaging/message-repository');
  await import('@/lib/messaging/messenger-channel');
  sessionStorage.clear();
  useAuthStore.getState().reset();
  signIn('alice');
  vi.resetAllMocks();
  mocks.threadHandlers = null;
  mocks.inboxHandlers = [];
  mocks.fetchConversationMessages.mockResolvedValue([]);
  mocks.fetchMembers.mockResolvedValue([]);
  mocks.fetchConversationState.mockResolvedValue(state);
  mocks.fetchPinnedMessages.mockResolvedValue([]);
  mocks.updateConversationSettings.mockResolvedValue(undefined);
  mocks.markMessageRead.mockResolvedValue(undefined);
  mocks.fetchInbox.mockResolvedValue([]);
  mocks.fetchMyConversationSettings.mockResolvedValue(new Map());
  mocks.fetchUnreadMessageCount.mockResolvedValue(0);
  mocks.joinConversation.mockImplementation(
    (_id: string, _uid: string, handlers: ConversationChannelHandlers) => {
      mocks.threadHandlers = handlers;
      handlers.onStatus?.('live');
      return { stop: vi.fn(), isLive: () => true, signalTyping: vi.fn() };
    },
  );
  mocks.joinInbox.mockImplementation((_uid: string, handlers: InboxChannelHandlers) => {
    mocks.inboxHandlers.push(handlers);
    handlers.onStatus?.('live');
    return vi.fn();
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('messenger delivery', () => {
  it('retains one failed line and retries with the same request key', async () => {
    const confirmed = message('server-id', 'hello');
    mocks.sendMessage
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(confirmed);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useConversation('room'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await expect(result.current.send('hello')).rejects.toThrow();
    });
    await waitFor(() =>
      expect(result.current.messages.some((entry) => entry.clientState === 'failed')).toBe(true),
    );
    const failed = result.current.messages.find((entry) => entry.clientState === 'failed');
    expect(failed?.body).toBe('hello');
    expect(failed?.clientId).toBeTruthy();
    expect(readOutbox('alice', 'room')[0]?.clientId).toBe(failed?.clientId);
    mocks.fetchConversationMessages.mockResolvedValue([confirmed]);
    await act(async () => {
      await result.current.retry(failed!);
    });
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
    const first = mocks.sendMessage.mock.calls[0]?.[0] as { clientId: string };
    const second = mocks.sendMessage.mock.calls[1]?.[0] as { clientId: string };
    expect(first.clientId).toBe(second.clientId);
    await waitFor(() =>
      expect(result.current.messages.map((entry) => entry.id)).toEqual(['server-id']),
    );
    expect(readOutbox('alice', 'room')).toEqual([]);
  });

  it('preserves an attachment and its request key through a failed send', async () => {
    mocks.sendMessage.mockRejectedValueOnce(new Error('network'));
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useConversation('room'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await expect(
        result.current.send('', {
          kind: 'image',
          mediaUrl: 'https://example.test/image.png',
          mediaName: 'image.png',
        }),
      ).rejects.toThrow();
    });
    await waitFor(() => expect(result.current.messages[0]?.clientState).toBe('failed'));
    expect(result.current.messages[0]).toMatchObject({
      clientState: 'failed',
      mediaUrl: 'https://example.test/image.png',
      mediaName: 'image.png',
    });
    act(() => result.current.discard(result.current.messages[0]!));
    await waitFor(() => expect(result.current.messages).toHaveLength(0));
    expect(readOutbox('alice', 'room')).toHaveLength(0);
  });

  it('does not overwrite refreshed reactions or receipts with a stale sent copy', async () => {
    const sent = message('server-id', 'hello');
    const enriched = { ...sent, reactions: { '❤️': 2 }, myReactions: ['❤️'], readBy: ['bob'] };
    mocks.sendMessage.mockResolvedValue(sent);
    const { client, Wrapper } = makeWrapper();
    const { result } = renderHook(() => useConversation('room'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mocks.fetchConversationMessages.mockResolvedValue([enriched]);
    await act(async () => {
      await result.current.send('hello');
    });
    await waitFor(() => expect(result.current.messages[0]?.reactions).toEqual({ '❤️': 2 }));
    expect(result.current.messages[0]?.readBy).toEqual(['bob']);
    expect(client.getQueryData(['message-outbox', 'alice', 'room'])).toEqual([]);
  });

  it('isolates cached conversations and drafts when an account changes', async () => {
    mocks.fetchConversationMessages.mockImplementation(() =>
      Promise.resolve([message(useAuthStore.getState().user?.uid ?? '')]),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useConversation('room'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.messages[0]?.id).toBe('alice'));
    act(() => signIn('bob'));
    expect(result.current.messages.some((entry) => entry.id === 'alice')).toBe(false);
    await waitFor(() => expect(result.current.messages[0]?.id).toBe('bob'));
  });

  it('restores interrupted pending lines as failed and keeps them scoped to their account and room', () => {
    const pending = message('pending:key', 'offline words', {
      clientId: 'key',
      clientState: 'pending',
    });
    writeOutbox('alice', 'room', [pending]);
    expect(readOutbox('alice', 'room')[0]).toMatchObject({
      body: 'offline words',
      clientState: 'failed',
      clientId: 'key',
    });
    expect(readOutbox('bob', 'room')).toEqual([]);
    expect(readOutbox('alice', 'elsewhere')).toEqual([]);
  });

  it('updates the unread badge when a live inbox event arrives', async () => {
    mocks.fetchUnreadMessageCount.mockResolvedValueOnce(0).mockResolvedValueOnce(3);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useUnreadMessageCount(), { wrapper: Wrapper });
    await waitFor(() => expect(mocks.inboxHandlers).toHaveLength(1));
    act(() => mocks.inboxHandlers[0]?.onActivity?.());
    await waitFor(() => expect(result.current).toBe(3));
  });

  it('does not offer older pages when the first page is shorter than the page size', async () => {
    mocks.fetchConversationMessages.mockResolvedValue([message('one')]);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useConversation('room'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.hasOlder).toBe(false);
  });

  it('reconciles a lost HTTP response with the matching live committed row', async () => {
    let rejectDelivery: ((reason: Error) => void) | undefined;
    mocks.sendMessage.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectDelivery = reject;
        }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useConversation('live-reconcile'), { wrapper: Wrapper });
    await waitFor(() => expect(mocks.threadHandlers).not.toBeNull());
    let delivery: Promise<void> | undefined;
    act(() => {
      delivery = result.current.send('committed');
      void delivery.catch(() => undefined);
    });
    await waitFor(() =>
      expect(result.current.messages.some((entry) => entry.clientState === 'pending')).toBe(true),
    );
    const pending = result.current.messages.find((entry) => entry.clientState === 'pending');
    const row: MessageRow = {
      id: 'server-live',
      conversation_id: 'live-reconcile',
      sender_uid: 'alice',
      kind: 'text',
      body: 'committed',
      media_url: '',
      media_name: '',
      code_language: '',
      reply_to: null,
      edited_at: null,
      deleted_at: null,
      created_at: '2026-01-01T00:00:00Z',
      client_id: pending?.clientId ?? null,
    };
    act(() => mocks.threadHandlers?.onMessage?.(row, 'UPDATE'));
    await waitFor(() =>
      expect(result.current.messages.map((entry) => entry.id)).toEqual(['server-live']),
    );
    expect(readOutbox('alice', 'live-reconcile')).toEqual([]);
    await act(async () => {
      rejectDelivery?.(new TypeError('lost response'));
      await delivery?.catch(() => undefined);
    });
    expect(result.current.messages.map((entry) => entry.id)).toEqual(['server-live']);
  });

  it('reconciles a restored outbox entry with an already confirmed page row', async () => {
    const pending = message('pending:key', 'committed', {
      conversationId: 'restored-room',
      clientId: 'key',
      clientState: 'pending',
    });
    writeOutbox('alice', 'restored-room', [pending]);
    mocks.fetchConversationMessages.mockResolvedValue([
      message('server-copy', 'committed', { conversationId: 'restored-room', clientId: 'key' }),
    ]);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useConversation('restored-room'), { wrapper: Wrapper });
    await waitFor(() =>
      expect(result.current.messages.map((entry) => entry.id)).toEqual(['server-copy']),
    );
    expect(readOutbox('alice', 'restored-room')).toEqual([]);
  });

  it('rechecks membership when the viewer leaves or a member event lacks a usable row', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useConversation('membership-room'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.state).not.toBeNull());
    await waitFor(() => expect(mocks.threadHandlers).not.toBeNull());
    mocks.fetchConversationState.mockResolvedValue(null);
    act(() => mocks.threadHandlers?.onMembers?.(null));
    await waitFor(() => expect(result.current.state).toBeNull());
    expect(result.current.isError).toBe(true);
  });

  it('uses both timestamp and id to load older messages with tied timestamps', async () => {
    const first = Array.from({ length: 60 }, (_, i) =>
      message(`id-${String(i + 10).padStart(2, '0')}`),
    );
    mocks.fetchConversationMessages
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce([message('id-09')]);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useConversation('pagination-room'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(60));
    expect(result.current.hasOlder).toBe(true);
    await act(async () => result.current.loadOlder());
    expect(mocks.fetchConversationMessages).toHaveBeenLastCalledWith(
      'pagination-room',
      first[0]?.createdAt,
      60,
      first[0]?.id,
    );
    expect(result.current.messages.map((entry) => entry.id)).toEqual([
      'id-09',
      ...first.map((item) => item.id),
    ]);
    expect(result.current.hasOlder).toBe(false);
  });

  it('serializes draft writes and never replaces newer text with an older completion', async () => {
    const { client, Wrapper } = makeWrapper();
    const { result } = renderHook(() => useConversation('draft-order'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.state).not.toBeNull());
    let finishFirst: (() => void) | undefined;
    mocks.updateConversationSettings.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );
    vi.useFakeTimers();
    act(() => result.current.saveDraft('first draft'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(mocks.updateConversationSettings).toHaveBeenCalledTimes(1);
    act(() => result.current.saveDraft('newer draft'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(mocks.updateConversationSettings).toHaveBeenCalledTimes(1);
    act(() => {
      client.setQueryData(['conversation-state', 'alice', 'draft-order'], {
        ...state,
        draftBody: 'stale server value',
      });
    });
    expect(result.current.state?.draftBody).toBe('newer draft');
    await act(async () => {
      finishFirst?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.updateConversationSettings).toHaveBeenCalledTimes(2);
    expect(mocks.updateConversationSettings).toHaveBeenLastCalledWith('draft-order', 'alice', {
      draft_body: 'newer draft',
    });
    expect(result.current.state?.draftBody).toBe('newer draft');
  });

  it('retains a failed draft across navigation and allows a retry', async () => {
    const { client, Wrapper } = makeWrapper();
    mocks.updateConversationSettings.mockRejectedValueOnce(new TypeError('offline'));
    const first = renderHook(() => useConversation('failed-draft'), { wrapper: Wrapper });
    await waitFor(() => expect(first.result.current.state).not.toBeNull());
    vi.useFakeTimers();
    act(() => first.result.current.saveDraft('keep this text'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(first.result.current.draftSaveFailed).toBe(true);
    act(() => {
      client.setQueryData(['conversation-state', 'alice', 'failed-draft'], {
        ...state,
        draftBody: 'stale server value',
      });
    });
    first.unmount();
    const next = renderHook(() => useConversation('failed-draft'), { wrapper: Wrapper });
    expect(next.result.current.state?.draftBody).toBe('keep this text');
    expect(next.result.current.draftSaveFailed).toBe(true);
    act(() => next.result.current.retryDraft());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(next.result.current.draftSaveFailed).toBe(false);
    expect(next.result.current.state?.draftBody).toBe('keep this text');
    expect(mocks.updateConversationSettings).toHaveBeenLastCalledWith('failed-draft', 'alice', {
      draft_body: 'keep this text',
    });
  });

  it('optimistically updates bulk inbox settings without inventing membership or fetching every row', async () => {
    const { client, Wrapper } = makeWrapper();
    client.setQueryData(
      ['inbox-settings', 'alice'],
      new Map([['settings-room', { pinned: false, archived: false, muted: false }]]),
    );
    const { result } = renderHook(() => useConversationSettings('settings-room', false), {
      wrapper: Wrapper,
    });
    expect(mocks.fetchConversationState).not.toHaveBeenCalled();
    act(() => result.current.setPinned(true));
    await waitFor(() =>
      expect(
        client
          .getQueryData<Map<string, { pinned: boolean }>>(['inbox-settings', 'alice'])
          ?.get('settings-room')?.pinned,
      ).toBe(true),
    );
    expect(client.getQueryData(['conversation-state', 'alice', 'settings-room'])).toBeUndefined();
    await waitFor(() =>
      expect(mocks.updateConversationSettings).toHaveBeenCalledWith('settings-room', 'alice', {
        is_pinned: true,
      }),
    );
  });
});
