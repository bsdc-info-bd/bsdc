import { describe, expect, it } from 'vitest';

import {
  SUMMARY_LIMIT,
  notificationBody,
  notificationTag,
  notificationTitle,
  parsePushContent,
  summarize,
  toBanglaDigits,
  type PushContent,
} from './copy';

function content(partial: Partial<PushContent>): PushContent {
  return {
    id: 'n1',
    kind: 'reaction',
    body: 'Rahim reacted to your post',
    url: '/p/a-river-level',
    actorName: 'Rahim Second',
    actorAvatar: '',
    language: 'bn',
    createdAt: '2026-10-09T04:00:00.000Z',
    ...partial,
  };
}

describe('reading what the endpoint sent', () => {
  it('maps the row the database returns', () => {
    const parsed = parsePushContent([
      {
        id: 'abc',
        kind: 'follow',
        body: '',
        url: '/@rahimsecond',
        actor_name: 'Rahim Second',
        actor_avatar: 'https://cdn/x.png',
        language: 'en',
        created_at: '2026-10-09T04:00:00.000Z',
      },
    ]);
    expect(parsed).toEqual([
      {
        id: 'abc',
        kind: 'follow',
        body: '',
        url: '/@rahimsecond',
        actorName: 'Rahim Second',
        actorAvatar: 'https://cdn/x.png',
        language: 'en',
        createdAt: '2026-10-09T04:00:00.000Z',
      },
    ]);
  });

  it('is not fooled by an answer that is not a list', () => {
    expect(parsePushContent(null)).toEqual([]);
    expect(parsePushContent({ id: 'abc' })).toEqual([]);
    expect(parsePushContent('nope')).toEqual([]);
  });

  it('drops a row it cannot show, and keeps the ones it can', () => {
    const parsed = parsePushContent([
      { id: '', kind: 'follow' },
      { id: 'ok', kind: 'follow' },
      null,
      7,
    ]);
    expect(parsed.map((row) => row.id)).toEqual(['ok']);
  });

  it('falls back to Bangla and to a kind it can name', () => {
    const [row] = parsePushContent([{ id: 'x', kind: 'invented_kind', language: 'fr' }]);
    expect(row?.language).toBe('bn');
    expect(row?.kind).toBe('moderation');
    // A link that is not a path on this site would take the member somewhere
    // else from a notification, so it becomes the inbox.
    expect(row?.url).toBe('/notifications');
  });
});

describe('the words', () => {
  it('names the kind in the language the device asked for', () => {
    expect(notificationTitle(content({ kind: 'message', language: 'bn' }))).toBe('নতুন বার্তা');
    expect(notificationTitle(content({ kind: 'message', language: 'en' }))).toBe('New message');
    expect(notificationTitle(content({ kind: 'follow', language: 'en' }))).toBe('New follower');
  });

  it('says what happened, and who did it when nothing else is known', () => {
    expect(notificationBody(content({ body: 'Ada commented on your post' }))).toBe(
      'Ada commented on your post',
    );
    expect(notificationBody(content({ body: '   ', actorName: 'Rahim Second' }))).toBe(
      'Rahim Second',
    );
    expect(notificationBody(content({ body: '', actorName: '', language: 'en' }))).toBe(
      'Something new on BSDC.',
    );
    expect(notificationBody(content({ body: '', actorName: '' }))).toBe('বিএসডিসিতে নতুন কিছু।');
  });

  it('tags each one so an update replaces it instead of stacking', () => {
    expect(notificationTag(content({ id: 'abc' }))).toBe('bsdc-abc');
    expect(notificationTag(content({ id: 'def' }))).not.toBe(
      notificationTag(content({ id: 'abc' })),
    );
  });
});

describe('a device that has been asleep', () => {
  const many = Array.from({ length: SUMMARY_LIMIT + 2 }, (_, index) =>
    content({ id: `n${index}`, actorName: `Person ${index}` }),
  );

  it('does not summarise what fits on a screen', () => {
    expect(summarize([])).toBeNull();
    expect(summarize(many.slice(0, SUMMARY_LIMIT))).toBeNull();
  });

  it('says how many are waiting instead of showing them all', () => {
    const summary = summarize(many);
    expect(summary).not.toBeNull();
    expect(summary?.url).toBe('/notifications');
    expect(summary?.title).toContain(toBanglaDigits(many.length));
    expect(summary?.body).toContain('Person 0');
    expect(summarize(many.map((item) => ({ ...item, language: 'en' as const })))?.title).toBe(
      `${many.length} new notifications`,
    );
  });

  it('writes a count in Bangla numerals for a Bangla notification', () => {
    expect(toBanglaDigits(0)).toBe('০');
    expect(toBanglaDigits(42)).toBe('৪২');
    expect(toBanglaDigits(-3)).toBe('০');
  });
});
