import { describe, expect, it } from 'vitest';
import {
  blankMessage,
  matchesFilter,
  sameMessage,
  sortConversations,
  upsertMessage,
  type ConversationSummary,
  type Message,
} from './message-types';

const BASE = Date.parse('2026-10-08T12:00:00.000Z');
const at = (minutes: number) => new Date(BASE + minutes * 60_000).toISOString();

function message(id: string, minutes: number, overrides: Partial<Message> = {}): Message {
  return {
    ...blankMessage({ id, conversation_id: 'c1', created_at: at(minutes) }),
    senderUid: 'alice',
    body: `line ${id}`,
    ...overrides,
  };
}

function summary(id: string, overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id,
    kind: 'direct',
    title: '',
    avatarUrl: '',
    lastMessageAt: at(0),
    preview: 'hello',
    unread: 0,
    muted: false,
    other: null,
    ...overrides,
  };
}

describe('upsertMessage', () => {
  it('inserts a live line in time order, whatever order it arrives in', () => {
    const list = [message('a', 0), message('c', 20)];
    const withLate = upsertMessage(list, message('b', 10));
    expect(withLate.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns the same array when nothing changed', () => {
    const list = [message('a', 0)];
    expect(upsertMessage(list, message('a', 0))).toBe(list);
  });

  it('replaces an edited line in place, keeping its position', () => {
    const list = [message('a', 0), message('b', 10)];
    const edited = upsertMessage(list, message('a', 0, { body: 'changed', editedAt: at(30) }));
    expect(edited.map((item) => item.id)).toEqual(['a', 'b']);
    expect(edited[0]?.body).toBe('changed');
    expect(edited[0]?.editedAt).toBe(at(30));
  });

  it('sees a reaction as a change and an identical line as none', () => {
    const original = message('a', 0);
    const reacted = {
      ...original,
      reactions: { support: 2 },
      myReactions: ['support'],
    };
    expect(sameMessage(original, reacted)).toBe(false);
    expect(sameMessage(original, { ...original })).toBe(true);
  });

  it('carries the pending state of a line the server has not confirmed', () => {
    const sending = message('pending:1', 5, { clientState: 'pending' });
    const list = upsertMessage([], sending);
    expect(list[0]?.clientState).toBe('pending');
  });
});

describe('sortConversations', () => {
  it('puts pinned conversations first, then by recency', () => {
    const pinned = new Set(['c2']);
    const sorted = sortConversations(
      [
        summary('c1', { lastMessageAt: at(10) }),
        summary('c2', { lastMessageAt: at(-30) }),
        summary('c3', { lastMessageAt: at(20) }),
      ],
      pinned,
    );
    expect(sorted.map((item) => item.id)).toEqual(['c2', 'c3', 'c1']);
  });

  it('keeps a conversation with no messages at all at the bottom', () => {
    const sorted = sortConversations([
      summary('c1', { lastMessageAt: null }),
      summary('c2', { lastMessageAt: at(0) }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['c2', 'c1']);
  });
});

describe('matchesFilter', () => {
  it('filters on unread, kind and the search text', () => {
    expect(matchesFilter(summary('c1', { unread: 2 }), 'unread')).toBe(true);
    expect(matchesFilter(summary('c1'), 'unread')).toBe(false);
    expect(matchesFilter(summary('c1', { kind: 'group' }), 'groups')).toBe(true);
    expect(matchesFilter(summary('c1', { kind: 'group' }), 'direct')).toBe(false);
    expect(matchesFilter(summary('c1', { preview: 'about SonarQube' }), 'all', 'sonar')).toBe(true);
    expect(matchesFilter(summary('c1', { preview: 'about SonarQube' }), 'all', 'docker')).toBe(
      false,
    );
  });

  it('matches a direct conversation on the other member’s name or username', () => {
    const withOther = summary('c1', {
      other: { uid: 'u2', username: 'rahim', displayName: 'Rahim Uddin', avatarUrl: '' },
    });
    expect(matchesFilter(withOther, 'all', 'rahim')).toBe(true);
    expect(matchesFilter(withOther, 'all', 'rahim uddin')).toBe(true);
  });
});

describe('blankMessage', () => {
  it('is a usable row with nothing in it', () => {
    const blank = blankMessage({ id: 'x', conversation_id: 'c9', created_at: at(0) });
    expect(blank).toMatchObject({
      id: 'x',
      conversationId: 'c9',
      body: '',
      reactions: {},
      myReactions: [],
      readBy: [],
      starred: false,
      pinned: false,
      deletedAt: null,
    });
  });
});
