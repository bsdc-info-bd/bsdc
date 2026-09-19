/**
 * BSDC — src/features/search/recentSearches.ts
 * Purpose : The last few things a person searched for on this device.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Recent searches stay on the device. They are not synced, not sent anywhere and not
 *   attached to an identity: a search history is the one piece of personal data a platform has no
 *   business centralising. When storage is unavailable — a locked-down WebView, private mode — the
 *   feature simply has no history, and nothing else in the product notices.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { RECENT_SEARCH_LIMIT } from '@/core/config/search';

const KEY = 'bsdc.recent-searches';

/**
 * Reads the recent searches.
 * @returns the queries, most recent first
 */
export function readRecentSearches(): readonly string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .slice(0, RECENT_SEARCH_LIMIT);
  } catch {
    return [];
  }
}

/**
 * Records a query, moving it to the front when it was already there.
 * @param query the query
 * @returns the updated list
 */
export function rememberSearch(query: string): readonly string[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return readRecentSearches();
  const next = [trimmed, ...readRecentSearches().filter((entry) => entry !== trimmed)].slice(
    0,
    RECENT_SEARCH_LIMIT,
  );
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage refused. The feature degrades to having no history, which is acceptable.
  }
  return next;
}

/**
 * Forgets the recent searches.
 * @returns an empty list
 */
export function clearRecentSearches(): readonly string[] {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do: the list is already out of reach.
  }
  return [];
}
