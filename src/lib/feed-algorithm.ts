/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import type { Post } from '@/types/post';
import type { UserProfile } from '@/types/user';
import { geoBoost, type GeoPoint } from './geo';

/**
 * BSDC personalized ranking algorithm — weighted scoring computed over REAL data only.
 *
 * 1. Recency (30%)        — decay: 1 / (hours + 2)^1.5
 * 2. Engagement (25%)     — reactions*2 + comments*3 + shares*5 + bookmarks*1, normalized
 * 3. Author authority 15% — followers, posts, points, verification, creator multipliers
 * 4. Relevance (15%)      — tag/skill/content-type affinity from user profile
 * 5. Social proximity 10% — following x3, follow-of-follow x1.5, same group x2
 * 6. Location (5%)        — same city x1.2, same country x1.1
 */

export interface FeedContext {
  viewer: UserProfile | null;
  followingIds: Set<string>;
  followedTags: string[];
  groupIds: Set<string>;
  secondDegreeIds: Set<string>;
  engagedTypes: Partial<Record<string, number>>;
  platformAvgEngagement: number;
}

export interface ScoredPost {
  post: Post;
  score: number;
}

export function recencyScore(post: Post, now = Date.now()): number {
  const hours = Math.max(0, (now - (post.publishedAt || post.createdAt)) / 3_600_000);
  return 1 / Math.pow(hours + 2, 1.5);
}

export function engagementScore(post: Post, platformAvg: number): number {
  const raw = post.reactionTotal * 2 + post.commentCount * 3 + post.shareCount * 5 + post.bookmarkCount * 1;
  const avg = Math.max(platformAvg, 1);
  return Math.min(5, raw / avg);
}

export function authorityScore(_post: Post, author?: UserProfile | null): number {
  if (!author) return 1;
  let score = 1 + Math.log10(author.followerCount + 10) + Math.log10(author.postCount + 10) + Math.log10(author.bsdcPoints + 10) / 2;
  if (author.isVerified) score *= 1.5;
  if (author.isCreator) score *= 2;
  return Math.min(10, score / 3);
}

export function relevanceScore(post: Post, ctx: FeedContext): number {
  const viewer = ctx.viewer;
  if (!viewer) return 1;
  const tagSet = new Set(post.tags.map((t) => t.toLowerCase()));
  const skillSet = new Set(viewer.skills.map((s) => s.toLowerCase()));
  let matchedTags = 0;
  let skillMatches = 0;
  for (const t of tagSet) {
    if (ctx.followedTags.includes(t)) matchedTags += 1;
    if (skillSet.has(t)) skillMatches += 1;
  }
  const typeAffinity = ctx.engagedTypes[post.type] || 0;
  return 1 + matchedTags * 1.5 + skillMatches * 1.2 + Math.min(2, typeAffinity / 5);
}

export function proximityScore(post: Post, ctx: FeedContext): number {
  let score = 1;
  if (ctx.followingIds.has(post.authorId)) score *= 3;
  else if (ctx.secondDegreeIds.has(post.authorId)) score *= 1.5;
  if (post.groupId && ctx.groupIds.has(post.groupId)) score *= 2;
  return Math.min(6, score);
}

export interface AuthorGeoInfo {
  location: string;
  geo: GeoPoint | null;
}

export function locationScore(post: Post, viewer: UserProfile | null, authorGeo: Map<string, AuthorGeoInfo>): number {
  if (!viewer) return 1;
  const info = authorGeo.get(post.authorId);
  if (!info) return 1;
  return geoBoost(viewer.geo, viewer.location, info.geo, info.location);
}

export const FEED_WEIGHTS = {
  recency: 0.3,
  engagement: 0.25,
  authority: 0.15,
  relevance: 0.15,
  proximity: 0.1,
  location: 0.05,
} as const;

