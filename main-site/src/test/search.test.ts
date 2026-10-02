import { describe, expect, it } from 'vitest';
import {
  groupByKind,
  highlight,
  isSearchable,
  parseQuery,
  resultPath,
  type SearchResult,
} from '@/lib/search/search-types';

function result(partial: Partial<SearchResult> & { kind: SearchResult['kind'] }): SearchResult {
  return {
    id: 'id-1',
    slug: 'slug-1',
    title: 'Title',
    subtitle: '',
    imageUrl: '',
    rank: 0.5,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('parseQuery', () => {
  it('extracts a kind filter and removes it from the text', () => {
    expect(parseQuery('in:jobs react')).toEqual({ text: 'react', kinds: ['job'] });
  });

  it('accepts singular and plural aliases and never repeats a kind', () => {
    expect(parseQuery('in:person in:people dhaka')).toEqual({
      text: 'dhaka',
      kinds: ['person'],
    });
  });

  it('keeps an unknown operator as ordinary search text', () => {
    expect(parseQuery('in:spaceships react')).toEqual({
      text: 'in:spaceships react',
      kinds: [],
    });
  });

  it('collapses extra whitespace', () => {
    expect(parseQuery('  react   native  ').text).toBe('react native');
  });

  it('returns nothing to search for an empty box', () => {
    expect(parseQuery('   ')).toEqual({ text: '', kinds: [] });
  });
});

describe('isSearchable', () => {
  it('refuses a single character but accepts two', () => {
    expect(isSearchable('a')).toBe(false);
    expect(isSearchable(' a ')).toBe(false);
    expect(isSearchable('go')).toBe(true);
  });
});

describe('resultPath', () => {
  it('routes every kind to a real destination', () => {
    expect(resultPath(result({ kind: 'post', slug: 'hello' }))).toBe('/p/hello');
    expect(resultPath(result({ kind: 'person', slug: 'rizwan' }))).toBe('/@rizwan');
    expect(resultPath(result({ kind: 'group', slug: 'dhaka-js' }))).toBe('/g/dhaka-js');
    expect(resultPath(result({ kind: 'course', slug: 'intro-sql' }))).toBe('/learn/intro-sql');
    expect(resultPath(result({ kind: 'job' }))).toBe('/jobs');
    expect(resultPath(result({ kind: 'project' }))).toBe('/projects');
  });

  it('falls back to an id for a member without a username', () => {
    expect(resultPath(result({ kind: 'person', slug: '', id: 'uid-9' }))).toBe('/u/uid-9');
  });
});

describe('groupByKind', () => {
  it('buckets results in a stable order and drops empty kinds', () => {
    const groups = groupByKind([
      result({ kind: 'job', id: 'j1' }),
      result({ kind: 'post', id: 'p1' }),
      result({ kind: 'job', id: 'j2' }),
    ]);
    expect(groups.map((group) => group.kind)).toEqual(['post', 'job']);
    expect(groups[1]?.results).toHaveLength(2);
  });

  it('returns nothing for no results', () => {
    expect(groupByKind([])).toEqual([]);
  });
});

describe('highlight', () => {
  it('marks the matched words without touching the rest', () => {
    const segments = highlight('Postgres for beginners', 'postgres');
    expect(segments[0]).toEqual({ text: 'Postgres', match: true });
    expect(segments.map((segment) => segment.text).join('')).toBe('Postgres for beginners');
  });

  it('marks every search word independently', () => {
    const segments = highlight('React and Postgres', 'react postgres');
    expect(segments.filter((segment) => segment.match).map((segment) => segment.text)).toEqual([
      'React',
      'Postgres',
    ]);
  });

  it('returns a single unmatched segment for an empty query', () => {
    expect(highlight('Anything', '  ')).toEqual([{ text: 'Anything', match: false }]);
  });

  it('treats regular expression characters as literal text', () => {
    const segments = highlight('C++ guide', 'c++');
    expect(segments.map((segment) => segment.text).join('')).toBe('C++ guide');
  });
});
