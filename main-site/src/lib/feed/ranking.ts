/**
 * The BSDC ranking engine, in four stages.
 *
 *   1. candidates  — produced by public.feed_candidates() inside Postgres,
 *                    which already applies row level security.
 *   2. filtering   — blocks, mutes, language, sensitivity and seen state.
 *   3. scoring     — recency, affinity, quality and locality.
 *   4. diversity   — nobody's timeline is three posts from one author.
 *
 * Everything here is pure: the same candidates and the same preferences
 * always produce the same order, which is what makes the behaviour testable
 * and explainable to a member who asks why they saw something.
 */
export type FeedAlgorithm = 'ranked' | 'following' | 'latest';

export interface FeedCandidate {
  postId: string;
  authorUid: string;
  publishedAt: string;
  likes: number;
  comments: number;
  views: number;
  language: string;
  isSensitive: boolean;
  kind: string;
  authorFollowed: boolean;
  affinity: number;
  alreadySeen: boolean;
  tags: string[];
}

export interface FeedPreferences {
  algorithm: FeedAlgorithm;
  languages: string[];
  mutedTags: string[];
  showSensitive: boolean;
  hideSeen: boolean;
}

export const DEFAULT_FEED_PREFERENCES: FeedPreferences = {
  algorithm: 'ranked',
  languages: ['bn', 'en'],
  mutedTags: [],
  showSensitive: false,
  hideSeen: true,
};

export interface ScoredCandidate extends FeedCandidate {
  score: number;
  reasons: FeedReason[];
}

/** Why a post was ranked where it was — surfaced in the UI, not hidden. */
export type FeedReason = 'following' | 'topic' | 'popular' | 'fresh' | 'language';

export const WEIGHTS = {
  recency: 40,
  following: 28,
  affinity: 18,
  quality: 20,
  language: 8,
  seenPenalty: 35,
  sensitivePenalty: 6,
} as const;

/** Half-life of six hours: a day-old post keeps roughly a sixteenth of it. */
const RECENCY_HALF_LIFE_HOURS = 6;

export function recencyScore(publishedAt: string, now: number): number {
  const ageHours = Math.max(0, (now - new Date(publishedAt).getTime()) / 3_600_000);
  return Math.pow(0.5, ageHours / RECENCY_HALF_LIFE_HOURS);
}

/**
 * Engagement normalised so that a post with a handful of interactions is not
 * drowned by one with thousands: log scaling, then a ratio that rewards
 * conversation over passive views.
 */
export function qualityScore(candidate: FeedCandidate): number {
  const interactions = candidate.likes + candidate.comments * 2;
  const magnitude = Math.log10(1 + interactions) / Math.log10(1 + 500);
  const views = Math.max(candidate.views, 1);
  const engagementRate = Math.min(interactions / views, 0.5) * 2;
  return Math.min(1, magnitude * 0.7 + engagementRate * 0.3);
}

export function affinityScore(candidate: FeedCandidate): number {
  return Math.min(1, candidate.affinity / 30);
}

/** Why stage two removed a candidate. One reason per post: the first that fits. */
export type FeedFilterReason = 'seen' | 'sensitive' | 'muted' | 'language' | 'following';

export interface FilterReport {
  kept: FeedCandidate[];
  removed: Record<FeedFilterReason, number>;
  /** How many candidates arrived at all. */
  considered: number;
}

export function emptyFilterReport(): Record<FeedFilterReason, number> {
  return { seen: 0, sensitive: 0, muted: 0, language: 0, following: 0 };
}

/**
 * Stage 2 — filtering, with a count of what each rule removed.
 *
 * The counts are the difference between an empty feed and an explained one. A
 * member who has read everything and a member whose language preference hides
 * the whole community both see no posts, and only the database and these
 * numbers know which of the two happened.
 */
export function explainFiltering(
  candidates: readonly FeedCandidate[],
  preferences: FeedPreferences,
  viewerUid: string | null,
): FilterReport {
  const muted = new Set(preferences.mutedTags.map((tag) => tag.toLowerCase()));
  const removed = emptyFilterReport();
  const kept: FeedCandidate[] = [];

  for (const candidate of candidates) {
    // Your own post is always yours to see, whatever you muted or read.
    if (candidate.authorUid === viewerUid) {
      kept.push(candidate);
      continue;
    }
    if (!preferences.showSensitive && candidate.isSensitive) {
      removed.sensitive += 1;
      continue;
    }
    if (candidate.tags.some((tag) => muted.has(tag.toLowerCase()))) {
      removed.muted += 1;
      continue;
    }
    if (preferences.languages.length > 0 && !preferences.languages.includes(candidate.language)) {
      removed.language += 1;
      continue;
    }
    if (preferences.algorithm === 'following' && !candidate.authorFollowed) {
      removed.following += 1;
      continue;
    }
    // Seen posts are hidden unless that leaves nothing to read, which the
    // caller handles by retrying with hideSeen disabled.
    if (preferences.hideSeen && preferences.algorithm !== 'latest' && candidate.alreadySeen) {
      removed.seen += 1;
      continue;
    }
    kept.push(candidate);
  }

  return { kept, removed, considered: candidates.length };
}

