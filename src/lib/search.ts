/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * BSDC Smart Search.
 *
 * Architecture:
 *   1. FlexSearch Document indexes generate fuzzy candidates quickly (prefix + forward tokens).
 *   2. A transparent ranker re-scores every candidate with real signals:
 *        match quality (exact > prefix > contains > fuzzy/typo via Levenshtein ≤ 2)
 *        × field weight (username > display name > skills > tags > title > body)
 *        × popularity (followers / reactions / views, log-scaled)
 *        × recency decay
 *        × personalization (viewer's tag affinity, skills, follows, geo proximity)
 *   3. Results are grouped (users / tags / posts / groups) with highlight ranges and
 *      human-readable "why" reasons.
 *
 * The index is built from real Firestore data (posts, users, groups, tags), rebuilt on
 * demand with retry/backoff, and invalidated when data changes.
 */
import FlexSearch from 'flexsearch';
import type { Post } from '@/types/post';
import type { UserProfile } from '@/types/user';
import type { Group } from '@/types/domain';
import type { GeoPoint } from './geo';
import { geoBoost } from './geo';
import { useAuthStore } from '@/stores/authStore';

export type SearchCategory = 'all' | 'posts' | 'users' | 'tags' | 'groups' | 'jobs' | 'snippets';

export interface SearchHit {
  kind: 'post' | 'user' | 'tag' | 'group';
  id: string;
  title: string;
  subtitle: string;
  image: string;
  url: string;
  score: number;
  reason: string;
  highlight: [number, number][]; // ranges in `title` to emphasize
}

export interface SearcherContext {
  viewerTags: string[];
  viewerSkills: string[];
  viewerFollowing: Set<string>;
  viewerGeo: GeoPoint | null;
  viewerLocation: string;
}

interface PostDoc {
  id: string;
  title: string;
  body: string;
  tags: string;
  author: string;
  authorId: string;
}

interface UserDoc {
  id: string;
  displayName: string;
  username: string;
  bioTitle: string;
  skills: string;
}

interface GroupDoc {
  id: string;
  name: string;
  description: string;
}

type MinimalDocIndex = { search: (query: string, options?: Record<string, unknown>) => unknown };

const FIELD_WEIGHTS = {
  username: 120,
  displayName: 100,
  skills: 60,
  tags: 50,
  title: 45,
  name: 40,
  description: 12,
  body: 8,
  bioTitle: 30,
  author: 70,
} as const;

export function routeFor(type: string): string {
  switch (type) {
    case 'blog': return 'blog';
    case 'qa': return 'qa';
    case 'snippet': return 'snippet';
    case 'docs': return 'docs';
    case 'wiki': return 'wiki';
    case 'project': return 'project';
    case 'job': return 'job';
    case 'notice': return 'notice';
    default: return 'post';
  }
}

/** Levenshtein distance capped at `max` (early exit) for typo tolerance. */
export function levenshtein(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

export type MatchQuality = 'exact' | 'prefix' | 'contains' | 'fuzzy' | 'none';

/** Where and how well did the query match? */
export function matchInfo(query: string, target: string): { quality: MatchQuality; ratio: number } {
  if (!query) return { quality: 'none', ratio: 0 };
  const q = query.toLowerCase();
  const t = (target || '').toLowerCase();
  if (!t) return { quality: 'none', ratio: 0 };
  if (t === q) return { quality: 'exact', ratio: 1 };
  if (t.startsWith(q)) return { quality: 'prefix', ratio: 0.92 };
  // Word-prefix ("ra" matches "Rizwan Rahim") outranks a mid-string substring.
  const wordPrefix = t.split(/[\s._@-]+/).some((w) => w.startsWith(q));
  if (wordPrefix) return { quality: 'prefix', ratio: 0.85 };
  const idx = t.indexOf(q);
  if (idx >= 0) return { quality: 'contains', ratio: 0.75 - Math.min(0.2, idx * 0.01) };
  // Typo tolerance against whole short targets or words
  const words = t.split(/[\s._@-]+/).filter((w) => Math.abs(w.length - q.length) <= 2);
  const best = Math.min(levenshtein(q, t), ...words.map((w) => levenshtein(q, w)));
  if (best <= 1) return { quality: 'fuzzy', ratio: 0.55 };
  if (best === 2 && q.length >= 5) return { quality: 'fuzzy', ratio: 0.4 };
  return { quality: 'none', ratio: 0 };
}

function findHighlightRanges(query: string, title: string): [number, number][] {
  const ranges: [number, number][] = [];
  const lower = title.toLowerCase();
  const q = query.toLowerCase();
  let idx = lower.indexOf(q);
  if (idx === -1) {
    // fall back to first word prefix
    const firstWord = q.split(/\s+/)[0];
    if (firstWord) idx = lower.indexOf(firstWord);
  }
  if (idx >= 0) ranges.push([idx, idx + q.length]);
  return ranges;
}

export class SearchIndex {
  private posts = new FlexSearch.Document<PostDoc>({
    document: { id: 'id', index: ['title', 'body', 'tags', 'author'] },
    tokenize: 'forward',
    resolution: 9,
  });
  private users = new FlexSearch.Document<UserDoc>({
    document: { id: 'id', index: ['displayName', 'username', 'bioTitle', 'skills'] },
    tokenize: 'forward',
    resolution: 9,
  });
  private groups = new FlexSearch.Document<GroupDoc>({
    document: { id: 'id', index: ['name', 'description'] },
    tokenize: 'forward',
  });

  private postsById = new Map<string, Post>();
  private usersById = new Map<string, UserProfile>();
  private groupsById = new Map<string, Group & { id: string }>();
  private tagStats = new Map<string, { count: number; reactions: number }>();
  builtAt = 0;

  indexPosts(posts: Post[]): void {
    for (const p of posts) {
      this.postsById.set(p.id, p);
      const doc: PostDoc = {
        id: p.id,
        title: p.title || p.body.slice(0, 120),
        body: p.body.slice(0, 3000),
        tags: p.tags.join(' '),
        author: `${p.authorName} ${p.authorUsername}`,
        authorId: p.authorId,
      };
      this.posts.add(doc);
      for (const tag of p.tags) {
        const stat = this.tagStats.get(tag) || { count: 0, reactions: 0 };
        stat.count += 1;
        stat.reactions += p.reactionTotal;
        this.tagStats.set(tag, stat);
      }
    }
    this.builtAt = Date.now();
  }

  indexUsers(users: UserProfile[]): void {
    for (const u of users) {
      this.usersById.set(u.uid, u);
      this.users.add({
        id: u.uid,
        displayName: u.displayName,
        username: u.username,
        bioTitle: u.bioTitle,
        skills: u.skills.join(' '),
      });
    }
    this.builtAt = Date.now();
  }

  indexGroups(groups: (Group & { id: string })[]): void {
    for (const g of groups) {
      this.groupsById.set(g.id, g);
      this.groups.add({ id: g.id, name: g.name, description: g.description });
    }
    this.builtAt = Date.now();
  }

  /** Trending searches computed from real tag usage — no hardcoded strings. */
  trendingTags(limit = 6): { tag: string; count: number; reactions: number }[] {
    return [...this.tagStats.entries()]
      .map(([tag, s]) => ({ tag, ...s }))
      .sort((a, b) => b.count * 10 + b.reactions - (a.count * 10 + a.reactions))
      .slice(0, limit);
  }

  search(rawQuery: string, category: SearchCategory = 'all', ctx: SearcherContext | null = null, limit = 24): SearchHit[] {
    const q = rawQuery.trim();
    if (!q) return [];
    const hits: SearchHit[] = [];
    const now = Date.now();

    // ------------------------------------------------------------ users
    if (category === 'all' || category === 'users') {
      const candidates = this.candidates(this.users as unknown as MinimalDocIndex, q, Math.max(30, limit * 2));
      const seen = new Set<string>();
      for (const id of candidates) {
        const u = this.usersById.get(id);
        if (!u || seen.has(u.uid)) continue;
        seen.add(u.uid);
        const hitsInfo = [
          { weight: FIELD_WEIGHTS.username, ...matchInfo(q, u.username) },
          { weight: FIELD_WEIGHTS.displayName, ...matchInfo(q, u.displayName) },
          { weight: FIELD_WEIGHTS.skills, ...matchInfo(q, u.skills.join(' ')) },
        ].sort((a, b) => b.ratio * b.weight - a.ratio * a.weight)[0];
        if (hitsInfo.quality === 'none') continue;
        const popularity = 1 + Math.log10(u.followerCount + 2) + Math.log10(u.bsdcPoints + 10) / 2;
        const following = ctx?.viewerFollowing.has(u.uid) ? 1.3 : 1;
        const geo = geoBoost(ctx?.viewerGeo, ctx?.viewerLocation, u.geo, u.location);
        const skillMatch = ctx && u.skills.some((s) => ctx.viewerSkills.includes(s.toLowerCase())) ? 1.15 : 1;
        const score = hitsInfo.ratio * hitsInfo.weight * popularity * following * geo * skillMatch * (u.isVerified ? 1.1 : 1);
        const reasons: string[] = [];
        if (hitsInfo.quality === 'exact' || hitsInfo.quality === 'prefix') reasons.push(`@${u.username}`);
        if (ctx && skillMatch > 1) reasons.push('shares your skills');
        if (geo > 1.05) reasons.push('near you');
        if (following > 1) reasons.push('you follow');
        hits.push({
          kind: 'user',
          id: u.uid,
          title: u.displayName,
          subtitle: `@${u.username}${u.bioTitle ? ` · ${u.bioTitle}` : ''}`,
          image: u.avatar,
          url: `/p/${u.username}`,
          score,
          reason: reasons.join(' · '),
          highlight: findHighlightRanges(q, u.displayName),
        });
      }
    }

    // ------------------------------------------------------------- tags
    if (category === 'all' || category === 'tags') {
      const ql = q.replace(/^#/, '').toLowerCase();
      for (const [tag, stat] of this.tagStats) {
        const info = matchInfo(ql, tag);
        if (info.quality === 'none') continue;
        const affinity = ctx?.viewerTags.includes(tag) ? 1.4 : 1;
        hits.push({
          kind: 'tag',
          id: tag,
          title: `#${tag}`,
          subtitle: `${stat.count} post${stat.count === 1 ? '' : 's'}`,
          image: '',
          url: `/tag/${encodeURIComponent(tag)}`,
          score: info.ratio * FIELD_WEIGHTS.tags * (1 + Math.log10(stat.count + 1)) * affinity,
          reason: affinity > 1 ? 'you engage with this tag' : '',
          highlight: findHighlightRanges(ql, tag),
        });
      }
    }

    // ------------------------------------------------------------ posts
    const postCategories: SearchCategory[] = ['all', 'posts', 'jobs', 'snippets'];
    if (postCategories.includes(category)) {
      const candidates = this.candidates(this.posts as unknown as MinimalDocIndex, q, Math.max(40, limit * 3));
      const seen = new Set<string>();
      for (const id of candidates) {
        const p = this.postsById.get(id);
        if (!p || seen.has(p.id)) continue;
        seen.add(p.id);
        if (category === 'jobs' && p.type !== 'job') continue;
        if (category === 'snippets' && p.type !== 'snippet') continue;
        const info = [
          { weight: FIELD_WEIGHTS.title, ...matchInfo(q, p.title || '') },
          { weight: FIELD_WEIGHTS.tags, ...matchInfo(q, p.tags.join(' ')) },
          { weight: FIELD_WEIGHTS.author, ...matchInfo(q, p.authorName) },
          { weight: FIELD_WEIGHTS.body, ...matchInfo(q, p.body.slice(0, 200)) },
        ].sort((a, b) => b.ratio * b.weight - a.ratio * a.weight)[0];
        if (info.quality === 'none') continue;
        const popularity =
          1 + Math.log10(p.reactionTotal * 2 + p.commentCount * 3 + p.viewCount + 2);
        const ageDays = (now - (p.publishedAt || p.createdAt)) / 86_400_000;
        const recency = 1 + 1.5 / (ageDays + 3);
        const author = this.usersById.get(p.authorId);
        const following = ctx?.viewerFollowing.has(p.authorId) ? 1.35 : 1;
        const geo = geoBoost(ctx?.viewerGeo, ctx?.viewerLocation, author?.geo || null, author?.location);
        const tagAffinity = ctx && p.tags.some((tg) => ctx.viewerTags.includes(tg.toLowerCase())) ? 1.3 : 1;
        const score = info.ratio * info.weight * popularity * recency * following * geo * tagAffinity;
        const reasons: string[] = [];
        if (tagAffinity > 1) reasons.push('matches your interests');
        if (following > 1) reasons.push('author you follow');
        if (geo > 1.05) reasons.push('near you');
        if (recency > 1.2) reasons.push('recent');
        hits.push({
          kind: 'post',
          id: p.id,
          title: p.title || p.body.split('\n')[0].slice(0, 90) || 'Untitled post',
          subtitle: `${p.authorName} · ${p.type} · ${p.reactionTotal + p.commentCount} engagements`,
          image: p.authorAvatar || p.images[0] || '',
          url: `/${routeFor(p.type)}/${p.slug}`,
          score,
          reason: reasons.join(' · '),
          highlight: findHighlightRanges(q, p.title || ''),
        });
      }
    }

    // ----------------------------------------------------------- groups
    if (category === 'all' || category === 'groups') {
      const candidates = this.candidates(this.groups as unknown as MinimalDocIndex, q, Math.max(20, limit));
      const seen = new Set<string>();
      for (const id of candidates) {
        const g = this.groupsById.get(id);
        if (!g || seen.has(g.id)) continue;
        seen.add(g.id);
        const info = [
          { weight: FIELD_WEIGHTS.name, ...matchInfo(q, g.name) },
          { weight: FIELD_WEIGHTS.description, ...matchInfo(q, g.description || '') },
        ].sort((a, b) => b.ratio * b.weight - a.ratio * a.weight)[0];
        if (info.quality === 'none') continue;
        const popularity = 1 + Math.log10(g.memberCount + 2);
        hits.push({
          kind: 'group',
          id: g.id,
          title: g.name,
          subtitle: `${g.memberCount} members · ${g.category}`,
          image: '',
          url: `/g/${g.slug}`,
          score: info.ratio * info.weight * popularity,
          reason: '',
          highlight: findHighlightRanges(q, g.name),
        });
      }
    }

    // Fallback: if nothing matched via tokens, brute-force scan users by prefix (cheap, bounded).
    if (hits.length === 0 && q.length >= 2) {
      for (const u of this.usersById.values()) {
        if (hits.length >= limit) break;
        if (u.username.startsWith(q.toLowerCase()) || u.displayName.toLowerCase().startsWith(q.toLowerCase())) {
          hits.push({
            kind: 'user',
            id: u.uid,
            title: u.displayName,
            subtitle: `@${u.username}`,
            image: u.avatar,
            url: `/p/${u.username}`,
            score: 70,
            reason: '',
            highlight: [[0, q.length]],
          });
        }
      }
    }

    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Union of per-field FlexSearch results → deduped candidate ids. */
  private candidates(index: MinimalDocIndex, q: string, limit: number): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    let result: unknown;
    try {
      result = (index as unknown as { search: (query: string, opts?: Record<string, unknown>) => unknown }).search(q, { limit });
    } catch {
      return [];
    }
    if (Array.isArray(result)) {
      for (const field of result) {
        const ids = (field as { result?: unknown }).result;
        if (Array.isArray(ids)) {
          for (const id of ids) {
            const key = String(id);
            if (!seen.has(key)) {
              seen.add(key);
              out.push(key);
            }
          }
        }
      }
    }
    return out;
  }
}

/* ------------------------------------------------------------ lifecycle */

let index: SearchIndex | null = null;
let building: Promise<SearchIndex> | null = null;
let attempts = 0;

export function getSearchIndex(): SearchIndex | null {
  return index;
}

/** Build (or reuse) the shared index. Retries with backoff on transient Firestore errors. */
export async function ensureSearchIndex(force = false): Promise<SearchIndex> {
  if (index && !force && Date.now() - index.builtAt < 5 * 60 * 1000) return index;
  if (building) return building;
  building = (async () => {
    const { fetchRecentPosts, fetchActiveUsers, fetchGroups } = await import('./data');
    const viewer = useAuthStore.getState().profile;
    const [posts, users, groups] = await Promise.all([
      fetchRecentPosts(400).catch(() => [] as Post[]),
      fetchActiveUsers(400).catch(() => [] as UserProfile[]),
      fetchGroups(150).catch(() => [] as (Group & { id: string })[]),
    ]);
    const fresh = new SearchIndex();
    fresh.indexPosts(posts.filter((p) => !p.deleted));
    fresh.indexUsers(users.filter((u) => u.role !== 'banned' || viewer?.role === 'admin'));
    fresh.indexGroups(groups);
    index = fresh;
    attempts = 0;
    return fresh;
  })().catch((e) => {
    attempts += 1;
    const backoffMs = Math.min(30000, 1000 * 2 ** attempts);
    building = null;
    if (attempts <= 3) {
      return new Promise<SearchIndex>((resolve) => {
        setTimeout(() => resolve(ensureSearchIndex(force)), backoffMs);
      });
    }
    attempts = 0;
    // Give up with an empty-but-valid index so the UI degrades gracefully.
    index = index || new SearchIndex();
    void e;
    return index;
  });
  return building;
}

/** Invalidate + rebuild (called after publishing content or auth changes). */
export async function refreshSearchIndex(): Promise<SearchIndex> {
  return ensureSearchIndex(true);
}
