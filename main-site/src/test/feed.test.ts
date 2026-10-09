import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEED_PREFERENCES,
  affinityScore,
  diversify,
  emptyReason,
  explainFiltering,
  filterCandidates,
  mergePages,
  qualityScore,
  rankFeed,
  rankFeedWithReport,
  recencyScore,
  scoreCandidate,
  type FeedCandidate,
  type FeedPreferences,
  type ScoredCandidate,
} from '@/lib/feed/ranking';

const NOW = Date.parse('2026-10-01T12:00:00.000Z');

function hoursAgo(hours: number): string {
  return new Date(NOW - hours * 3_600_000).toISOString();
}

function candidate(overrides: Partial<FeedCandidate> = {}): FeedCandidate {
  return {
    postId: 'post-1',
    authorUid: 'author-1',
    publishedAt: hoursAgo(1),
    likes: 0,
    comments: 0,
    views: 10,
    language: 'bn',
    isSensitive: false,
    kind: 'discussion',
    authorFollowed: false,
    affinity: 0,
    alreadySeen: false,
    tags: [],
    ...overrides,
  };
}

const prefs: FeedPreferences = { ...DEFAULT_FEED_PREFERENCES, languages: ['bn', 'en'] };

describe('stage 3 scoring primitives', () => {
  it('decays recency by half every six hours', () => {
    expect(recencyScore(hoursAgo(0), NOW)).toBeCloseTo(1, 5);
    expect(recencyScore(hoursAgo(6), NOW)).toBeCloseTo(0.5, 5);
    expect(recencyScore(hoursAgo(12), NOW)).toBeCloseTo(0.25, 5);
  });

  it('never returns a negative recency for a future timestamp', () => {
    expect(recencyScore(new Date(NOW + 60_000).toISOString(), NOW)).toBe(1);
  });

  it('rewards conversation more than likes', () => {
    const liked = qualityScore(candidate({ likes: 20, views: 100 }));
    const discussed = qualityScore(candidate({ comments: 20, views: 100 }));
    expect(discussed).toBeGreaterThan(liked);
  });

  it('keeps quality within the unit interval', () => {
    const huge = qualityScore(candidate({ likes: 90_000, comments: 50_000, views: 1 }));
    expect(huge).toBeLessThanOrEqual(1);
    expect(qualityScore(candidate())).toBe(0);
  });

  it('caps affinity at thirty points', () => {
    expect(affinityScore(candidate({ affinity: 15 }))).toBeCloseTo(0.5, 5);
    expect(affinityScore(candidate({ affinity: 400 }))).toBe(1);
  });
});

describe('stage 2 filtering', () => {
  it('drops muted tags regardless of letter case', () => {
    const result = filterCandidates(
      [candidate({ tags: ['React'] })],
      { ...prefs, mutedTags: ['react'] },
      'viewer',
    );
    expect(result).toHaveLength(0);
  });

  it('hides sensitive posts unless the member opted in', () => {
    const list = [candidate({ isSensitive: true })];
    expect(filterCandidates(list, prefs, 'viewer')).toHaveLength(0);
    expect(filterCandidates(list, { ...prefs, showSensitive: true }, 'viewer')).toHaveLength(1);
  });

  it('filters by language', () => {
    const result = filterCandidates(
      [candidate({ language: 'en' })],
      { ...prefs, languages: ['bn'] },
      'viewer',
    );
    expect(result).toHaveLength(0);
  });

  it('keeps the viewer own post even when it would be filtered out', () => {
    const mine = candidate({ authorUid: 'viewer', isSensitive: true, language: 'fr' });
    expect(filterCandidates([mine], prefs, 'viewer')).toHaveLength(1);
  });

  it('restricts the following algorithm to followed authors', () => {
    const list = [candidate({ postId: 'a' }), candidate({ postId: 'b', authorFollowed: true })];
    const result = filterCandidates(list, { ...prefs, algorithm: 'following' }, 'viewer');
    expect(result.map((item) => item.postId)).toEqual(['b']);
  });

  it('hides seen posts but never in the latest tab', () => {
    const list = [candidate({ alreadySeen: true })];
    expect(filterCandidates(list, { ...prefs, hideSeen: true }, 'viewer')).toHaveLength(0);
    expect(
      filterCandidates(list, { ...prefs, hideSeen: true, algorithm: 'latest' }, 'viewer'),
    ).toHaveLength(1);
  });
});

