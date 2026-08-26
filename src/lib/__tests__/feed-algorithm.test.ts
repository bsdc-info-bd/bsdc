/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { describe, expect, it } from 'vitest';
import {
  engagementScore, platformAverageEngagement, rankFeed, recencyScore, suggestUsers,
  trendingScores, trendingTags, type FeedContext,
} from '../feed-algorithm';
import type { Post } from '@/types/post';
import type { UserProfile } from '@/types/user';

export function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    slug: 'test-post',
    type: 'text',
    authorId: 'u1',
    authorName: 'A',
    authorUsername: 'a',
    authorAvatar: '',
    authorVerified: false,
    authorRole: 'user',
    createdAt: Date.now() - 3_600_000,
    updatedAt: Date.now(),
    title: 'Test',
    body: 'Test body',
    images: [],
    tags: [],
    visibility: 'public',
    status: 'published',
    groupId: null,
    groupName: null,
    pinned: false,
    featured: false,
    publishedAt: Date.now() - 3_600_000,
    scheduledAt: null,
    reactionCounts: {},
    reactionTotal: 0,
    commentCount: 0,
    viewCount: 0,
    shareCount: 0,
    bookmarkCount: 0,
    readingMinutes: 1,
    seoTitle: '',
    seoDescription: '',
    canonicalUrl: '',
    edited: false,
    deleted: false,
    poll: null,
    job: null,
    project: null,
    snippet: null,
    notice: null,
    wikiRevisions: [],
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u1',
    uid: 'u1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    email: 'u1@bsdc.dev',
    username: 'a',
    displayName: 'A',
    avatar: '',
    isVerified: false,
    coverPhoto: '',
    bio: '',
    bioTitle: '',
    location: '',
    geo: null,
    website: '',
    github: '',
    linkedin: '',
    twitter: '',
    skills: [],
    education: '',
    work: '',
    joinedAt: Date.now(),
    lastActive: Date.now(),
    role: 'user',
    isCreator: false,
    followerCount: 0,
    followingCount: 0,
    postCount: 0,
    bsdcPoints: 0,
    language: 'en',
    theme: 'light',
    isOnline: false,
    emailVerified: true,
    creatorProgramStatus: 'none',
    softwareLicenses: [],
    profileCompleted: false,
    onboardingStep: 0,
    provider: 'password',
    streak: 0,
    lastLoginDay: '',
    ...overrides,
  };
}

const emptyCtx: FeedContext = {
  viewer: makeUser(),
  followingIds: new Set(),
  followedTags: [],
  groupIds: new Set(),
  secondDegreeIds: new Set(),
  engagedTypes: {},
  platformAvgEngagement: 1,
};

describe('recencyScore', () => {
  it('decays with time per 1/(h+2)^1.5', () => {
    const fresh = recencyScore(makePost({ publishedAt: Date.now() }));
    const old = recencyScore(makePost({ publishedAt: Date.now() - 100 * 3_600_000 }));
    expect(fresh).toBeCloseTo(0.3536, 3);
    expect(old).toBeLessThan(0.01);
    expect(fresh).toBeGreaterThan(old);
  });
});

describe('engagementScore', () => {
  it('weights reactions 2x, comments 3x, shares 5x, bookmarks 1x, capped vs platform avg', () => {
    const post = makePost({ reactionTotal: 10, commentCount: 10, shareCount: 10, bookmarkCount: 10 });
    const raw = 10 * 2 + 10 * 3 + 10 * 5 + 10;
    expect(engagementScore(post, raw / 2)).toBe(2); // twice the platform average
    expect(engagementScore(post, 1)).toBe(5); // capped at 5x
  });
  it('caps at 5x platform average', () => {
    expect(engagementScore(makePost({ reactionTotal: 10000 }), 1)).toBe(5);
  });
});

describe('rankFeed', () => {
  it('ranks pinned posts first even when old', () => {
    const pinnedOld = makePost({ id: 'pinned', pinned: true, publishedAt: Date.now() - 90 * 3_600_000 });
    const fresh = makePost({ id: 'fresh', publishedAt: Date.now() });
    const ranked = rankFeed([fresh, pinnedOld], emptyCtx, new Map());
    expect(ranked[0].post.id).toBe('pinned');
  });
  it('boosts followed authors via proximity', () => {
    const followed = makePost({ id: 'followed', authorId: 'u9' });
    const other = makePost({ id: 'other', authorId: 'u8' });
    const ctx: FeedContext = { ...emptyCtx, followingIds: new Set(['u9']) };
    const ranked = rankFeed([other, followed], ctx, new Map());
    expect(ranked[0].post.id).toBe('followed');
  });
});

describe('trending', () => {
  it('excludes posts outside the window', () => {
    const old = makePost({ id: 'old', publishedAt: Date.now() - 48 * 3_600_000, reactionTotal: 999 });
    const hot = makePost({ id: 'hot', publishedAt: Date.now() - 3_600_000, reactionTotal: 10 });
    const result = trendingScores([old, hot], 24 * 3_600_000);
    expect(result.map((r) => r.post.id)).toEqual(['hot']);
  });
  it('computes trending tags from recent posts only', () => {
    const recent = makePost({ tags: ['react', 'firebase'] });
    const stale = makePost({ tags: ['cobol'], publishedAt: Date.now() - 10 * 24 * 3_600_000 });
    const tags = trendingTags([recent, stale], 7 * 24 * 3_600_000);
    expect(tags.map((t) => t.tag)).toContain('react');
    expect(tags.map((t) => t.tag)).not.toContain('cobol');
  });
});

describe('platformAverageEngagement', () => {
  it('returns 1 for empty platform (no div by zero)', () => {
    expect(platformAverageEngagement([])).toBe(1);
  });
});

describe('suggestUsers', () => {
  it('never suggests self, already-followed or banned users', () => {
    const viewer = makeUser({ uid: 'me', skills: ['react'] });
    const candidates = [
      makeUser({ uid: 'me', username: 'me', displayName: 'Me' }),
      makeUser({ uid: 'followed', username: 'followed', displayName: 'Followed' }),
      makeUser({ uid: 'banned', username: 'banned', displayName: 'Banned', role: 'banned' }),
      makeUser({ uid: 'ok', username: 'ok', displayName: 'OK', skills: ['react'] }),
    ];
    const suggestions = suggestUsers(candidates, viewer, new Set(['followed']), new Set(), 5);
    expect(suggestions.map((s) => s.user.uid)).toEqual(['ok']);
    expect(suggestions[0].reason).toBe('Shares your skills');
  });
});
