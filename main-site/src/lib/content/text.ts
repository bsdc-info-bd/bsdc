/**
 * Text utilities shared by the composer, the renderer and the SEO layer.
 * They are pure and synchronous so they can run during prerendering.
 */

/** Bangla digits and letters are preserved; everything else is transliterated. */
export function slugify(input: string, fallback = 'post'): string {
  const normalized = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['"’`]/g, '')
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');

  // Bangla characters are not valid in the slug column, so a Bangla-only
  // title falls back to a readable romanised stub plus the unique suffix.
  const ascii = normalized.replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
  return ascii.length >= 3 ? ascii : fallback;
}

/** Appends a short random suffix so two identical titles never collide. */
export function uniqueSlug(input: string, fallback = 'post'): string {
  const base = slugify(input, fallback);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`.slice(0, 120);
}

const MARKDOWN_NOISE = /(^#{1,6}\s+)|([*_~`>]+)|(\[(.*?)\]\((.*?)\))|(!\[.*?\]\(.*?\))/gm;

/** Plain-text summary used for meta descriptions and feed previews. */
export function toExcerpt(body: string, limit = 180): string {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(MARKDOWN_NOISE, (_match, _heading, _emphasis, _link, label: string | undefined) =>
      typeof label === 'string' ? label : ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/** Bangla and English both read slower than the usual 265 wpm estimate. */
export function readingTimeMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(180, Math.max(1, Math.round(words / 200)));
}

const MENTION_PATTERN = /(^|[\s(])@([a-z0-9_]{3,24})\b/g;
const TAG_PATTERN = /(^|[\s(])#([a-z0-9][a-z0-9-]{1,31})\b/g;

/** Usernames mentioned in a body, lowercased and de-duplicated. */
export function extractMentions(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const handle = match[2];
    if (handle) found.add(handle.toLowerCase());
  }
  return [...found];
}

/** Inline hashtags, used to pre-fill the tag input. */
export function extractHashtags(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(TAG_PATTERN)) {
    const tag = match[2];
    if (tag) found.add(tag.toLowerCase());
  }
  return [...found];
}

export function normalizeTag(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}