describe('stage 3 scoring', () => {
  it('ranks a followed author above an identical stranger', () => {
    const followed = scoreCandidate(candidate({ authorFollowed: true }), prefs, NOW);
    const stranger = scoreCandidate(candidate(), prefs, NOW);
    expect(followed.score).toBeGreaterThan(stranger.score);
    expect(followed.reasons).toContain('following');
  });

  it('explains why a post scored well', () => {
    const scored = scoreCandidate(
      candidate({ affinity: 20, likes: 120, comments: 40, views: 300 }),
      prefs,
      NOW,
    );
    expect(scored.reasons).toEqual(
      expect.arrayContaining(['topic', 'popular', 'fresh', 'language']),
    );
  });

  it('penalises posts that were already shown', () => {
    const fresh = scoreCandidate(candidate(), prefs, NOW);
    const seen = scoreCandidate(candidate({ alreadySeen: true }), prefs, NOW);
    expect(seen.score).toBeLessThan(fresh.score);
  });
});

describe('stage 4 diversity', () => {
  function scored(id: string, author: string, score: number, tags: string[] = []): ScoredCandidate {
    return { ...candidate({ postId: id, authorUid: author, tags }), score, reasons: [] };
  }

  it('pushes a third post from the same author behind other authors', () => {
    const result = diversify([
      scored('a1', 'alpha', 100),
      scored('a2', 'alpha', 99),
      scored('a3', 'alpha', 98),
      scored('b1', 'beta', 10),
    ]);
    expect(result.map((item) => item.postId)).toEqual(['a1', 'a2', 'b1', 'a3']);
  });

  it('never loses a candidate', () => {
    const input = [
      scored('a1', 'alpha', 5, ['react']),
      scored('a2', 'beta', 4, ['react']),
      scored('a3', 'gamma', 3, ['react']),
      scored('a4', 'delta', 2, ['react']),
    ];
    expect(diversify(input)).toHaveLength(4);
  });

  it('is deterministic when two posts tie', () => {
    const a = diversify([scored('z', 'one', 5), scored('a', 'two', 5)]);
    const b = diversify([scored('a', 'two', 5), scored('z', 'one', 5)]);
    expect(a.map((item) => item.postId)).toEqual(b.map((item) => item.postId));
  });
});

describe('rankFeed', () => {
  it('orders the latest tab strictly by publication time', () => {
    const result = rankFeed(
      [
        candidate({ postId: 'old', publishedAt: hoursAgo(40), likes: 900 }),
        candidate({ postId: 'new', authorUid: 'b', publishedAt: hoursAgo(1) }),
      ],
      { ...prefs, algorithm: 'latest' },
      'viewer',
      NOW,
    );
    expect(result.map((item) => item.postId)).toEqual(['new', 'old']);
  });

  it('prefers a followed, on-topic post over an older popular one', () => {
    const result = rankFeed(
      [
        candidate({ postId: 'popular', authorUid: 'a', publishedAt: hoursAgo(30), likes: 500 }),
        candidate({
          postId: 'relevant',
          authorUid: 'b',
          publishedAt: hoursAgo(2),
          authorFollowed: true,
          affinity: 25,
        }),
      ],
      prefs,
      'viewer',
      NOW,
    );
    expect(result[0]?.postId).toBe('relevant');
  });

  it('de-duplicates overlapping pages', () => {
    const page = rankFeed([candidate()], prefs, 'viewer', NOW);
    expect(mergePages([page, page])).toHaveLength(1);
  });
});

