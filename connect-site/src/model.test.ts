import { describe, expect, it } from 'vitest';
import {
  channelPath,
  checkDraft,
  groupMessages,
  messageTime,
  presencePath,
  toMessage,
  unreadCount,
  type ChatMessage,
} from '@kit';
import { channelLabel, lastActivity, type ChannelRow } from './model';

const message = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  channelId: 'c1',
  authorUid: 'u1',
  authorName: 'Ayesha',
  body: 'Deploying now.',
  sentAt: Date.parse('2026-03-01T10:00:00Z'),
  ...over,
});

const channel = (over: Partial<ChannelRow> = {}): ChannelRow => ({
  id: 'c1',
  slug: 'ops',
  name: 'Operations',
  topic: 'Deployments and incidents',
  is_private: false,
  member_count: 6,
  ...over,
});

describe('realtime paths', () => {
  it('keeps every corporate channel under one namespace', () => {
    expect(channelPath('c1')).toBe('corporate/channels/c1/messages');
    expect(presencePath('c1', 'u1')).toBe('corporate/channels/c1/presence/u1');
  });
});

describe('reading stored messages', () => {
  it('fills in what a schemaless store may have lost', () => {
    const parsed = toMessage('c1', 'm1', { body: 'hello' });
    expect(parsed).toEqual({
      id: 'm1',
      channelId: 'c1',
      authorUid: 'unknown',
      authorName: 'Unknown',
      body: 'hello',
      sentAt: 0,
    });
  });

  it('drops anything without a body rather than showing an empty bubble', () => {
    expect(toMessage('c1', 'm1', { body: '' })).toBeNull();
    expect(toMessage('c1', 'm1', null)).toBeNull();
    expect(toMessage('c1', 'm1', 'text')).toBeNull();
  });
});

describe('grouping a transcript', () => {
  const base = Date.parse('2026-03-01T10:00:00Z');

  it('joins consecutive messages from one person within five minutes', () => {
    const groups = groupMessages([
      message({ id: 'a', sentAt: base }),
      message({ id: 'b', sentAt: base + 60000 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.messages).toHaveLength(2);
  });

  it('starts a new group after a longer pause', () => {
    const groups = groupMessages([
      message({ id: 'a', sentAt: base }),
      message({ id: 'b', sentAt: base + 6 * 60000 }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('starts a new group when somebody else speaks', () => {
    const groups = groupMessages([
      message({ id: 'a', sentAt: base }),
      message({ id: 'b', authorUid: 'u2', authorName: 'Rafi', sentAt: base + 1000 }),
    ]);
    expect(groups.map((group) => group.authorName)).toEqual(['Ayesha', 'Rafi']);
  });

  it('orders by time even when the store delivers out of order', () => {
    const groups = groupMessages([
      message({ id: 'late', sentAt: base + 10 * 60000 }),
      message({ id: 'early', sentAt: base }),
    ]);
    expect(groups[0]?.messages[0]?.id).toBe('early');
  });
});

describe('unread counting', () => {
  const base = Date.parse('2026-03-01T10:00:00Z');

  it('counts everything when the channel has never been read', () => {
    expect(unreadCount([message(), message({ id: 'b' })], null)).toBe(2);
  });

  it('counts only what arrived after the marker', () => {
    const messages = [message({ sentAt: base }), message({ id: 'b', sentAt: base + 1000 })];
    expect(unreadCount(messages, base)).toBe(1);
    expect(unreadCount(messages, base + 2000)).toBe(0);
  });
});

describe('drafts', () => {
  it('refuses an empty draft and trims a padded one', () => {
    expect(checkDraft('   ')).toEqual({ ok: false, reason: 'Write something first.' });
    expect(checkDraft('  hello \n')).toEqual({ ok: true, body: 'hello' });
  });

  it('refuses a draft longer than the limit', () => {
    const result = checkDraft('x'.repeat(2001));
    expect(result.ok).toBe(false);
  });
});

describe('channel presentation', () => {
  it('marks a private channel on its own button', () => {
    expect(channelLabel(channel())).toBe('Operations');
    expect(channelLabel(channel({ is_private: true }))).toBe('Operations (private)');
  });

  it('describes recency in the unit that reads best', () => {
    const now = Date.parse('2026-03-01T12:00:00Z');
    expect(lastActivity([], now)).toBe('nothing yet');
    expect(lastActivity([message({ sentAt: now - 30000 })], now)).toBe('just now');
    expect(lastActivity([message({ sentAt: now - 5 * 60000 })], now)).toBe('5 minutes ago');
    expect(lastActivity([message({ sentAt: now - 3 * 3600000 })], now)).toBe('3 hours ago');
    expect(lastActivity([message({ sentAt: now - 48 * 3600000 })], now)).toContain('at ');
  });

  it('formats a clock time in twenty-four hours', () => {
    expect(messageTime(Date.parse('2026-03-01T14:05:00Z'), 'en-GB')).toMatch(/^\d{2}:\d{2}$/);
  });
});
