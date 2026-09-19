/**
 * BSDC — src/core/config/points.ts
 * Purpose : The reputation economy: point rules, level curve, streak maths and badge catalogue.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   :
 *   Points are a signal, not a currency: they are awarded by Cloud Functions for real, verified
 *   contributions and can be clawed back when a contribution is removed or struck by moderation.
 *   The client never writes a point total. This file is the whole economy in one screen so the
 *   leaderboard, the level ring, the badge shelf and the Functions ledger cannot disagree.
 *   The level curve is quadratic: early levels arrive quickly (so a new member feels welcome) and
 *   later levels take real, sustained contribution (so the top of the board means something).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Every action the platform rewards, with the points granted and revoked. */
export const POINT_RULES = {
  'profile.complete': { award: 15, revoke: 0, dailyCap: 1 },
  'profile.avatar': { award: 5, revoke: 0, dailyCap: 1 },
  'post.create': { award: 5, revoke: 5, dailyCap: 5 },
  'post.receivedReaction': { award: 1, revoke: 1, dailyCap: 50 },
  'comment.create': { award: 2, revoke: 2, dailyCap: 10 },
  'story.create': { award: 3, revoke: 0, dailyCap: 3 },
  'event.rsvp': { award: 3, revoke: 0, dailyCap: 3 },
  'event.host': { award: 25, revoke: 0, dailyCap: 2 },
  'job.apply': { award: 4, revoke: 0, dailyCap: 5 },
  'job.post': { award: 10, revoke: 0, dailyCap: 2 },
  'project.ship': { award: 25, revoke: 0, dailyCap: 2 },
  'project.join': { award: 6, revoke: 0, dailyCap: 4 },
  'gig.complete': { award: 40, revoke: 0, dailyCap: 5 },
  'gig.reviewFiveStar': { award: 8, revoke: 0, dailyCap: 10 },
  'group.create': { award: 10, revoke: 0, dailyCap: 1 },
  'group.post': { award: 2, revoke: 2, dailyCap: 10 },
  'answer.accepted': { award: 20, revoke: 0, dailyCap: 10 },
  'member.invited': { award: 12, revoke: 0, dailyCap: 5 },
  'daily.login': { award: 2, revoke: 0, dailyCap: 1 },
} as const;

export type PointAction = keyof typeof POINT_RULES;

/** Points granted by one award of an action. */
export function pointsFor(action: PointAction): number {
  return POINT_RULES[action].award;
}

/** Points removed when an awarded contribution is deleted or struck. */
export function pointsRevokedFor(action: PointAction): number {
  return POINT_RULES[action].revoke;
}

/** Maximum number of awards of one action a single account may receive per day. */
export function dailyCapFor(action: PointAction): number {
  return POINT_RULES[action].dailyCap;
}

/**
 * Level curve: the cumulative points needed to *reach* each level.
 * Level 1 is free; every later level costs 60 more than the step before it.
 */
export const LEVEL_STEP = 60;
/** Number of levels the ladder has. Reaching the top is possible but rare on purpose. */
export const MAX_LEVEL = 30;

/** Cumulative points required to reach a level (1-indexed). */
export function pointsToReachLevel(level: number): number {
  const target = Math.max(1, Math.min(MAX_LEVEL, Math.trunc(level)));
  let total = 0;
  for (let current = 2; current <= target; current += 1) {
    total += (current - 1) * LEVEL_STEP;
  }
  return total;
}

/** The level an account sits at for a point total. */
export function levelFor(points: number): number {
  const safe = Math.max(0, Math.trunc(points));
  let level = 1;
  while (level < MAX_LEVEL && safe >= pointsToReachLevel(level + 1)) level += 1;
  return level;
}

/** Points at which the next level is reached, or null at the top of the ladder. */
export function nextLevelAt(points: number): number | null {
  const level = levelFor(points);
  if (level >= MAX_LEVEL) return null;
  return pointsToReachLevel(level + 1);
}

/** Progress through the current level, 0 to 1 inclusive. */
export function levelProgress(points: number): number {
  const level = levelFor(points);
  if (level >= MAX_LEVEL) return 1;
  const floor = pointsToReachLevel(level);
  const ceiling = pointsToReachLevel(level + 1);
  if (ceiling <= floor) return 1;
  return Math.min(1, Math.max(0, (points - floor) / (ceiling - floor)));
}

/** Streak bonuses: an unbroken run of active days is worth more than scattered visits. */
export const STREAK_BONUS = {
  sevenDays: 25,
  fourteenDays: 60,
  thirtyDays: 150,
  hundredDays: 600,
} as const;

/** Bonus awarded the moment a streak hits an exact milestone, or 0. */
export function streakBonusFor(streakDays: number): number {
  switch (streakDays) {
    case 7:
      return STREAK_BONUS.sevenDays;
    case 14:
      return STREAK_BONUS.fourteenDays;
    case 30:
      return STREAK_BONUS.thirtyDays;
    case 100:
      return STREAK_BONUS.hundredDays;
    default:
      return 0;
  }
}

/** The next streak milestone after a run, used to render "7 more days for a bonus". */
export function nextStreakMilestone(streakDays: number): number | null {
  const milestones = [7, 14, 30, 100];
  return milestones.find((milestone) => milestone > streakDays) ?? null;
}