describe('an empty feed explains itself', () => {
  const seen = [
    candidate({ postId: 'p1', alreadySeen: true }),
    candidate({ postId: 'p2', alreadySeen: true }),
  ];

  it('counts what each rule removed, and keeps the rest', () => {
    const report = explainFiltering(
      [
        candidate({ postId: 'kept' }),
        candidate({ postId: 's1', alreadySeen: true }),
        candidate({ postId: 's2', isSensitive: true }),
        candidate({ postId: 's3', language: 'hi' }),
        candidate({ postId: 's4', tags: ['muted-tag'] }),
      ],
      { ...prefs, mutedTags: ['muted-tag'] },
      null,
    );
    expect(report.considered).toBe(5);
    expect(report.kept.map((item) => item.postId)).toEqual(['kept']);
    expect(report.removed).toEqual({ seen: 1, sensitive: 1, muted: 1, language: 1, following: 0 });
  });

  it('says "caught up" when reading everything is the only reason', () => {
    const { ranked, report } = rankFeedWithReport(seen, prefs, null, NOW);
    expect(ranked).toHaveLength(0);
    expect(emptyReason(report, ranked.length)).toBe('all-seen');
  });

  it('says "nothing" when no candidate arrived at all', () => {
    const { ranked, report } = rankFeedWithReport([], prefs, null, NOW);
    expect(emptyReason(report, ranked.length)).toBe('nothing');
  });

  it('says "preferences" when a language or a mute emptied the feed', () => {
    const language = rankFeedWithReport(
      [candidate({ postId: 'p1', language: 'hi' })],
      prefs,
      null,
      NOW,
    );
    expect(emptyReason(language.report, language.ranked.length)).toBe('preferences');

    const mixed = rankFeedWithReport(
      [candidate({ postId: 'p1', alreadySeen: true }), candidate({ postId: 'p2', language: 'hi' })],
      prefs,
      null,
      NOW,
    );
    expect(emptyReason(mixed.report, mixed.ranked.length)).toBe('preferences');
  });

  it('is not empty when something survived, whatever else was removed', () => {
    const { ranked, report } = rankFeedWithReport(
      [...seen, candidate({ postId: 'fresh' })],
      prefs,
      null,
      NOW,
    );
    expect(ranked.map((item) => item.postId)).toEqual(['fresh']);
    expect(emptyReason(report, ranked.length)).toBe('none');
  });

  it('brings the read posts back when hideSeen is turned off', () => {
    const { ranked } = rankFeedWithReport(seen, { ...prefs, hideSeen: false }, null, NOW);
    expect(ranked).toHaveLength(2);
    // They still sink below anything unread: the seen penalty is in the score.
    const mixed = rankFeedWithReport(
      [...seen, candidate({ postId: 'fresh', publishedAt: hoursAgo(48) })],
      { ...prefs, hideSeen: false },
      null,
      NOW,
    );
    expect(mixed.ranked[0]?.postId).toBe('p1');
    expect(mixed.ranked.map((item) => item.postId)).toContain('fresh');
  });

  it('keeps your own post even when you have read it and muted its tag', () => {
    const report = explainFiltering(
      [candidate({ postId: 'mine', authorUid: 'me', alreadySeen: true, tags: ['muted-tag'] })],
      { ...prefs, mutedTags: ['muted-tag'] },
      'me',
    );
    expect(report.kept).toHaveLength(1);
  });

  it('filterCandidates still returns exactly what explainFiltering kept', () => {
    const mixed = [candidate({ postId: 'a' }), candidate({ postId: 'b', alreadySeen: true })];
    expect(filterCandidates(mixed, prefs, null).map((item) => item.postId)).toEqual(
      explainFiltering(mixed, prefs, null).kept.map((item) => item.postId),
    );
  });

  it('rankFeed and rankFeedWithReport agree on the ordering', () => {
    const mixed = [
      candidate({ postId: 'a' }),
      candidate({ postId: 'b', likes: 40 }),
      candidate({ postId: 'c', publishedAt: hoursAgo(30) }),
    ];
    expect(rankFeed(mixed, prefs, null, NOW).map((item) => item.postId)).toEqual(
      rankFeedWithReport(mixed, prefs, null, NOW).ranked.map((item) => item.postId),
    );
  });
});