export function scorePost(
  post: Post,
  ctx: FeedContext,
  author?: UserProfile | null,
  authorLocations?: Map<string, AuthorGeoInfo>,
  now = Date.now(),
): number {
  const s =
    FEED_WEIGHTS.recency * recencyScore(post, now) +
    FEED_WEIGHTS.engagement * engagementScore(post, ctx.platformAvgEngagement) +
    FEED_WEIGHTS.authority * authorityScore(post, author) +
    FEED_WEIGHTS.relevance * relevanceScore(post, ctx) +
    FEED_WEIGHTS.proximity * proximityScore(post, ctx) +
    FEED_WEIGHTS.location * locationScore(post, ctx.viewer, authorLocations || new Map());
  let total = s;
  if (post.pinned) total += 5;
  if (post.featured) total += 3;
  if (post.type === 'notice' && post.notice?.priority === 'urgent') total += 2;
  return total;
}

export function rankFeed(posts: Post[], ctx: FeedContext, authors: Map<string, UserProfile>): ScoredPost[] {
  const authorGeo = new Map<string, AuthorGeoInfo>(
    [...authors.entries()].map(([id, u]) => [id, { location: u.location, geo: u.geo }]),
  );
  return posts
    .map((post) => ({ post, score: scorePost(post, ctx, authors.get(post.authorId), authorGeo) }))
    .sort((a, b) => b.score - a.score);
}

export function platformAverageEngagement(posts: Post[]): number {
  if (posts.length === 0) return 1;
  const total = posts.reduce(
    (sum, p) => sum + p.reactionTotal * 2 + p.commentCount * 3 + p.shareCount * 5 + p.bookmarkCount,
    0,
  );
  return total / posts.length;
}

/**
 * Trending velocity: engagement gained per hour since publish, capped to a recent window.
 * Real data only — an empty platform yields an empty trending list.
 */
export function trendingScores(posts: Post[], windowMs: number, now = Date.now()): ScoredPost[] {
  const cutoff = now - windowMs;
  return posts
    .filter((p) => (p.publishedAt || p.createdAt) >= cutoff)
    .map((post) => {
      const ageHours = Math.max(0.5, (now - (post.publishedAt || post.createdAt)) / 3_600_000);
      const engagement = post.reactionTotal * 2 + post.commentCount * 3 + post.shareCount * 5 + post.bookmarkCount;
      const velocity = engagement / Math.pow(ageHours + 1, 1.2);
      const grace = 1 / Math.pow(ageHours + 2, 0.5);
      return { post, score: velocity * grace };
    })
    .sort((a, b) => b.score - a.score);
}

export function trendingTags(posts: Post[], windowMs: number, limit = 10, now = Date.now()): { tag: string; count: number }[] {
  const cutoff = now - windowMs;
  const counts = new Map<string, number>();
  for (const p of posts) {
    if ((p.publishedAt || p.createdAt) < cutoff) continue;
    for (const t of p.tags) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}

export interface SuggestedUser {
  user: UserProfile;
  reason: string;
  mutualCount: number;
}

/** "Who to follow" computed from mutuals, shared skills, and location similarity. Real data only. */
export function suggestUsers(
  candidates: UserProfile[],
  viewer: UserProfile,
  followingIds: Set<string>,
  followersOfViewer: Set<string>,
  limit = 5,
): SuggestedUser[] {
  const scored = candidates
    .filter((c) => c.uid !== viewer.uid && !followingIds.has(c.uid) && c.role !== 'banned')
    .map((c) => {
      let score = 0;
      let mutualCount = 0;
      if (followersOfViewer.has(c.uid)) {
        score += 2;
        mutualCount += 1;
      }
      const sharedSkills = c.skills.filter((s) => viewer.skills.includes(s)).length;
      score += sharedSkills * 1.5;
      const sameLocation = c.location && viewer.location && c.location.split(',')[0] === viewer.location.split(',')[0];
      if (sameLocation) score += 1;
      score += Math.min(2, Math.log10(c.bsdcPoints + 10));
      if (c.isVerified) score += 0.5;
      const reason = sharedSkills > 0 ? 'Shares your skills' : sameLocation ? 'Near you' : mutualCount > 0 ? 'Follows you' : 'Active member';
      return { user: c, score, reason, mutualCount };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
