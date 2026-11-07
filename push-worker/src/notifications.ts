/**
 * What each kind of notification says, in the language the device asked for.
 *
 * A push is read on a lock screen, at a glance, in one second, sometimes with a
 * phone held at an angle. "Someone reacted to your post" is a sentence that
 * tells a member nothing they can act on. These builders produce the two things
 * a notification needs — a title with a name in it and a body that says what
 * happened — from the row the database already wrote, so the words are chosen
 * per device rather than baked into a stored body.
 *
 * Bangla is the default. A device that subscribed with `language = 'en'` gets
 * English, and the choice is per device because one member reads one language on
 * a laptop and another on a phone.
 */

export type NotificationKind =
  | 'follow'
  | 'reaction'
  | 'comment'
  | 'reply'
  | 'mention'
  | 'bookmark'
  | 'share'
  | 'post_published'
  | 'moderation'
  | 'message'
  | 'order'
  | 'review'
  | 'payout'
  | 'course'
  | 'job'
  | 'event'
  | 'certificate'
  | 'mention_group'
  | 'group_invite';

export interface PushWords {
  title: string;
  body: string;
  url: string;
  tag: string;
  /** A conversation, a post, a thread: what a later push may replace. */
  topic: string;
}

export interface NotificationSource {
  id: string;
  kind: NotificationKind;
  /** The actor's display name, or '' when the row has no actor. */
  actorName: string;
  /** What the actor said, already trimmed by the caller. */
  preview: string;
  /** The path to open. Validated again here; a push never navigates a script. */
  url: string;
  language: 'bn' | 'en';
  /** Where the notification lives. Used to build a stable collapse key. */
  conversationId?: string;
  postId?: string;
}

/** The Bangla digits a member actually reads. */
const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBanglaDigits(value: number): string {
  return String(value)
    .split('')
    .map((digit) => {
      const index = Number.parseInt(digit, 10);
      return Number.isNaN(index) ? digit : (BANGLA_DIGITS[index] ?? digit);
    })
    .join('');
}

/**
 * A name, safe to render in a notification.
 *
 * Control characters and line breaks go: a display name ending in a newline is a
 * title that renders as an empty bar on some Android lock screens.
 */
export function cleanName(raw: string, fallback: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 60) : fallback;
}

/** A preview, cut on a word boundary so it does not end mid-syllable. */
export function cleanPreview(raw: string, max = 110): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= max) return cleaned;
  const cut = cleaned.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * A path this worker is willing to send a browser to.
 *
 * Absolute URLs are refused outright: a notification that opens another origin
 * is a phishing vector wearing this platform's icon. Only a path on this site is
 * ever accepted, and a path that tries to escape loses its dots.
 */
export function safePath(raw: string, fallback = '/notifications'): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) return fallback;
  if (trimmed.startsWith('//')) return fallback;
  return trimmed.replace(/\\/g, '').slice(0, 300);
}

const NAMES: Record<NotificationKind, { bn: string; en: string }> = {
  follow: { bn: 'নতুন অনুসরণকারী', en: 'New follower' },
  reaction: { bn: 'নতুন প্রতিক্রিয়া', en: 'New reaction' },
  comment: { bn: 'নতুন মন্তব্য', en: 'New comment' },
  reply: { bn: 'নতুন উত্তর', en: 'New reply' },
  mention: { bn: 'আপনাকে উল্লেখ করা হয়েছে', en: 'You were mentioned' },
  bookmark: { bn: 'বুকমার্ক', en: 'Bookmark' },
  share: { bn: 'শেয়ার', en: 'Share' },
  post_published: { bn: 'নতুন পোস্ট', en: 'New post' },
  moderation: { bn: 'মডারেশন', en: 'Moderation' },
  message: { bn: 'নতুন বার্তা', en: 'New message' },
  order: { bn: 'নতুন অর্ডার', en: 'New order' },
  review: { bn: 'নতুন রিভিউ', en: 'New review' },
  payout: { bn: 'পেমেন্ট', en: 'Payout' },
  course: { bn: 'কোর্স', en: 'Course' },
  job: { bn: 'চাকরি', en: 'Job' },
  event: { bn: 'ইভেন্ট', en: 'Event' },
  certificate: { bn: 'সার্টিফিকেট', en: 'Certificate' },
  mention_group: { bn: 'গ্রুপে উল্লেখ', en: 'Group mention' },
  group_invite: { bn: 'গ্রুপ আমন্ত্রণ', en: 'Group invitation' },
};

