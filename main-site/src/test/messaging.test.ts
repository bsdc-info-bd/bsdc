import { describe, expect, it } from 'vitest';
import {
  activeTypers,
  conversationName,
  groupMessages,
  readCount,
  type ConversationMember,
  type ConversationSummary,
  type Message,
} from '@/lib/messaging/message-types';

const BASE = Date.parse('2026-10-01T12:00:00.000Z');

function at(offsetMinutes: number): string {
  return new Date(BASE + offsetMinutes * 60_000).toISOString();
}

function message(overrides: Partial<Message> & Pick<Message, 'id'>): Message {
  return {
    conversationId: 'c1',
    senderUid: 'alice',
    kind: 'text',
    body: 'hello',
    mediaUrl: '',
    mediaName: '',
    codeLanguage: '',
    replyTo: null,
    editedAt: null,
    deletedAt: null,
    createdAt: at(0),
    author: null,
    replyBody: null,
    replySender: null,
    reactions: {},
    myReactions: [],
    readBy: [],
    starred: false,
    pinned: false,
    ...overrides,
  };
}

function member(uid: string, lastReadAt: string): ConversationMember {
  return { uid, role: 'member', lastReadAt, leftAt: null, profile: null };
}

describe('groupMessages', () => {
  it('groups consecutive messages from one sender', () => {
    const groups = groupMessages([
      message({ id: 'a', createdAt: at(0) }),
      message({ id: 'b', createdAt: at(1) }),
      message({ id: 'c', createdAt: at(2) }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.messages).toHaveLength(3);
  });

  it('starts a new group when the sender changes', () => {
    const groups = groupMessages([
      message({ id: 'a' }),
      message({ id: 'b', senderUid: 'bob', createdAt: at(1) }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[1]?.senderUid).toBe('bob');
  });

  it('starts a new group after a five minute gap', () => {
    const groups = groupMessages([
      message({ id: 'a', createdAt: at(0) }),
      message({ id: 'b', createdAt: at(10) }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('keeps a deleted message in place', () => {
    const groups = groupMessages([
      message({ id: 'a' }),
      message({ id: 'b', createdAt: at(1), deletedAt: at(2) }),
    ]);
    expect(groups[0]?.messages.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('returns nothing for an empty thread', () => {
    expect(groupMessages([])).toEqual([]);
  });
});

describe('readCount', () => {
  const sent = message({ id: 'm', createdAt: at(0) });

  it('counts members whose read marker is at or past the message', () => {
    const members = [member('alice', at(5)), member('bob', at(5)), member('carol', at(-5))];
    expect(readCount(sent, members, 'alice')).toBe(1);
  });

  it('never counts the sender or the viewer', () => {
    const members = [member('alice', at(5)), member('viewer', at(5))];
    expect(readCount(sent, members, 'viewer')).toBe(0);
  });
});

describe('conversationName', () => {
  function summary(overrides: Partial<ConversationSummary>): ConversationSummary {
    return {
      id: 'c1',
      kind: 'direct',
      title: '',
      avatarUrl: '',
      lastMessageAt: null,
      preview: '',
      unread: 0,
      muted: false,
      other: null,
      ...overrides,
    };
  }

  it('uses the other participant for a direct chat', () => {
    const name = conversationName(
      summary({
        other: { uid: 'bob', username: 'bob', displayName: 'Bob Rahman', avatarUrl: '' },
      }),
      'fallback',
    );
    expect(name).toBe('Bob Rahman');
  });

  it('uses the group title, falling back when it is empty', () => {
    expect(conversationName(summary({ kind: 'group', title: 'Team' }), 'fallback')).toBe('Team');
    expect(conversationName(summary({ kind: 'group' }), 'fallback')).toBe('fallback');
  });
});

describe('activeTypers', () => {
  it('ignores the viewer and stale signals', () => {
    const now = BASE;
    const typers = activeTypers(
      { viewer: now, bob: now - 1_000, carol: now - 60_000 },
      'viewer',
      now,
    );
    expect(typers).toEqual(['bob']);
  });

  it('is stable in order', () => {
    const now = BASE;
    expect(activeTypers({ zed: now, amy: now }, 'viewer', now)).toEqual(['amy', 'zed']);
  });
});
