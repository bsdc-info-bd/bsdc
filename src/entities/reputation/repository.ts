/**
 * BSDC — src/entities/reputation/repository.ts
 * Purpose : Reputation reads: a record, a leaderboard, and the opt-out switch.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : There is deliberately no write path for points in this file. Points are granted and
 *   revoked by Cloud Functions after the contribution is verified; the only thing a person may
 *   write about their own reputation is whether they appear on the public leaderboard at all.
 *   A leaderboard somebody can edit is not a leaderboard, it is a form.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { COLLECTIONS, userPath } from '@/core/config/collections';
import { LEADERBOARD_PAGE_SIZE, type LeaderboardWindow } from '@/core/config/points';
import { firestoreDb } from '@/services/firebase/app';
import { fromDocument, fromQuery, translateFirestoreError } from '@/services/firebase/firestore';
import { acquireListener, type Unsubscribe } from '@/services/realtime/registry';
import { mirrorGet, mirrorPut } from '@/services/offline/mirror';
import { readThrough } from '@/services/offline/sync';
import { levelFor } from '@/core/config/points';
import {
  applyRanks,
  emptyReputation,
  sortLeaderboard,
  type LeaderboardRow,
  type Reputation,
} from './model';

/** A user document field subset the leaderboard and reputation screens read. */
interface ReputationDoc extends Record<string, unknown> {
  readonly uid?: string;
  readonly username?: string;
  readonly displayName?: string;
  readonly displayNameBn?: string;
  readonly photoUrl?: string;
  readonly points?: number;
  readonly level?: number;
  readonly badgeIds?: readonly string[];
  readonly streakDays?: number;
  readonly lastActiveDate?: string;
  readonly weeklyPoints?: number;
  readonly monthlyPoints?: number;
  readonly leaderboardOptOut?: boolean;
  readonly updatedAt?: string;
}

/**
 * Reads one person's reputation.
 * @param uid account id
 * @returns the reputation, or an empty record when it has never been read
 */
export async function loadReputation(uid: string): Promise<Reputation> {
  if (uid.length === 0) return emptyReputation(uid);
  const result = await readThrough<Reputation>(
    'reputation',
    async () => {
      const { doc, getDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        const snapshot = await getDoc(doc(db, userPath(uid)));
        const raw = fromDocument<ReputationDoc>(snapshot);
        return raw === undefined ? [] : [toReputation(uid, raw)];
      } catch (error) {
        throw translateFirestoreError(error, 'reputation.read');
      }
    },
    { limit: 1, where: [(entry: Reputation) => entry.uid === uid] },
  );
  return (
    result.items[0] ?? (await mirrorGet<Reputation>('reputation', uid)) ?? emptyReputation(uid)
  );
}

/**
 * Converts a user document into a reputation record.
 * @param uid account id
 * @param raw the raw document
 * @returns the reputation
 */
function toReputation(uid: string, raw: ReputationDoc): Reputation {
  const points = typeof raw.points === 'number' ? raw.points : 0;
  return {
    id: uid,
    uid,
    points,
    level: typeof raw.level === 'number' ? raw.level : levelFor(points),
    weeklyPoints: typeof raw.weeklyPoints === 'number' ? raw.weeklyPoints : 0,
    monthlyPoints: typeof raw.monthlyPoints === 'number' ? raw.monthlyPoints : 0,
    streakDays: typeof raw.streakDays === 'number' ? raw.streakDays : 0,
    lastActiveDate: typeof raw.lastActiveDate === 'string' ? raw.lastActiveDate : '',
    badgeIds: Array.isArray(raw.badgeIds) ? raw.badgeIds : [],
    leaderboardOptOut: raw.leaderboardOptOut === true,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
  };
}

/**
 * Watches a person's reputation so a level-up lands while they are looking at the screen.
 * @param uid account id
 * @param handler receives the reputation
 * @returns a release function
 */
