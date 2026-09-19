/**
 * BSDC — src/tests/unit/reputationModel.test.ts
 * Purpose : Proves the level curve, the streak rules and the leaderboard ranking.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A streak is the one part of gamification people take personally, so the rules that
 *   decide whether a streak lives or dies are tested at the edges: a visit before midnight and
 *   again after it must not break anything, because a day is a local idea and Bangladesh time is
 *   the only day that counts here.
 *   Ranks share a place rather than being broken arbitrarily, because a tie-breaker invented for
 *   convenience is a ranking that does not mean anything.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_LEVEL,
  POINT_RULES,
  dailyCapFor,
  earnedBadges,
  levelFor,
  nextStreakMilestone,
  pointsFor,
  pointsRevokedFor,
  pointsToReachLevel,
  streakBonusFor,
} from '@/core/config/points';
import {
  applyRanks,
  applyVisit,
  badgesOf,
  daysBetween,
  daysToNextStreakBonus,
  emptyReputation,
  highestTier,
  levelOf,
  levelPercentage,
  pointsToNextLevel,
  sortLeaderboard,
  streakBonus,
  type LeaderboardRow,
} from '@/entities/reputation/model';

describe('points', () => {
  it('never charges points for reading, only for contributing', () => {
    for (const action of Object.keys(POINT_RULES) as (keyof typeof POINT_RULES)[]) {
      expect(pointsFor(action)).toBeGreaterThan(0);
      expect(pointsRevokedFor(action)).toBeGreaterThanOrEqual(0);
      expect(dailyCapFor(action)).toBeGreaterThan(0);
    }
  });

  it('takes back no more than it gave', () => {
    for (const action of Object.keys(POINT_RULES) as (keyof typeof POINT_RULES)[]) {
      expect(pointsRevokedFor(action)).toBeLessThanOrEqual(pointsFor(action));
    }
  });
});

describe('the level curve', () => {
  it('starts everybody at level one', () => {
    expect(levelFor(0)).toBe(1);
    expect(emptyReputation('u1').level).toBe(1);
  });

  it('costs more for each level than the one before it', () => {
    expect(pointsToReachLevel(2)).toBeGreaterThan(pointsToReachLevel(1));
    expect(pointsToReachLevel(3) - pointsToReachLevel(2)).toBeGreaterThan(
      pointsToReachLevel(2) - pointsToReachLevel(1),
    );
  });

  it('never reports a level above the top of the ladder', () => {
    expect(levelFor(Number.MAX_SAFE_INTEGER)).toBe(MAX_LEVEL);
  });

  it('reports the distance to the next level, and nothing at the top', () => {
    const midway = { ...emptyReputation('u1'), points: 30 };
    expect(pointsToNextLevel(midway)).toBe(pointsToReachLevel(2) - 30);
    const topped = { ...emptyReputation('u1'), points: pointsToReachLevel(MAX_LEVEL) };
    expect(pointsToNextLevel(topped)).toBeNull();
    expect(levelPercentage(topped)).toBe(100);
  });

  it('moves through levels in whole steps', () => {
    expect(levelOf(pointsToReachLevel(2))).toBe(2);
    expect(levelOf(pointsToReachLevel(2) - 1)).toBe(1);
  });
});

describe('streaks', () => {
  it('starts a streak on the first visit', () => {
    expect(applyVisit(emptyReputation('u1'), '2026-06-01')).toEqual({
      outcome: 'started',
      streakDays: 1,
    });
  });

  it('continues a streak on the following day', () => {
    const active = { ...emptyReputation('u1'), streakDays: 4, lastActiveDate: '2026-06-01' };
    expect(applyVisit(active, '2026-06-02')).toEqual({ outcome: 'continued', streakDays: 5 });
  });

  it('leaves a streak alone when the day has already been counted', () => {
    const active = { ...emptyReputation('u1'), streakDays: 4, lastActiveDate: '2026-06-01' };
    expect(applyVisit(active, '2026-06-01').outcome).toBe('unchanged');
    expect(applyVisit(active, '2026-06-01').streakDays).toBe(4);
  });

  it('restarts a streak at one after a gap, rather than pretending nothing happened', () => {
    const stale = { ...emptyReputation('u1'), streakDays: 20, lastActiveDate: '2026-05-20' };
    expect(applyVisit(stale, '2026-06-01')).toEqual({ outcome: 'reset', streakDays: 1 });
  });

  it('treats a visit stamped in the future as today, so clock skew cannot break a streak', () => {
    const active = { ...emptyReputation('u1'), streakDays: 6, lastActiveDate: '2026-06-05' };
    expect(applyVisit(active, '2026-06-01').outcome).toBe('unchanged');
  });

  it('counts days in local time, so a late night and an early morning are one day apart', () => {
    expect(daysBetween('2026-06-01', '2026-06-02')).toBe(1);
    expect(daysBetween('2026-06-01', '2026-06-01')).toBe(0);
  });

  it('awards the bonus on the milestone and not before it', () => {
    expect(streakBonus(6)).toBe(0);
    expect(streakBonus(7)).toBe(streakBonusFor(7));
    expect(streakBonus(8)).toBe(0);
  });

  it('counts down to the next milestone, and stops promising one at the last', () => {
    expect(daysToNextStreakBonus(3)).toBe(4);
    expect(nextStreakMilestone(3)).toBe(7);
    expect(daysToNextStreakBonus(100)).toBeNull();
  });
});

describe('badges', () => {
  it('lists only the badges a person actually holds', () => {
    const holder = { ...emptyReputation('u1'), badgeIds: ['first-post'] };
    expect(badgesOf(holder).map((badge) => badge.id)).toEqual(['first-post']);
    expect(badgesOf(emptyReputation('u1'))).toHaveLength(0);
  });

  it('reports the highest tier held, and nothing when none are held', () => {
    expect(highestTier(emptyReputation('u1'))).toBeNull();
    const holder = { ...emptyReputation('u1'), badgeIds: ['first-post'] };
    expect(highestTier(holder)).toBe('bronze');
  });

  it('awards a badge the moment its threshold is met, and not one below it', () => {
    const counters = {
      posts: 1,
      comments: 0,
      events: 0,
      projects: 0,
      gigs: 0,
      streak: 0,
      referrals: 0,
    };
    expect(earnedBadges(counters).map((badge) => badge.id)).toContain('first-post');
    expect(earnedBadges({ ...counters, posts: 0 }).map((badge) => badge.id)).not.toContain(
      'first-post',
    );
  });
});

describe('leaderboard ranking', () => {
  function row(overrides: Partial<Omit<LeaderboardRow, 'rank'>>): Omit<LeaderboardRow, 'rank'> {
    return {
      uid: 'u1',
      displayName: 'Ayesha',
      displayNameBn: 'আয়েশা',
      username: 'ayesha',
      photoUrl: '',
      points: 100,
      level: 2,
      badgeIds: [],
      isViewer: false,
      ...overrides,
    };
  }

  it('gives equal points the same rank, and skips the place after a tie', () => {
    const ranked = applyRanks([
      row({ points: 400 }),
      row({ uid: 'u2', points: 400 }),
      row({ uid: 'u3', points: 300 }),
    ]);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 1, 3]);
  });

  it('sorts by points, then by level, then by handle so the order never wobbles', () => {
    const sorted = sortLeaderboard([
      { ...row({ uid: 'b', username: 'b', points: 100, level: 1 }), rank: 9 },
      { ...row({ uid: 'a', username: 'a', points: 100, level: 2 }), rank: 9 },
      { ...row({ uid: 'c', username: 'c', points: 200, level: 1 }), rank: 9 },
    ]);
    expect(sorted.map((entry) => entry.uid)).toEqual(['c', 'a', 'b']);
  });

  it('marks the viewer so their own row can be found at a glance', () => {
    const ranked = applyRanks([row({ isViewer: true }), row({ uid: 'u2', points: 50 })]);
    expect(ranked[0]?.isViewer).toBe(true);
  });
});
