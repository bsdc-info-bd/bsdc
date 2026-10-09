/**
 * The words a pushed notification is made of.
 *
 * A push wakes a device with no payload: the wake-up is empty, because a payload
 * on the way to a push service has to be encrypted for that one subscription,
 * and a browser that has been closed for a day is better served by being told
 * what it missed, in order, in its own language, than by nine separate buzzes.
 * So the service worker asks `/api/push/content` for what is new and writes the
 * notification here.
 *
 * This module is pure and imports nothing, which is why it can be shared by the
 * worker bundle and by the tests.
 */

/** The values of `bsdc_notification_kind`, as text. */
export type PushKind =
  | 'follow'
  | 'reaction'
  | 'comment'
  | 'reply'
  | 'mention'
  | 'bookmark'
  | 'share'
  | 'post_published'
  | 'moderation'
  | 'message';

export interface PushContent {
  id: string;
  kind: PushKind;
  body: string;
  url: string;
  actorName: string;
  actorAvatar: string;
  language: 'bn' | 'en';
  createdAt: string;
}

/** What the edge returns for one waiting notification. */
interface ContentRow {
  id: string;
  kind: string;
  body: string;
  url: string;
  actor_name: string;
  actor_avatar: string;
  language: string;
  created_at: string;
}

const KINDS: readonly PushKind[] = [
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
];

function isKind(value: string): value is PushKind {
  return (KINDS as readonly string[]).includes(value);
}

/**
 * Reads what the endpoint sent. A row that is missing a field is dropped rather
 * than shown half-written: a notification with no id cannot be replaced, and one
 * with no language cannot be translated.
 */
export function parsePushContent(payload: unknown): PushContent[] {
  if (!Array.isArray(payload)) return [];
  const out: PushContent[] = [];
  for (const entry of payload) {
    if (entry === null || typeof entry !== 'object') continue;
    const row = entry as Partial<ContentRow>;
    if (typeof row.id !== 'string' || row.id.length === 0) continue;
    const kind = typeof row.kind === 'string' && isKind(row.kind) ? row.kind : 'moderation';
    const language = row.language === 'en' ? 'en' : 'bn';
    out.push({
      id: row.id,
      kind,
      body: typeof row.body === 'string' ? row.body : '',
      url: typeof row.url === 'string' && row.url.startsWith('/') ? row.url : '/notifications',
      actorName: typeof row.actor_name === 'string' ? row.actor_name : '',
      actorAvatar: typeof row.actor_avatar === 'string' ? row.actor_avatar : '',
      language,
      createdAt: typeof row.created_at === 'string' ? row.created_at : '',
    });
  }
  return out;
}

const TITLES: Record<PushKind, { bn: string; en: string }> = {
  follow: { bn: 'নতুন অনুসারী', en: 'New follower' },
  reaction: { bn: 'নতুন প্রতিক্রিয়া', en: 'New reaction' },
  comment: { bn: 'নতুন মন্তব্য', en: 'New comment' },
  reply: { bn: 'নতুন উত্তর', en: 'New reply' },
  mention: { bn: 'আপনাকে উল্লেখ করা হয়েছে', en: 'You were mentioned' },
  bookmark: { bn: 'সংরক্ষণ করা হয়েছে', en: 'Saved by someone' },
  share: { bn: 'শেয়ার হয়েছে', en: 'Shared' },
  post_published: { bn: 'নতুন পোস্ট', en: 'New post' },
  moderation: { bn: 'মডারেশন', en: 'Moderation' },
  message: { bn: 'নতুন বার্তা', en: 'New message' },
};

export function notificationTitle(content: PushContent): string {
  const words = TITLES[content.kind];
  return content.language === 'en' ? words.en : words.bn;
}

/**
 * The line under the title. The row's own text wins — it was written by the
 * person who caused the notification — and the actor's name is what is left to
 * say when it was not.
 */
export function notificationBody(content: PushContent): string {
  const body = content.body.trim();
  if (body.length > 0) return body;
  const name = content.actorName.trim();
  if (name.length > 0) return name;
  return content.language === 'en' ? 'Something new on BSDC.' : 'বিএসডিসিতে নতুন কিছু।';
}

/** One notification per row, so an update replaces rather than stacks. */
export function notificationTag(content: PushContent): string {
  return `bsdc-${content.id}`;
}

/**
 * More than a handful of notifications is a summary, not a list: a device that
 * has been asleep should be told once that something is waiting.
 */
export const SUMMARY_LIMIT = 3;

export function summarize(items: readonly PushContent[]): {
  title: string;
  body: string;
  url: string;
  language: 'bn' | 'en';
} | null {
  if (items.length <= SUMMARY_LIMIT) return null;
  const language = items[0]?.language === 'en' ? 'en' : 'bn';
  const count = items.length;
  return {
    title:
      language === 'en'
        ? `${count} new notifications`
        : `${toBanglaDigits(count)}টি নতুন নোটিফিকেশন`,
    body:
      language === 'en'
        ? `${items[0]?.actorName.trim() || 'Somebody'} and ${count - 1} more`
        : `${items[0]?.actorName.trim() || 'কেউ একজন'} সহ আরও ${toBanglaDigits(count - 1)} জন`,
    url: '/notifications',
    language,
  };
}

/** Bangla numerals, because a count shown in Bangla should read as Bangla. */
export function toBanglaDigits(value: number): string {
  const digits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(Math.max(0, Math.trunc(value)))
    .split('')
    .map((character) =>
      character >= '0' && character <= '9' ? digits[Number(character)] : character,
    )
    .join('');
}
