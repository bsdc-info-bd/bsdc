/**
 * BSDC — src/shared/lib/url.ts
 * Purpose : Canonical URL construction, tracking-param stripping and locale path handling
 *           (PART 10.06 canonical strategy, PART 09.01 URL strategy).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every internal link produced by the app goes through these helpers so canonicals,
 *           hreflang pairs and sitemap entries can never disagree (ADR-022).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { SITE_URL } from '@/core/config/app';

/** Query parameters that must never survive into a canonical URL. */
const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'fbclid',
  'gclid',
] as const;

/**
 * Strips tracking parameters from a URL.
 * @param input absolute or relative URL
 * @returns URL without tracking parameters
 */
export function stripTracking(input: string): string {
  const url = new URL(input, SITE_URL);
  for (const param of TRACKING_PARAMS) url.searchParams.delete(param);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Normalises a path: lowercase, no trailing slash (except root), no duplicate slashes.
 * @param path pathname
 * @returns normalised path
 */
export function normalizePath(path: string): string {
  const withoutQuery = path.split('?')[0]?.split('#')[0] ?? '/';
  const collapsed = withoutQuery.replace(/\/{2,}/g, '/').toLowerCase();
  if (collapsed.length > 1 && collapsed.endsWith('/')) return collapsed.slice(0, -1);
  return collapsed.length === 0 ? '/' : collapsed;
}

/**
 * Builds an absolute canonical URL.
 * @param path pathname or full URL
 * @param origin origin override (defaults to the configured site URL)
 * @returns absolute canonical URL
 */
export function absoluteUrl(path: string, origin: string = SITE_URL): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${origin.replace(/\/$/, '')}${normalizePath(path)}`;
}

/**
 * Builds a locale-prefixed path. Bangla lives under /bn and English under /en; the canonical
 * root remains locale-agnostic (PART 09.01).
 * @param locale target locale
 * @param path locale-agnostic path
 * @returns locale-prefixed path
 */
export function localePath(locale: 'bn' | 'en', path: string): string {
  const normalized = normalizePath(path);
  if (normalized === '/') return `/${locale}`;
  return `/${locale}${normalized}`;
}

/**
 * Removes a locale prefix from a path.
 * @param path pathname with or without a locale prefix
 * @returns the locale-agnostic path
 */
export function stripLocale(path: string): string {
  const match = /^\/(bn|en)(\/|$)/.exec(path);
  if (!match) return path;
  const remainder = path.slice(match[0].length === 3 ? 3 : 4);
  return remainder.length === 0 ? '/' : remainder.startsWith('/') ? remainder : `/${remainder}`;
}

/**
 * Detects the locale encoded in a pathname.
 * @param path pathname
 * @returns the locale, or null when the path carries none
 */
export function localeFromPath(path: string): 'bn' | 'en' | null {
  const match = /^\/(bn|en)(\/|$)/.exec(path);
  return match?.[1] === 'bn' ? 'bn' : match?.[1] === 'en' ? 'en' : null;
}

/**
 * Joins a query object onto a path, skipping empty values.
 * @param path pathname
 * @param params query parameters
 * @returns path with a query string when parameters exist
 */
export function withQuery(
  path: string,
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query.length > 0 ? `${path}?${query}` : path;
}