/** Badge tiers, ordered. */
export const BADGE_TIERS = ['bronze', 'silver', 'gold', 'platinum'] as const;
export type BadgeTier = (typeof BADGE_TIERS)[number];

/** How a badge is earned. `threshold` is compared against the counter named by `metric`. */
export interface BadgeDefinition {
  readonly id: string;
  readonly tier: BadgeTier;
  readonly metric: 'posts' | 'comments' | 'events' | 'projects' | 'gigs' | 'streak' | 'referrals';
  readonly threshold: number;
  readonly labelBn: string;
  readonly labelEn: string;
  readonly descriptionBn: string;
  readonly descriptionEn: string;
  /** Points granted once, the moment the badge is earned. */
  readonly points: number;
}

/** The badge catalogue. Ordered by tier, then by threshold, then by id. */
export const BADGES: readonly BadgeDefinition[] = [
  {
    id: 'first-post',
    tier: 'bronze',
    metric: 'posts',
    threshold: 1,
    labelBn: 'প্রথম পোস্ট',
    labelEn: 'First post',
    descriptionBn: 'প্রথমবারের মতো কমিউনিটিতে কিছু শেয়ার করেছেন।',
    descriptionEn: 'Shared something with the community for the first time.',
    points: 5,
  },
  {
    id: 'conversationalist',
    tier: 'bronze',
    metric: 'comments',
    threshold: 10,
    labelBn: 'আলোচক',
    labelEn: 'Conversationalist',
    descriptionBn: 'দশটি মন্তব্যে কথা বলেছেন।',
    descriptionEn: 'Joined ten discussions.',
    points: 10,
  },
  {
    id: 'regular',
    tier: 'silver',
    metric: 'streak',
    threshold: 7,
    labelBn: 'নিয়মিত',
    labelEn: 'Regular',
    descriptionBn: 'টানা সাত দিন কমিউনিটিতে এসেছেন।',
    descriptionEn: 'Visited seven days in a row.',
    points: 25,
  },
  {
    id: 'author',
    tier: 'silver',
    metric: 'posts',
    threshold: 50,
    labelBn: 'লেখক',
    labelEn: 'Author',
    descriptionBn: 'পঞ্চাশটি পোস্ট লিখেছেন।',
    descriptionEn: 'Published fifty posts.',
    points: 40,
  },
  {
    id: 'meetup-regular',
    tier: 'silver',
    metric: 'events',
    threshold: 5,
    labelBn: 'মিটআপ সঙ্গী',
    labelEn: 'Meetup regular',
    descriptionBn: 'পাঁচটি ইভেন্টে যোগ দিয়েছেন।',
    descriptionEn: 'Attended five events.',
    points: 30,
  },
  {
    id: 'builder',
    tier: 'gold',
    metric: 'projects',
    threshold: 3,
    labelBn: 'নির্মাতা',
    labelEn: 'Builder',
    descriptionBn: 'তিনটি প্রকল্প শেষ করেছেন।',
    descriptionEn: 'Shipped three projects.',
    points: 60,
  },
  {
    id: 'trusted-pro',
    tier: 'gold',
    metric: 'gigs',
    threshold: 10,
    labelBn: 'বিশ্বস্ত পেশাদার',
    labelEn: 'Trusted pro',
    descriptionBn: 'দশটি ফ্রিল্যান্স কাজ সফলভাবে সেরেছেন।',
    descriptionEn: 'Completed ten freelance orders.',
    points: 80,
  },
  {
    id: 'ambassador',
    tier: 'platinum',
    metric: 'referrals',
    threshold: 25,
    labelBn: 'দূত',
    labelEn: 'Ambassador',
    descriptionBn: 'পঁচিশজন নতুন সদস্য এনেছেন।',
    descriptionEn: 'Invited twenty-five members who stayed.',
    points: 150,
  },
];

const BADGE_INDEX: ReadonlyMap<string, BadgeDefinition> = new Map(
  BADGES.map((badge) => [badge.id, badge]),
);

/**
 * Looks up a badge by id.
 * @param badgeId badge id
 * @returns the definition, or undefined when the id is unknown
 */
export function findBadge(badgeId: string): BadgeDefinition | undefined {
  return BADGE_INDEX.get(badgeId);
}

/** Counters a badge can be measured against. */
export interface BadgeCounters {
  readonly posts: number;
  readonly comments: number;
  readonly events: number;
  readonly projects: number;
  readonly gigs: number;
  readonly streak: number;
  readonly referrals: number;
}

/**
 * Lists the badges a set of counters has earned.
 * @param counters the counters
 * @returns the earned badge definitions, in catalogue order
 */
export function earnedBadges(counters: BadgeCounters): readonly BadgeDefinition[] {
  return BADGES.filter((badge) => counters[badge.metric] >= badge.threshold);
}

/** Leaderboard windows. `all` is lifetime; the others recompute on a schedule. */
export const LEADERBOARD_WINDOWS = ['weekly', 'monthly', 'all'] as const;
export type LeaderboardWindow = (typeof LEADERBOARD_WINDOWS)[number];

/** How many rows a leaderboard page shows before the list virtualises. */
export const LEADERBOARD_PAGE_SIZE = 50;
