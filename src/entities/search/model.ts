/**
 * BSDC — src/entities/search/model.ts
 * Purpose : The search document: one uniform shape every kind of content is flattened into.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every searchable thing — a person, a post, a group, an event, a job, a project, a gig
 *   — is projected into this one shape before it is ever scored. That is what makes a single
 *   ranking function, a single results component and a single keyboard interaction possible.
 *   The projection is lossy on purpose: we keep the fields a person recognises, and nothing else.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { SearchKind } from '@/core/config/search';

/** One searchable record, flattened for matching and rendering. */
export interface SearchDoc {
  readonly kind: SearchKind;
  readonly id: string;
  /** In-app route this hit opens. */
  readonly path: string;
  readonly title: string;
  readonly subtitle: string;
  /** Weight-keyed matching fields. Keys must exist in SEARCH_WEIGHTS for this kind. */
  readonly fields: Readonly<Record<string, string>>;
  /** ISO creation timestamp, used by the freshness bonus. */
  readonly createdAt: string;
  /** Reactions, members, applicants or completed orders — whatever this kind counts. */
  readonly popularity: number;
  /** Optional small label rendered next to the title, e.g. a role or a level. */
  readonly badge?: string | undefined;
}

/** A scored hit. */
export interface SearchHit {
  readonly doc: SearchDoc;
  readonly score: number;
  /** Field names that produced a match, most valuable first. */
  readonly matchedFields: readonly string[];
}

/** One group of hits, in the order the results screen renders them. */
export interface SearchGroup {
  readonly kind: SearchKind;
  readonly hits: readonly SearchHit[];
}

/** Everything one search produced. */
export interface SearchResultSet {
  readonly query: string;
  readonly groups: readonly SearchGroup[];
  /** Where the hits came from: the backend, this device, or both. */
  readonly source: 'remote' | 'local' | 'mixed';
  readonly total: number;
  readonly truncated: boolean;
}

/** Stop words dropped from a query. Short and shared: they carry no discriminating power. */
const STOP_WORDS: readonly string[] = [
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'for',
  'on',
  'with',
  'is',
  'at',
  'by',
  'এবং',
  'অথবা',
  'এর',
  'একটি',
  'একজন',
  'করে',
  'হয়',
  'আছে',
];

/**
 * Normalises text for matching: NFKC, no zero-width marks, no punctuation, single spaces.
 * Bangla and English both survive this unchanged in the characters that carry meaning, so
 * "ঢাকা" matches whether it was typed with a nukta variant or a composed cluster.
 * @param value raw text
 * @returns the normalised, lower-cased form
 */
export function normaliseText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits a query into matching tokens.
 * @param query the raw query
 * @returns the tokens, de-duplicated, stop words removed
 */
export function tokenise(query: string): readonly string[] {
  const tokens = normaliseText(query)
    .split(' ')
    .filter((token) => token.length > 0);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const token of tokens) {
    if (STOP_WORDS.includes(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    kept.push(token);
  }
  return kept;
}

/**
 * Builds an empty result set, used while a search is in flight and when the query is too short.
 * @param query the query it was built for
 * @param source provenance
 * @returns an empty result set
 */
export function emptyResultSet(
  query: string,
  source: SearchResultSet['source'] = 'local',
): SearchResultSet {
  return { query, groups: [], source, total: 0, truncated: false };
}

/**
 * Reports whether a string is worth searching for.
 * @param query raw query
 * @param minimum minimum character count
 * @returns true when the query should run
 */
export function isQueryUsable(query: string, minimum: number): boolean {
  return tokenise(query).join(' ').length >= minimum;
}
