/**
 * Reading a message body: links that are clickable, fenced code that is not
 * re-wrapped, mentions that are addresses, and search hits that are visible.
 * Pure functions, so the rendering rules are testable without a browser.
 */

export type MessageSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string }
  | { type: 'mention'; value: string; handle: string }
  | { type: 'code'; value: string; language: string };

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)]/g;
const MENTION_PATTERN = /(^|[\s(])@([a-z0-9_]{3,30})\b/g;
const FENCE_PATTERN = /```([a-z0-9+#-]{0,16})\n([\s\S]*?)(?:```|$)/gi;

/** Splits a body into text, links, mentions and fenced code, in order. */
export function parseMessageBody(body: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let cursor = 0;

  const inline = (chunk: string) => {
    const pieces: MessageSegment[] = [];
    let at = 0;
    const combined = new RegExp(`${URL_PATTERN.source}|${MENTION_PATTERN.source}`, 'g');
    for (const match of chunk.matchAll(combined)) {
      const index = match.index ?? 0;
      if (index > at) pieces.push({ type: 'text', value: chunk.slice(at, index) });
      const whole = match[0];
      if (whole.startsWith('http')) {
        pieces.push({ type: 'link', value: whole, href: whole });
      } else {
        const handle = match[2] ?? '';
        const prefix = match[1] ?? '';
        if (prefix.length > 0) {
          const last = pieces.at(-1);
          if (last?.type === 'text') last.value += prefix;
          else pieces.push({ type: 'text', value: prefix });
        }
        pieces.push({ type: 'mention', value: `@${handle}`, handle });
      }
      at = index + whole.length;
    }
    if (at < chunk.length) pieces.push({ type: 'text', value: chunk.slice(at) });
    return pieces;
  };

  for (const match of body.matchAll(FENCE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) segments.push(...inline(body.slice(cursor, index)));
    segments.push({
      type: 'code',
      value: (match[2] ?? '').replace(/\n$/, ''),
      language: (match[1] ?? '').toLowerCase(),
    });
    cursor = index + match[0].length;
  }
  if (cursor < body.length) segments.push(...inline(body.slice(cursor)));

  return segments.filter((segment) => segment.type === 'code' || segment.value.length > 0);
}

/** Every @handle in a body, lowercased, without repeats. */
export function extractMentions(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const handle = match[2];
    if (handle !== undefined) found.add(handle.toLowerCase());
  }
  return [...found].sort();
}

/** The calendar day a timestamp falls on, in the viewer's time zone. */
export function dayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export type AttachmentKind = 'image' | 'video' | 'audio' | 'pdf' | 'archive' | 'document' | 'file';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'];
const VIDEO_EXT = ['mp4', 'webm', 'mov', 'mkv', 'avi'];
const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'opus'];
const ARCHIVE_EXT = ['zip', 'rar', '7z', 'tar', 'gz'];
const DOC_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv'];

/** What kind of attachment a filename or URL is, for the icon and preview. */
export function attachmentKind(name: string, url = ''): AttachmentKind {
  const source = name.length > 0 ? name : url;
  if (/voice[-_ ]?note/i.test(source)) return 'audio';
  const clean = source.split('?')[0]?.split('#')[0] ?? '';
  const extension = clean.includes('.') ? (clean.split('.').pop() ?? '').toLowerCase() : '';
  if (IMAGE_EXT.includes(extension)) return 'image';
  if (VIDEO_EXT.includes(extension)) return 'video';
  if (AUDIO_EXT.includes(extension)) return 'audio';
  if (extension === 'pdf') return 'pdf';
  if (ARCHIVE_EXT.includes(extension)) return 'archive';
  if (DOC_EXT.includes(extension)) return 'document';
  return 'file';
}

/** Splits search text into the matched spans, so the hits can be marked. */
export function highlightMatches(
  text: string,
  query: string,
): Array<{ text: string; hit: boolean }> {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [{ text, hit: false }];
  const haystack = text.toLowerCase();
  const spans: Array<{ text: string; hit: boolean }> = [];
  let at = 0;
  for (;;) {
    const index = haystack.indexOf(needle, at);
    if (index < 0) break;
    if (index > at) spans.push({ text: text.slice(at, index), hit: false });
    spans.push({ text: text.slice(index, index + needle.length), hit: true });
    at = index + needle.length;
  }
  if (at < text.length) spans.push({ text: text.slice(at), hit: false });
  return spans;
}

/** A one-line preview of a body: newlines flattened, then clipped. */
export function previewLine(body: string, limit = 120): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, Math.max(0, limit - 1))}…` : flat;
}

/** The reaction set offered in the thread. Six is a row, not a menu. */
export const REACTION_CHOICES = ['❤️', '👍', '😂', '😮', '🎉', '🙏'] as const;

export type ReactionChoice = (typeof REACTION_CHOICES)[number];

/** Whether a string is one of the offered reactions. */
export function isReactionChoice(value: string): value is ReactionChoice {
  return (REACTION_CHOICES as readonly string[]).includes(value);
}
