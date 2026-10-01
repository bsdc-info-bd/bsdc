import { coursePath, groupPath, postPath, profilePath } from '@/lib/site';
import type { SearchKind } from '@/lib/supabase/types';

export type { SearchKind };

export const SEARCH_KINDS: SearchKind[] = ['post', 'person', 'group', 'course', 'job', 'project'];

export interface SearchResult {
  kind: SearchKind;
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  rank: number;
  createdAt: string;
}

export interface SearchSuggestion {
  kind: SearchKind;
  slug: string;
  title: string;
}

export interface ParsedQuery {
  /** The words actually sent to Postgres, with operators removed. */
  text: string;
  /** Kinds requested with "in:" — empty means every kind. */
  kinds: SearchKind[];
}

const KIND_ALIASES: Record<string, SearchKind> = {
  post: 'post',
  posts: 'post',
  person: 'person',
  people: 'person',
  member: 'person',
  members: 'person',
  group: 'group',
  groups: 'group',
  course: 'course',
  courses: 'course',
  job: 'job',
  jobs: 'job',
  project: 'project',
  projects: 'project',
};

/**
 * Understands "in:jobs react" without pretending to be a query language:
 * anything that is not a recognised operator stays part of the search text,
 * so a stray colon never silently deletes a word.
 */
export function parseQuery(input: string): ParsedQuery {
  const kinds: SearchKind[] = [];
  const words: string[] = [];

  for (const token of input.trim().split(/\s+/)) {
    if (token.length === 0) continue;
    const lower = token.toLowerCase();
    if (lower.startsWith('in:')) {
      const alias = KIND_ALIASES[lower.slice(3)];
      if (alias !== undefined) {
        if (!kinds.includes(alias)) kinds.push(alias);
        continue;
      }
    }
    words.push(token);
  }

  return { text: words.join(' '), kinds };
}

/** A query worth sending: one character matches half the database. */
export function isSearchable(text: string): boolean {
  return text.trim().length >= 2;
}

/** Where a result leads. Every kind has a real destination; none are dead. */
export function resultPath(result: SearchResult): string {
  switch (result.kind) {
    case 'post':
      return postPath(result.slug);
    case 'person':
      return result.slug.length > 0 ? profilePath(result.slug) : `/u/${result.id}`;
    case 'group':
      return groupPath(result.slug);
    case 'course':
      return coursePath(result.slug);
    case 'job':
      return '/jobs';
    case 'project':
      return '/projects';
  }
}

export interface SearchGroup {
  kind: SearchKind;
  results: SearchResult[];
}

/** Results bucketed by kind, in a stable order regardless of ranking. */
export function groupByKind(results: readonly SearchResult[]): SearchGroup[] {
  return SEARCH_KINDS.map((kind) => ({
    kind,
    results: results.filter((result) => result.kind === kind),
  })).filter((group) => group.results.length > 0);
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Splits a title into matched and unmatched segments so the UI can mark the
 * hit without ever injecting HTML. Matching is case-insensitive and each
 * search word is highlighted independently.
 */
export function highlight(text: string, query: string): HighlightSegment[] {
  const words = query
    .trim()
    .split(/\s+/)
    .map((word) => escapeRegExp(word))
    .filter((word) => word.length > 0);
  if (words.length === 0 || text.length === 0) return [{ text, match: false }];

  const splitter = new RegExp(`(${words.join('|')})`, 'gi');
  const matcher = new RegExp(`^(?:${words.join('|')})$`, 'i');
  return text
    .split(splitter)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, match: matcher.test(part) }));
}
