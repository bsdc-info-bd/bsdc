/**
 * BSDC — src/entities/search/ranking.ts
 * Purpose : The one scoring function shared by remote search and device search.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The same function ranks a Firestore result and a mirror result, so what a person sees
 *   does not change with connectivity — only how much of the platform is covered does.
 *   The score is intentionally explainable: an exact name match wins, an early word wins over a
 *   buried one, something recent wins over something old, and something the community engaged
 *   with wins over something it ignored. There is no opaque relevance model behind it.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import {
  FRESHNESS_HALF_LIFE_DAYS,
  SEARCH_BONUS,
  SEARCH_KIND_LIMIT,
  SEARCH_SCORE_FLOOR,
  SEARCH_WEIGHTS,
  type SearchKind,
} from '@/core/config/search';
import { normaliseText, tokenise, type SearchDoc, type SearchHit } from './model';

/** Cached normalised form of a document, built once per index build. */
interface IndexedDoc {
  readonly doc: SearchDoc;
  readonly fields: readonly {
    readonly name: string;
    readonly value: string;
    readonly weight: number;
  }[];
  readonly titleValue: string;
  readonly createdMs: number;
}

/**
 * Projects a document into its weighted, normalised form.
 * @param doc search document
 * @returns the indexed form
 */
export function indexDoc(doc: SearchDoc): IndexedDoc {
  const weights = SEARCH_WEIGHTS[doc.kind];
  const fields = Object.entries(doc.fields)
    .filter(([name]) => name in weights)
    .map(([name, value]) => ({
      name,
      value: normaliseText(value),
      weight: weights[name] ?? 1,
    }))
    .filter((field) => field.value.length > 0);
  return {
    doc,
    fields,
    titleValue: normaliseText(doc.title),
    createdMs: Date.parse(doc.createdAt),
  };
}

/**
 * Freshness bonus: full strength today, halved every FRESHNESS_HALF_LIFE_DAYS afterwards.
 * @param createdMs creation time in epoch milliseconds
 * @param nowMs the instant the search ran
 * @returns a score between 0 and SEARCH_BONUS.freshnessMax
 */
export function freshnessBonus(createdMs: number, nowMs: number): number {
  if (!Number.isFinite(createdMs) || createdMs <= 0) return 0;
  const ageDays = Math.max(0, (nowMs - createdMs) / 86_400_000);
  return SEARCH_BONUS.freshnessMax * Math.pow(0.5, ageDays / FRESHNESS_HALF_LIFE_DAYS);
}

/**
 * Popularity bonus, saturating at 50 so a viral post cannot outrank a name match.
 * @param popularity the raw counter
 * @returns a score between 0 and SEARCH_BONUS.popularityMax
 */
export function popularityBonus(popularity: number): number {
  if (!Number.isFinite(popularity) || popularity <= 0) return 0;
  return SEARCH_BONUS.popularityMax * Math.min(1, popularity / 50);
}

/**
 * Scores one indexed document against a query.
 * @param indexed the indexed document
 * @param tokens the query tokens
 * @param query the whole normalised query
 * @param nowMs the instant the search ran
 * @returns the hit, or null when it falls below the floor
 */
export function scoreDoc(
  indexed: IndexedDoc,
  tokens: readonly string[],
  query: string,
  nowMs: number,
): SearchHit | null {
  if (tokens.length === 0 || query.length === 0) return null;

  let score = 0;
  const matchedFields: string[] = [];
  const matchedTokens = new Set<string>();

  for (const field of indexed.fields) {
    let fieldScore = 0;
    if (field.value === query) {
      fieldScore = field.weight * 4 + SEARCH_BONUS.exact;
    } else if (field.value.startsWith(query)) {
      fieldScore = field.weight * 2 + SEARCH_BONUS.prefix;
    } else {
      let tokenHits = 0;
      for (const token of tokens) {
        if (field.value.includes(token)) {
          tokenHits += 1;
          matchedTokens.add(token);
        }
      }
      if (tokenHits > 0) {
        fieldScore = field.weight * tokenHits * (field.value.startsWith(tokens[0] ?? '') ? 1.5 : 1);
      }
    }
    if (fieldScore > 0) {
      score += fieldScore;
      matchedFields.push(field.name);
    }
  }

  if (matchedFields.length === 0) return null;
  if (matchedTokens.size === tokens.length && tokens.length > 1) score += SEARCH_BONUS.allTokens;
  score += freshnessBonus(indexed.createdMs, nowMs);
  score += popularityBonus(indexed.doc.popularity);

  if (score < SEARCH_SCORE_FLOOR) return null;

  return { doc: indexed.doc, score, matchedFields };
}

/**
 * Ranks documents against a query and returns the best hits, grouped by kind.
 * @param docs documents to search
 * @param query the raw query
 * @param kinds kinds to include; empty means every kind
 * @param nowMs the instant the search ran
 * @returns hits grouped by kind, each group truncated to the per-kind limit
 */
export function rank(
  docs: readonly SearchDoc[],
  query: string,
  kinds: readonly SearchKind[],
  nowMs: number = Date.now(),
): readonly SearchHit[] {
  const tokens = tokenise(query);
  const normalised = tokens.join(' ');
  if (normalised.length === 0) return [];

  const allowed: readonly SearchKind[] =
    kinds.length > 0 ? kinds : (Object.keys(SEARCH_WEIGHTS) as SearchKind[]);
  const hits: SearchHit[] = [];
  for (const doc of docs) {
    if (!allowed.includes(doc.kind)) continue;
    const hit = scoreDoc(indexDoc(doc), tokens, normalised, nowMs);
    if (hit !== null) hits.push(hit);
  }
  return hits.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return right.doc.createdAt.localeCompare(left.doc.createdAt);
  });
}

/**
 * Truncates a ranked hit list to the per-kind limit.
 * @param hits ranked hits
 * @param limit maximum hits per kind
 * @returns the truncated list
 */
export function limitPerKind(
  hits: readonly SearchHit[],
  limit: number = SEARCH_KIND_LIMIT,
): readonly SearchHit[] {
  const counts = new Map<SearchKind, number>();
  return hits.filter((hit) => {
    const used = counts.get(hit.doc.kind) ?? 0;
    if (used >= limit) return false;
    counts.set(hit.doc.kind, used + 1);
    return true;
  });
}