export function watchReputation(
  uid: string,
  handler: (reputation: Reputation) => void,
): Unsubscribe {
  if (uid.length === 0) return () => undefined;
  return acquireListener(`reputation:${uid}`, 'reputation', async () => {
    const { doc, onSnapshot } = await import('firebase/firestore');
    const db = await firestoreDb();
    return onSnapshot(doc(db, userPath(uid)), (snapshot) => {
      const raw = fromDocument<ReputationDoc>(snapshot);
      if (raw === undefined) return;
      const reputation = toReputation(uid, raw);
      void mirrorPut('reputation', reputation);
      handler(reputation);
    });
  });
}

/**
 * Reads a leaderboard for a window, excluding everybody who opted out.
 * @param window weekly, monthly or lifetime
 * @param viewerUid the signed-in viewer, highlighted in the result
 * @param limit row count
 * @returns the ranked rows and their provenance
 */
export async function listLeaderboard(
  window: LeaderboardWindow,
  viewerUid: string,
  limit: number = LEADERBOARD_PAGE_SIZE,
): Promise<{ readonly rows: readonly LeaderboardRow[]; readonly source: 'remote' | 'local' }> {
  const orderField =
    window === 'weekly' ? 'weeklyPoints' : window === 'monthly' ? 'monthlyPoints' : 'points';
  const result = await readThrough<Reputation>(
    'reputation',
    async () => {
      const {
        collection,
        query,
        where,
        orderBy,
        limit: limitTo,
        getDocs,
      } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        const snapshot = await getDocs(
          query(
            collection(db, COLLECTIONS.users),
            where('leaderboardOptOut', '==', false),
            where('suspended', '==', false),
            orderBy(orderField, 'desc'),
            limitTo(limit),
          ),
        );
        return fromQuery<ReputationDoc>(snapshot).map((raw) =>
          toReputation(typeof raw.uid === 'string' ? raw.uid : '', raw),
        );
      } catch (error) {
        throw translateFirestoreError(error, 'leaderboard.read');
      }
    },
    { orderBy: 'points', direction: 'desc', limit },
  );

  const rows = sortLeaderboard(
    applyRanks(
      result.items.map((entry) => ({
        uid: entry.uid,
        displayName: '',
        displayNameBn: '',
        username: '',
        photoUrl: '',
        points:
          window === 'weekly'
            ? entry.weeklyPoints
            : window === 'monthly'
              ? entry.monthlyPoints
              : entry.points,
        level: entry.level,
        badgeIds: entry.badgeIds,
        isViewer: entry.uid === viewerUid,
      })),
    ),
  );
  return { rows, source: result.source };
}

/**
 * Turns a reputation entry and a profile into a leaderboard row, so the two reads stay separate.
 * @param reputation the reputation entry
 * @param profile display values
 * @param viewerUid the signed-in viewer
 * @param rank the row's rank
 * @returns the row
 */
export function toLeaderboardRow(
  reputation: Reputation,
  profile: {
    readonly username: string;
    readonly displayName: string;
    readonly displayNameBn: string;
    readonly photoUrl: string;
  },
  viewerUid: string,
  rank: number,
): LeaderboardRow {
  return {
    rank,
    uid: reputation.uid,
    username: profile.username,
    displayName: profile.displayName,
    displayNameBn: profile.displayNameBn,
    photoUrl: profile.photoUrl,
    points: reputation.points,
    level: reputation.level,
    badgeIds: reputation.badgeIds,
    isViewer: reputation.uid === viewerUid,
  };
}

/**
 * Turns a person's leaderboard visibility on or off. This is a profile field, so the write is a
 * profile update and the rules that guard it are the profile rules.
 * @param uid account id
 * @param optOut true to leave the public leaderboard
 * @returns true when the preference was written
 */
export async function setLeaderboardOptOut(uid: string, optOut: boolean): Promise<boolean> {
  const current = await mirrorGet<Reputation>('reputation', uid);
  if (current !== undefined) {
    await mirrorPut('reputation', {
      ...current,
      leaderboardOptOut: optOut,
      updatedAt: new Date().toISOString(),
    });
  }
  try {
    const { doc, updateDoc } = await import('firebase/firestore');
    const db = await firestoreDb();
    await updateDoc(doc(db, userPath(uid)), {
      leaderboardOptOut: optOut,
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    throw translateFirestoreError(error, 'leaderboard.optOut');
  }
}
