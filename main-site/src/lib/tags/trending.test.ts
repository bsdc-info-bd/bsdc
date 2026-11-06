import { describe, expect, it } from 'vitest';
import {
  TRENDING_LIMIT,
  TRENDING_QUERY,
  rankTags,
  tagLabel,
  tagPath,
  type TagRow,
} from '@/lib/tags/trending';

/**
 * The tag rail's ordering, pinned.
 *
 * A tag cloud is the cheapest thing on a developer feed and the easiest to get
 * wrong: by insertion order it is noise, by absolute count it is the same five
 * tags forever, and unfiltered it shows tags typed once by accident. These are the
 * properties that make it a ranking rather than a list.
 */

const tag = (slug: string, posts_count: number, extra: Partial<TagRow> = {}): TagRow => ({
  slug,
  label_en: slug,
  label_bn: '',
  posts_count,
  ...extra,
});

const NOW = Date.parse('2026-11-06T12:00:00.000Z');

describe('the label a reader sees', () => {
  it('prefers the reader’s own language', () => {
    const row = tag('react', 3, { label_en: 'React', label_bn: 'রিঅ্যাক্ট' });
    expect(tagLabel(row, 'bn')).toBe('রিঅ্যাক্ট');
    expect(tagLabel(row, 'en')).toBe('React');
  });

  it('falls back rather than showing an empty tag', () => {
    expect(tagLabel(tag('react', 3, { label_en: 'React' }), 'bn')).toBe('React');
    expect(tagLabel(tag('react', 3, { label_en: '', label_bn: 'রিঅ্যাক্ট' }), 'en')).toBe(
      'রিঅ্যাক্ট',
    );
    expect(tagLabel(tag('react', 3, { label_en: '', label_bn: '' }), 'bn')).toBe('react');
  });
});

describe('the order tags appear in', () => {
  it('puts the most used first', () => {
    const ranked = rankTags([tag('a', 1), tag('b', 40), tag('c', 7)], 'en', 5, NOW);
    expect(ranked.map((entry) => entry.slug)).toEqual(['b', 'c', 'a']);
  });

  it('prefers a tag that is being used now over one that was popular once', () => {
    const ranked = rankTags(
      [
        tag('legacy', 100, { last_used: '2024-01-01T00:00:00.000Z' }),
        tag('live', 60, { last_used: '2026-11-05T00:00:00.000Z' }),
      ],
      'en',
      5,
      NOW,
    );
    // 60 x 2 beats 100 x 1: that is what "trending" means.
    expect(ranked[0]?.slug).toBe('live');
    expect(ranked[0]?.fresh).toBe(true);
    expect(ranked[1]?.fresh).toBe(false);
  });

  it('breaks a tie by name, so the list does not reorder itself between renders', () => {
    const ranked = rankTags([tag('zeta', 5), tag('alpha', 5)], 'en', 5, NOW);
    expect(ranked.map((entry) => entry.slug)).toEqual(['alpha', 'zeta']);
  });

  it('drops a tag nobody has posted under, and one with no slug', () => {
    const ranked = rankTags([tag('empty', 0), tag('  ', 4), tag('real', 1)], 'en', 5, NOW);
    expect(ranked.map((entry) => entry.slug)).toEqual(['real']);
  });

  it('never returns more than the limit, and asks for the default five', () => {
    const many = Array.from({ length: 20 }, (_, index) => tag(`t${String(index)}`, index + 1));
    expect(rankTags(many, 'en', 5, NOW)).toHaveLength(5);
    expect(rankTags(many, 'en', undefined, NOW)).toHaveLength(TRENDING_LIMIT);
    expect(rankTags(many, 'en', 0, NOW)).toHaveLength(0);
  });

  it('weights the bar from the leader, so the drawing has a scale', () => {
    const ranked = rankTags([tag('top', 10), tag('half', 5)], 'en', 5, NOW);
    expect(ranked[0]?.weight).toBe(1);
    expect(ranked[1]?.weight).toBe(0.5);
  });

  it('treats an unreadable date as old, not as new', () => {
    const ranked = rankTags([tag('broken', 1, { last_used: 'not a date' })], 'en', 5, NOW);
    expect(ranked[0]?.fresh).toBe(false);
  });
});

describe('the address a tag lives at', () => {
  it('is the encoded slug', () => {
    expect(tagPath('react')).toBe('/tag/react');
    expect(tagPath('  React  ')).toBe('/tag/react');
    expect(tagPath('প্রোগ্রামিং')).toBe(`/tag/${encodeURIComponent('প্রোগ্রামিং')}`);
  });

  it('falls back to the tag index rather than building an empty path', () => {
    expect(tagPath('')).toBe('/tag');
  });
});

describe('the query the rail runs', () => {
  it('asks only for tags with posts, and asks for more than it shows', () => {
    // Three times the shown number, so the freshness boost can promote a tag that
    // is not in the raw top five.
    expect(TRENDING_QUERY).toContain('posts_count=gt.0');
    expect(TRENDING_QUERY).toContain(`limit=${String(TRENDING_LIMIT * 3)}`);
    expect(TRENDING_QUERY).toContain('order=posts_count.desc');
  });
});
