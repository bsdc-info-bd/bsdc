import { describe, expect, it } from 'vitest';
import {
  cleanName,
  cleanPreview,
  safePath,
  summarise,
  toBanglaDigits,
  wordsFor,
  type NotificationSource,
} from './notifications';

function source(overrides: Partial<NotificationSource> = {}): NotificationSource {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    kind: 'comment',
    actorName: 'Rafiq Hasan',
    preview: 'This is a very good explanation of indexing.',
    url: '/p/hello',
    language: 'en',
    ...overrides,
  };
}

describe('the words a notification is made of', () => {
  it('names the person and what they did, in English', () => {
    const words = wordsFor(source());
    expect(words.title).toContain('New comment');
    expect(words.body).toContain('Rafiq Hasan');
    expect(words.body).toContain('indexing');
    expect(words.url).toBe('/p/hello');
  });

  it('names the person and what they did, in Bangla', () => {
    const words = wordsFor(source({ language: 'bn', preview: 'খুব ভালো লেখা।' }));
    expect(words.title).toContain('নতুন মন্তব্য');
    expect(words.body).toContain('Rafiq Hasan');
    expect(words.body).toContain('খুব ভালো লেখা।');
  });

  it('says "someone" rather than showing an empty title when the actor is gone', () => {
    expect(wordsFor(source({ actorName: '' })).body).toContain('Someone');
    expect(wordsFor(source({ actorName: '', language: 'bn' })).body).toContain('কেউ একজন');
  });

  it('gives a message the words of the message itself', () => {
    const words = wordsFor(source({ kind: 'message', preview: 'আপনি কি আজ আসছেন?' }));
    expect(words.body).toBe('আপনি কি আজ আসছেন?');
    expect(words.url).toBe('/p/hello');
  });

  it('collapses per conversation, so ten messages are one row', () => {
    const words = wordsFor(source({ kind: 'message', conversationId: 'conv-1' }));
    expect(words.topic).toBe('c-conv-1');
    const other = wordsFor(source({ kind: 'message', conversationId: 'conv-1', id: 'other-id' }));
    expect(other.topic).toBe(words.topic);
  });

  it('gives an order and a payout a body of their own', () => {
    expect(
      wordsFor(source({ kind: 'order', body: '', preview: '' } as Partial<NotificationSource>))
        .body,
    ).toBe('You have a new order');
    expect(wordsFor(source({ kind: 'payout', preview: '', language: 'bn' })).body).toBe(
      'একটি পেমেন্ট প্রক্রিয়া করা হয়েছে',
    );
  });

  it('carries a designed title for every kind in both languages', () => {
    const kinds: NotificationSource['kind'][] = [
      'follow',
      'reaction',
      'comment',
      'reply',
      'mention',
      'bookmark',
      'share',
      'post_published',
      'moderation',
      'message',
      'order',
      'review',
      'payout',
      'course',
      'job',
      'event',
      'certificate',
      'mention_group',
      'group_invite',
      'feedback',
    ];
    for (const kind of kinds) {
      for (const language of ['bn', 'en'] as const) {
        const words = wordsFor(source({ kind, language }));
        expect(words.title.length).toBeGreaterThan(5);
        expect(words.body.length).toBeGreaterThan(0);
        expect(words.title).not.toContain('undefined');
        expect(words.body).not.toContain('undefined');
      }
    }
  });
});

describe('what a notification may contain', () => {
  it('strips control characters from a display name, which would break a title', () => {
    expect(cleanName('Rafiq\nHasan\u0000', 'Someone')).toBe('Rafiq Hasan');
    expect(cleanName('   ', 'Someone')).toBe('Someone');
    expect(cleanName('x'.repeat(200), 'Someone').length).toBeLessThanOrEqual(60);
  });

  it('cuts a preview on a word boundary', () => {
    const long = 'word '.repeat(60);
    const preview = cleanPreview(long, 40);
    expect(preview.endsWith('…')).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(42);
  });

  it('refuses to send a browser to another origin', () => {
    expect(safePath('https://evil.test/steal')).toBe('/notifications');
    expect(safePath('//evil.test/steal')).toBe('/notifications');
    expect(safePath('/messages/1')).toBe('/messages/1');
    expect(safePath('javascript:alert(1)')).toBe('/notifications');
  });
});

describe('several things at once', () => {
  it('summarises a device that slept all day into one sentence', () => {
    const items = [
      source({ actorName: 'Rafiq' }),
      source({ actorName: 'Nusrat' }),
      source({ actorName: 'Tanvir' }),
    ];
    const summary = summarise(items, 'en');
    expect(summary?.title).toContain('3 new notifications');
    expect(summary?.body).toContain('Rafiq');
    expect(summary?.body).toContain('2 others');
    expect(summary?.topic).toBe('bsdc-summary');
  });

  it('counts in Bangla digits when the device asked for Bangla', () => {
    const items = [source({ language: 'bn' }), source({ language: 'bn' })];
    expect(summarise(items, 'bn')?.title).toContain('২');
  });

  it('returns the one notification unchanged when there is only one', () => {
    const only = source();
    expect(summarise([only], 'en')?.body).toBe(wordsFor(only).body);
  });

  it('preserves conversation metadata when summarising multiple messages in the same thread', () => {
    const msgs = [
      source({
        id: 'm1',
        kind: 'message',
        actorName: 'Rafiq',
        preview: 'First line',
        url: '/messages/conv-42',
        conversationId: 'conv-42',
      }),
      source({
        id: 'm2',
        kind: 'message',
        actorName: 'Rafiq',
        preview: 'Latest reply here',
        url: '/messages/conv-42',
        conversationId: 'conv-42',
      }),
    ];
    const summary = summarise(msgs, 'en');
    expect(summary?.topic).toBe('c-conv-42');
    expect(summary?.url).toBe('/messages/conv-42');
    expect(summary?.kind).toBe('message');
    expect(summary?.conversationId).toBe('conv-42');
    expect(summary?.body).toBe('Latest reply here');
  });

  it('has nothing to say about nothing', () => {
    expect(summarise([], 'en')).toBeNull();
  });

  it('writes Bangla numerals for a Bangla reader', () => {
    expect(toBanglaDigits(123)).toBe('১২৩');
  });
});
