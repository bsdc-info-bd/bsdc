/**
 * BSDC — src/entities/reputation/model.ts
 * Purpose : Reputation: points, level, streak and the badges they have earned.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The client renders reputation but never awards it. Every point comes from a Cloud
 *   Function that has verified the contribution exists, and every point is revocable: when a post
 *   is struck by moderation the points it earned go with it. That is why a leaderboard position
 *   means something here and means nothing on a platform where the app can write its own score.
 *   Streaks are measured in Bangladeshi days (Asia/Dhaka) because a day is a local idea: a person
 *   who visits at 23:30 and again at 00:10 has not missed anything.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import {
  BADGES,
  levelFor,
  levelProgress,
  nextLevelAt,
  nextStreakMilestone,
  streakBonusFor,
  type BadgeDefinition,
  type BadgeTier,
} from '@/core/config/points';

/** A member's reputation record. */
export interface Reputation {
  /** Mirror key. Equals the account id, so the mirror can store it under one id field. */
  readonly id: string;
  readonly uid: string;
  readonly points: number;
  readonly level: number;
  readonly weeklyPoints: number;
  readonly monthlyPoints: number;
  readonly streakDays: number;
  /** ISO date (YYYY-MM-DD, Asia/Dhaka) of the last day counted towards the streak. */
  readonly lastActiveDate: string;
  readonly badgeIds: readonly string[];
  readonly leaderboardOptOut: boolean;
  readonly updatedAt: string;
}

/** One row of a leaderboard. */
export interface LeaderboardRow {
  readonly rank: number;
  readonly uid: string;
  readonly displayName: string;
  readonly displayNameBn: string;
  readonly username: string;
  readonly photoUrl: string;
  readonly points: number;
  readonly level: number;
  readonly badgeIds: readonly string[];
  /** True when this row is the signed-in viewer, so it can be highlighted. */
  readonly isViewer: boolean;
}

/**
 * Builds an empty reputation record for a new account.
 * @param uid account id
 * @param now optional instant
 * @returns a reputation record with zero points
 */
export function emptyReputation(uid: string, now: Date = new Date()): Reputation {
  return {
    id: uid,
    uid,
    points: 0,
    level: 1,
    weeklyPoints: 0,
    monthlyPoints: 0,
    streakDays: 0,
    lastActiveDate: '',
    badgeIds: [],
    leaderboardOptOut: false,
    updatedAt: now.toISOString(),
  };
}

/**
 * Resolves the local date key for an instant, in Bangladesh time.
 * @param instant the instant
 * @returns a YYYY-MM-DD string
 */
export function dayKey(instant: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * Whole days between two day keys, in Bangladesh time.
 * @param from earlier day key
 * @param to later day key
 * @returns the number of days between them
 */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00+06:00`);
  const end = Date.parse(`${to}T00:00:00+06:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return Number.POSITIVE_INFINITY;
  return Math.round((end - start) / 86_400_000);
}

/** What a visit on a given day does to a streak. */
export type StreakOutcome = 'started' | 'continued' | 'unchanged' | 'reset';

/**
 * Works out what a visit today does to a streak.
 * @param reputation the current reputation
 * @param today the day key of the visit, defaulting to now
 * @returns the outcome and the resulting streak length
 */
export function applyVisit(
  reputation: Reputation,
  today: string = dayKey(),
): { readonly outcome: StreakOutcome; readonly streakDays: number } {
  const last = reputation.lastActiveDate;
  if (last === today) return { outcome: 'unchanged', streakDays: reputation.streakDays };
  if (last.length === 0) return { outcome: 'started', streakDays: 1 };
  const gap = daysBetween(last, today);
  if (gap === 1) return { outcome: 'continued', streakDays: reputation.streakDays + 1 };
  if (gap > 1) return { outcome: 'reset', streakDays: 1 };
  // A visit stamped in the future (clock skew) is treated as today, not as a new streak.
  return { outcome: 'unchanged', streakDays: reputation.streakDays };
}

/**
 * Progress towards the next level, as a percentage.
 * @param reputation the reputation
 * @returns a whole number between 0 and 100
 */
export function levelPercentage(reputation: Reputation): number {
  return Math.round(levelProgress(reputation.points) * 100);
}

/**
 * Points still needed for the next level, or null at the top of the ladder.
 * @param reputation the reputation
 * @returns points remaining
 */
export function pointsToNextLevel(reputation: Reputation): number | null {
  const target = nextLevelAt(reputation.points);
  if (target === null) return null;
  return Math.max(0, target - reputation.points);
}

/**
 * Bonus the current streak has already earned, awarded at the milestone itself.
 * @param streakDays the streak length
 * @returns the bonus points
 */
export function streakBonus(streakDays: number): number {
  return streakBonusFor(streakDays);
}

/**
 * How many more days until the next streak bonus.
 * @param streakDays the streak length
 * @returns days remaining, or null when there is no further milestone
 */
export function daysToNextStreakBonus(streakDays: number): number | null {
  const milestone = nextStreakMilestone(streakDays);
  if (milestone === null) return null;
  return milestone - streakDays;
}

/**
 * Resolves the badge definitions a reputation record holds.
 * @param reputation the reputation
 * @returns the badge definitions, in catalogue order
 */
export function badgesOf(reputation: Reputation): readonly BadgeDefinition[] {
  return BADGES.filter((badge) => reputation.badgeIds.includes(badge.id));
}

/**
 * The highest tier a person has reached, used for the frame around their avatar.
 * @param reputation the reputation
 * @returns the highest tier, or null when no badges are held yet
 */
export function highestTier(reputation: Reputation): BadgeTier | null {
  const held = badgesOf(reputation);
  if (held.length === 0) return null;
  const order: readonly BadgeTier[] = ['bronze', 'silver', 'gold', 'platinum'];
  let best: BadgeTier = 'bronze';
  for (const badge of held) {
    if (order.indexOf(badge.tier) > order.indexOf(best)) best = badge.tier;
  }
  return best;
}

/**
 * Ranks rows and fills the rank column, so a leaderboard never shows two people at rank 4.
 * @param rows the rows, already sorted by points
 * @returns the same rows with ranks applied
 */
export function applyRanks(
  rows: readonly Omit<LeaderboardRow, 'rank'>[],
): readonly LeaderboardRow[] {
  let rank = 0;
  let previousPoints = Number.NaN;
  return rows.map((row, index) => {
    if (row.points !== previousPoints) {
      rank = index + 1;
      previousPoints = row.points;
    }
    return { ...row, rank };
  });
}

/**
 * Sorts leaderboard rows by points, then by level, then by handle for a stable order.
 * @param rows the rows
 * @returns a sorted copy
 */
export function sortLeaderboard(rows: readonly LeaderboardRow[]): readonly LeaderboardRow[] {
  return [...rows].sort((left, right) => {
    if (right.points !== left.points) return right.points - left.points;
    if (right.level !== left.level) return right.level - left.level;
    return left.username.localeCompare(right.username);
  });
}

/**
 * The level a point total sits at, re-exported so screens never import the config directly.
 * @param points point total
 * @returns the level
 */
export function levelOf(points: number): number {
  return levelFor(points);
}
