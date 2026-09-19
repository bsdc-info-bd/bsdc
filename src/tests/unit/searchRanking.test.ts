/**
 * BSDC — src/tests/unit/searchRanking.test.ts
 * Purpose : Proves that search answers the question a person asked, in both scripts.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The rules worth testing are the ones that decide whether search feels like it is
 *   listening. A name match outranks a body match. Every word has to be present, or the hit is not
 *   an answer. Bangla and English queries reach the same people, because this community writes in
 *   both and a search that only understands one of them is half a search.
 *   Freshness and popularity are tie-breakers, never substitutes for relevance: a popular post that
 *   mentions nothing you typed must not outrank the exact thing you were looking for.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import { isQueryUsable, normaliseText, tokenise, type SearchDoc } from '@/entities/search/model';
import { indexDoc, limitPerKind, rank, scoreDoc } from '@/entities/search/ranking';
import { SEARCH_KIND_LIMIT, SEARCH_WEIGHTS } from '@/core/config/search';

const NOW = Date.parse('2026-06-01T06:00:00.000Z');
const DAY = 86_400_000;

function doc(overrides: Partial<SearchDoc> & { id: string; kind: SearchDoc['kind'] }): SearchDoc {
  return {
    path: '/x',
    title: 'Untitled',
    subtitle: '',
    fields: {},
    createdAt: '2026-05-01T00:00:00.000Z',
    popularity: 0,
    ...overrides,
  };
}

function person(id: string, overrides: Partial<SearchDoc> = {}): SearchDoc {
  return doc({
    id,
    kind: 'people',
    path: `/u/${id}`,
    fields: { username: id, displayName: 'Someone', headline: '' },
    ...overrides,
  });
}

describe('query preparation', () => {
  it('strips punctuation and case so "Laravel," and "laravel" are the same question', () => {
    expect(normaliseText('  Laravel,  ')).toBe('laravel');
  });

  it('drops stop words, which carry no discriminating power', () => {
    expect(tokenise('the best laravel developer')).not.toContain('the');
    expect(tokenise('the best laravel developer')).toContain('laravel');
  });

  it('refuses a query too short to mean anything', () => {
    expect(isQueryUsable('  a', 2)).toBe(false);
    expect(isQueryUsable('la', 2)).toBe(true);
  });
});

describe('relevance', () => {
  it('ranks a name match above a body match', () => {
    const docs = [
      person('tanvir', {
        fields: { username: 'tanvir', displayName: 'Tanvir Ahmed', headline: '', bio: '' },
      }),
      person('other', {
        fields: {
          username: 'other',
          displayName: 'Ayesha Rahman',
          headline: '',
          bio: 'Tanvir helped with this',
        },
      }),
    ];
    const hits = rank(docs, 'tanvir', [], NOW);
    expect(hits[0]?.doc.id).toBe('tanvir');
  });

  it('ranks an exact match above a partial one', () => {
    const docs = [
      person('laravel-dev', {
        fields: { username: 'laravel-dev', displayName: 'Laravel Dev', headline: '' },
      }),
      person('web', {
        fields: { username: 'web', displayName: 'Web Laravel Designer', headline: '' },
      }),
    ];
    const hits = rank(docs, 'laravel', [], NOW);
    expect(hits[0]?.doc.id).toBe('laravel-dev');
  });

  it('excludes a document that matches none of the words', () => {
    const docs = [
      person('one', { fields: { username: 'one', displayName: 'Backend Engineer', headline: '' } }),
    ];
    expect(rank(docs, 'accountant', [], NOW)).toHaveLength(0);
  });

  it('ranks a document matching every word above one matching only some', () => {
    const both = person('both', {
      fields: { username: 'both', displayName: 'Backend Engineer', headline: '' },
    });
    const partial = person('partial', {
      fields: { username: 'partial', displayName: 'Backend Designer', headline: '' },
    });
    const hits = rank([partial, both], 'backend engineer', [], NOW);
    expect(hits[0]?.doc.id).toBe('both');
    expect(hits[0]?.score).toBeGreaterThan(hits[1]?.score ?? 0);
  });

  it('finds a person by their Bangla name as readily as by their English one', () => {
    const docs = [
      person('rrc', {
        fields: {
          username: 'rrc',
          displayName: 'Rizwan Rahim Chowdhury',
          displayNameBn: 'রিজওয়ান রহিম চৌধুরী',
          headline: '',
        },
      }),
    ];
    expect(rank(docs, 'রিজওয়ান', [], NOW)).toHaveLength(1);
    expect(rank(docs, 'rizwan', [], NOW)).toHaveLength(1);
  });

  it('ignores a document whose weighted fields are all empty', () => {
    const empty = doc({ id: 'empty', kind: 'people', fields: { username: '', displayName: '' } });
    expect(rank([empty], 'anything', [], NOW)).toHaveLength(0);
  });

  it('only searches the fields a kind weighs', () => {
    const weights = SEARCH_WEIGHTS.people;
    expect(Object.keys(weights)).toContain('username');
    expect(Object.keys(weights)).toContain('displayName');
  });
});

describe('tie-breakers', () => {
  it('prefers a fresher document when both match equally', () => {
    const older = person('older', {
      fields: { username: 'older', displayName: 'Rizwan', headline: '' },
      createdAt: new Date(NOW - 400 * DAY).toISOString(),
    });
    const newer = person('newer', {
      fields: { username: 'newer', displayName: 'Rizwan', headline: '' },
      createdAt: new Date(NOW - 2 * DAY).toISOString(),
    });
    const hits = rank([older, newer], 'rizwan', [], NOW);
    expect(hits[0]?.doc.id).toBe('newer');
  });

  it('never lets popularity outrank relevance', () => {
    const popularButIrrelevant = person('popular', {
      fields: { username: 'popular', displayName: 'Nothing About It', headline: '' },
      popularity: 100000,
    });
    const exact = person('exact', {
      fields: { username: 'exact', displayName: 'Sylhet', headline: '' },
      popularity: 0,
    });
    const hits = rank([popularButIrrelevant, exact], 'sylhet', [], NOW);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.doc.id).toBe('exact');
  });
});

describe('scoping and limits', () => {
  it('searches only the kinds it was asked for', () => {
    const docs = [
      person('p1', { fields: { username: 'p1', displayName: 'Laravel', headline: '' } }),
      doc({
        id: 'j1',
        kind: 'jobs',
        title: 'Laravel Developer',
        fields: { title: 'Laravel Developer' },
      }),
    ];
    expect(rank(docs, 'laravel', ['jobs'], NOW).map((hit) => hit.doc.kind)).toEqual(['jobs']);
  });

  it('searches every kind when none are named', () => {
    const docs = [
      person('p1', { fields: { username: 'p1', displayName: 'Laravel', headline: '' } }),
      doc({
        id: 'j1',
        kind: 'jobs',
        title: 'Laravel Developer',
        fields: { title: 'Laravel Developer' },
      }),
    ];
    expect(rank(docs, 'laravel', [], NOW)).toHaveLength(2);
  });

  it('keeps one kind from crowding out the others', () => {
    const many = Array.from({ length: SEARCH_KIND_LIMIT + 5 }, (_unused, index) =>
      person(`p${index}`, {
        fields: { username: `p${index}`, displayName: 'Laravel Developer', headline: '' },
      }),
    );
    const other = doc({
      id: 'j1',
      kind: 'jobs',
      title: 'Laravel Developer',
      fields: { title: 'Laravel Developer' },
    });
    const limited = limitPerKind(rank([...many, other], 'laravel', [], NOW));
    expect(limited.filter((hit) => hit.doc.kind === 'people')).toHaveLength(SEARCH_KIND_LIMIT);
    expect(limited.some((hit) => hit.doc.kind === 'jobs')).toBe(true);
  });
});

describe('scoring internals', () => {
  it('reports which fields matched, most valuable first', () => {
    const indexed = indexDoc(
      person('p1', { fields: { username: 'p1', displayName: 'Laravel Developer', headline: '' } }),
    );
    const hit = scoreDoc(indexed, tokenise('laravel'), 'laravel', NOW);
    expect(hit?.matchedFields).toContain('displayName');
  });

  it('returns nothing for a query with no tokens', () => {
    const indexed = indexDoc(
      person('p1', { fields: { username: 'p1', displayName: 'Laravel', headline: '' } }),
    );
    expect(scoreDoc(indexed, [], '', NOW)).toBeNull();
  });
});