/** Stage 2 — filtering. */
export function filterCandidates(
  candidates: readonly FeedCandidate[],
  preferences: FeedPreferences,
  viewerUid: string | null,
): FeedCandidate[] {
  return explainFiltering(candidates, preferences, viewerUid).kept;
}

/**
 * Why a feed came back empty, which decides what the member is told.
 *
 *   nothing      no candidates arrived at all — there really is nothing to read
 *   all-seen     everything was hidden for being already read, so the honest
 *                answer is "you are caught up", offered with the posts back
 *   preferences  the member's own rules — language, muted tags, sensitivity,
 *                following — removed every candidate
 *   none         the feed is not empty
 */
export type FeedEmptyReason = 'none' | 'nothing' | 'all-seen' | 'preferences';

export function emptyReason(report: FilterReport, kept: number): FeedEmptyReason {
  if (kept > 0) return 'none';
  if (report.considered === 0) return 'nothing';
  const removed = report.removed;
  const total =
    removed.seen + removed.sensitive + removed.muted + removed.language + removed.following;
  if (total === removed.seen) return 'all-seen';
  return 'preferences';
}

/** Stage 3 — scoring. */
export function scoreCandidate(
  candidate: FeedCandidate,
  preferences: FeedPreferences,
  now: number,
): ScoredCandidate {
  const reasons: FeedReason[] = [];

  const recency = recencyScore(candidate.publishedAt, now);
  const quality = qualityScore(candidate);
  const affinity = affinityScore(candidate);
  const languageMatch = preferences.languages[0] === candidate.language ? 1 : 0;

  let score =
    recency * WEIGHTS.recency +
    quality * WEIGHTS.quality +
    affinity * WEIGHTS.affinity +
    languageMatch * WEIGHTS.language;

  if (candidate.authorFollowed) {
    score += WEIGHTS.following;
    reasons.push('following');
  }
  if (affinity > 0.25) reasons.push('topic');
  if (quality > 0.4) reasons.push('popular');
  if (recency > 0.5) reasons.push('fresh');
  if (languageMatch === 1) reasons.push('language');

  if (candidate.alreadySeen) score -= WEIGHTS.seenPenalty;
  if (candidate.isSensitive) score -= WEIGHTS.sensitivePenalty;

  return { ...candidate, score: Math.round(score * 100) / 100, reasons };
}

export interface DiversityLimits {
  maxPerAuthor: number;
  maxPerTag: number;
}

export const DEFAULT_DIVERSITY: DiversityLimits = { maxPerAuthor: 2, maxPerTag: 3 };

/**
 * Stage 4 — diversity. Over-represented authors and tags are pushed to the
 * tail rather than dropped, so nothing disappears from the feed entirely.
 */
export function diversify(
  scored: readonly ScoredCandidate[],
  limits: DiversityLimits = DEFAULT_DIVERSITY,
): ScoredCandidate[] {
  const ordered = [...scored].sort((a, b) =>
    b.score === a.score ? a.postId.localeCompare(b.postId) : b.score - a.score,
  );

  const authorCount = new Map<string, number>();
  const tagCount = new Map<string, number>();
  const primary: ScoredCandidate[] = [];
  const overflow: ScoredCandidate[] = [];

  for (const candidate of ordered) {
    const authorSeen = authorCount.get(candidate.authorUid) ?? 0;
    const tagExceeded = candidate.tags.some((tag) => (tagCount.get(tag) ?? 0) >= limits.maxPerTag);

    if (authorSeen >= limits.maxPerAuthor || tagExceeded) {
      overflow.push(candidate);
      continue;
    }

    authorCount.set(candidate.authorUid, authorSeen + 1);
    for (const tag of candidate.tags) tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    primary.push(candidate);
  }

  return [...primary, ...overflow];
}

/** Runs stages two to four and returns the final ordering. */
export function rankFeed(
  candidates: readonly FeedCandidate[],
  preferences: FeedPreferences,
  viewerUid: string | null,
  now: number = Date.now(),
): ScoredCandidate[] {
  return rankFeedWithReport(candidates, preferences, viewerUid, now).ranked;
}

export interface RankedFeed {
  ranked: ScoredCandidate[];
  report: FilterReport;
}

/** The same ranking, plus stage two's counts, so an empty feed can explain itself. */
export function rankFeedWithReport(
  candidates: readonly FeedCandidate[],
  preferences: FeedPreferences,
  viewerUid: string | null,
  now: number = Date.now(),
): RankedFeed {
  const report = explainFiltering(candidates, preferences, viewerUid);

  if (preferences.algorithm === 'latest') {
    return {
      report,
      ranked: report.kept
        .map((candidate) => ({ ...candidate, score: 0, reasons: ['fresh' as FeedReason] }))
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()),
    };
  }

  const scored = report.kept.map((candidate) => scoreCandidate(candidate, preferences, now));
  return { report, ranked: diversify(scored) };
}

/** De-duplicates across pages: the cursor can overlap at a page boundary. */
export function mergePages(pages: readonly (readonly ScoredCandidate[])[]): ScoredCandidate[] {
  const seen = new Set<string>();
  const merged: ScoredCandidate[] = [];
  for (const page of pages) {
    for (const candidate of page) {
      if (seen.has(candidate.postId)) continue;
      seen.add(candidate.postId);
      merged.push(candidate);
    }
  }
  return merged;
}