/** The words for one notification, in one language. */
export function wordsFor(source: NotificationSource): PushWords {
  const name = cleanName(source.actorName, source.language === 'en' ? 'Someone' : 'কেউ একজন');
  const preview = cleanPreview(source.preview);
  const url = safePath(source.url);
  const label = NAMES[source.kind][source.language];
  const en = source.language === 'en';

  /** A body made of the name, the verb and what was said. */
  const said = (verb: { bn: string; en: string }): string => {
    const lead = en ? `${name} ${verb.en}` : `${name} ${verb.bn}`;
    return preview.length > 0 ? `${lead}: ${preview}` : lead;
  };

  let body: string;
  switch (source.kind) {
    case 'message':
      body =
        preview.length > 0 ? preview : en ? 'Sent you a message' : 'আপনাকে একটি বার্তা পাঠিয়েছেন';
      break;
    case 'comment':
      body = said({ bn: 'মন্তব্য করেছেন', en: 'commented' });
      break;
    case 'reply':
      body = said({ bn: 'উত্তর দিয়েছেন', en: 'replied' });
      break;
    case 'reaction':
      body =
        preview.length > 0
          ? said({ bn: 'প্রতিক্রিয়া জানিয়েছেন', en: 'reacted' })
          : said({ bn: 'আপনার পোস্টে প্রতিক্রিয়া জানিয়েছেন', en: 'reacted to your post' });
      break;
    case 'mention':
      body = said({ bn: 'আপনাকে উল্লেখ করেছেন', en: 'mentioned you' });
      break;
    case 'mention_group':
      body = said({ bn: 'গ্রুপে আপনাকে উল্লেখ করেছেন', en: 'mentioned you in a group' });
      break;
    case 'follow':
      body = en ? `${name} started following you` : `${name} আপনাকে অনুসরণ শুরু করেছেন`;
      break;
    case 'share':
      body = en ? `${name} shared your post` : `${name} আপনার পোস্ট শেয়ার করেছেন`;
      break;
    case 'bookmark':
      body = en ? `${name} saved your post` : `${name} আপনার পোস্ট সংরক্ষণ করেছেন`;
      break;
    case 'post_published':
      body = said({ bn: 'নতুন কিছু প্রকাশ করেছেন', en: 'published something new' });
      break;
    case 'moderation':
      body =
        preview.length > 0
          ? preview
          : en
            ? 'A report needs your review'
            : 'একটি রিপোর্ট পর্যালোচনা প্রয়োজন';
      break;
    case 'order':
      body =
        preview.length > 0 ? preview : en ? 'You have a new order' : 'আপনার একটি নতুন অর্ডার আছে';
      break;
    case 'review':
      body = said({ bn: 'একটি রিভিউ দিয়েছেন', en: 'left a review' });
      break;
    case 'payout':
      body =
        preview.length > 0
          ? preview
          : en
            ? 'A payout was processed'
            : 'একটি পেমেন্ট প্রক্রিয়া করা হয়েছে';
      break;
    case 'course':
      body =
        preview.length > 0
          ? preview
          : en
            ? 'Your course has an update'
            : 'আপনার কোর্সে একটি নতুন আপডেট আছে';
      break;
    case 'job':
      body = said({ bn: 'একটি চাকরির সুযোগ দিয়েছেন', en: 'posted a job' });
      break;
    case 'event':
      body = said({ bn: 'একটি ইভেন্ট তৈরি করেছেন', en: 'created an event' });
      break;
    case 'certificate':
      body =
        preview.length > 0
          ? preview
          : en
            ? 'Your certificate is ready'
            : 'আপনার সার্টিফিকেট প্রস্তুত';
      break;
    case 'group_invite':
      body = said({ bn: 'আপনাকে একটি গ্রুপে আমন্ত্রণ জানিয়েছেন', en: 'invited you to a group' });
      break;
  }

  // The collapse key: a conversation collapses to one row, so ten messages do
  // not become ten notification shades over the member's lock screen.
  const topicBase =
    source.conversationId !== undefined && source.conversationId.length > 0
      ? `c-${source.conversationId}`
      : source.postId !== undefined && source.postId.length > 0
        ? `p-${source.postId}`
        : `n-${source.id}`;

  return {
    title: `${label} · BSDC`,
    body: body.length > 0 ? body : label,
    url,
    tag: `bsdc-${source.kind}-${source.conversationId ?? source.postId ?? source.id}`,
    topic: topicBase,
  };
}

/** One sentence for several things at once, for a device that slept all day. */
export function summarise(
  items: readonly NotificationSource[],
  language: 'bn' | 'en',
): PushWords | null {
  if (items.length === 0) return null;
  const en = language === 'en';
  if (items.length === 1) {
    const only = items[0];
    return only === undefined ? null : wordsFor(only);
  }

  const names = [...new Set(items.map((item) => cleanName(item.actorName, '')))].filter(
    (name) => name.length > 0,
  );
  const first = names[0] ?? (en ? 'Someone' : 'কেউ একজন');
  const others = Math.max(0, names.length - 1);
  const count = items.length;

  const title = en
    ? `${count} new notifications · BSDC`
    : `${toBanglaDigits(count)}টি নতুন বিজ্ঞপ্তি · বিএসডিসি`;
  const body = en
    ? others > 0
      ? `${first} and ${others} others were active while you were away`
      : `${first} was active while you were away`
    : others > 0
      ? `${first} এবং আরও ${toBanglaDigits(others)} জন আপনার অনুপস্থিতিতে সক্রিয় ছিলেন`
      : `${first} আপনার অনুপস্থিতিতে সক্রিয় ছিলেন`;

  return {
    title,
    body,
    url: '/notifications',
    tag: 'bsdc-summary',
    topic: 'bsdc-summary',
  };
}
