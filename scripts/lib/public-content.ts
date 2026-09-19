/**
 * BSDC — scripts/lib/public-content.ts
 * Purpose : The one place a build script asks "what public content exists?".
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Sitemaps, feeds and share cards all need the same list of public URLs, so the question is
 *   asked once here rather than three times with three different answers.
 *   Three sources, tried in order:
 *     1. `BSDC_PUBLIC_CONTENT` — a path to a JSON file, set by CI after it reads Firestore.
 *     2. `build/public-content.json` — the same file, committed by a scheduled job when a release
 *        wants a known snapshot.
 *     3. Nothing — in which case the sitemap and the feeds contain the static routes and no more,
 *        and the script says so. A build that invents URLs to make a sitemap look fuller is a build
 *        that sends crawlers to pages that do not exist.
 *   The shape mirrors what the pages themselves render: a path, both titles, and the last time the
 *   thing changed.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** One public thing with a page of its own. */
export interface PublicContentItem {
  /** Absolute path, e.g. `/events/e1`. */
  readonly path: string;
  readonly titleBn: string;
  readonly titleEn: string;
  /** ISO instant the thing last changed. */
  readonly updatedAt: string;
  /** What kind of thing it is, which decides its sitemap priority. */
  readonly kind: 'page' | 'event' | 'job' | 'project' | 'profile' | 'gig';
}

const DEFAULT_FILE = 'build/public-content.json';

/**
 * Loads the public content list, from whichever source is available.
 * @returns the items, newest first
 */
export function loadPublicContent(): readonly PublicContentItem[] {
  const override = process.env.BSDC_PUBLIC_CONTENT;
  const candidates = [override ?? '', DEFAULT_FILE].filter((path) => path.length > 0);
  for (const candidate of candidates) {
    const file = resolve(process.cwd(), candidate);
    if (!existsSync(file)) continue;
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    const items = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' &&
          parsed !== null &&
          Array.isArray((parsed as { items?: unknown }).items)
        ? (parsed as { items: unknown[] }).items
        : [];
    const clean = items
      .filter(
        (item): item is PublicContentItem =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as PublicContentItem).path === 'string' &&
          (item as PublicContentItem).path.startsWith('/'),
      )
      .map((item) => ({
        path: item.path,
        titleBn: typeof item.titleBn === 'string' ? item.titleBn : '',
        titleEn: typeof item.titleEn === 'string' ? item.titleEn : '',
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
        kind: item.kind,
      }));
    console.info(`[bsdc] public content: ${clean.length} item(s) from ${candidate}`);
    return clean.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  console.info(
    '[bsdc] public content: no source found; the sitemap and feeds will list static pages only.',
  );
  return [];
}

/**
 * Escapes a string for XML text or attribute content.
 * @param value the raw string
 * @returns the escaped string
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Formats an instant the way a sitemap and a feed both want it: a W3C date-time, not a JavaScript
 * one, because a sitemap with a local time and no offset is a sitemap a crawler reads as now.
 * @param iso ISO instant
 * @param fallback used when the instant cannot be parsed
 * @returns the formatted stamp
 */
export function w3cDate(iso: string, fallback: Date = new Date()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return fallback.toISOString().replace(/\.\d{3}Z$/, '+00:00');
  return new Date(at).toISOString().replace(/\.\d{3}Z$/, '+00:00');
}
