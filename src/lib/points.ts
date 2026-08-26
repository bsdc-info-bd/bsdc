/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { runTransaction, doc, collection, addDoc, getDoc, orderBy, query, where, limit, getDocs } from 'firebase/firestore';
import { COL, fsDb } from './firestore';
import { POINTS } from '@/config/constants';
import type { PointTransaction } from '@/types/domain';
import { todayKey } from './utils';

export type EarnReason =
  | 'daily_login'
  | 'publish_post'
  | 'first_post'
  | 'receive_reaction'
  | 'receive_comment'
  | 'accepted_answer'
  | 'complete_profile'
  | 'referral'
  | 'follower_milestone'
  | 'admin_grant';

const REASON_AMOUNTS: Record<EarnReason, number> = {
  daily_login: POINTS.dailyLogin,
  publish_post: POINTS.publishPost,
  first_post: POINTS.firstPost,
  receive_reaction: POINTS.receiveReaction,
  receive_comment: POINTS.receiveComment,
  accepted_answer: POINTS.acceptedAnswer,
  complete_profile: POINTS.completeProfile,
  referral: POINTS.referral,
  follower_milestone: POINTS.followerMilestone,
  admin_grant: 0,
};

async function logTransaction(tx: Omit<PointTransaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
  await addDoc(collection(fsDb(), COL.pointTransactions), {
    ...tx,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function awardPoints(userId: string, amount: number, reason: string): Promise<void> {
  if (amount === 0) return;
  await runTransaction(fsDb(), async (txn) => {
    const userSnap = await txn.get(doc(fsDb(), COL.users, userId));
    if (!userSnap.exists()) return;
    const current = (userSnap.data().bsdcPoints as number) || 0;
    txn.set(
      doc(fsDb(), COL.users, userId),
      { bsdcPoints: Math.max(0, current + amount), updatedAt: Date.now() },
      { merge: true },
    );
  });
  await logTransaction({
    from: 'platform',
    to: userId,
    fromName: 'BSDC Platform',
    toName: '',
    amount,
    type: 'earn',
    reason,
    qrCodeUsed: false,
  });
}

export async function earn(userId: string, reason: EarnReason, overrideAmount?: number): Promise<void> {
  const amount = overrideAmount ?? REASON_AMOUNTS[reason];
  await awardPoints(userId, amount, `Earned: ${reason.replace(/_/g, ' ')}`);
}

export async function grantPoints(adminId: string, adminName: string, userId: string, amount: number, reason: string): Promise<void> {
  if (amount === 0) return;
  await awardPoints(userId, amount, `Admin grant: ${reason}`);
  await logTransaction({
    from: adminId,
    to: userId,
    fromName: adminName,
    toName: '',
    amount,
    type: 'admin_grant',
    reason,
    qrCodeUsed: false,
  });
}

export interface TransferResult {
  ok: boolean;
  error?: string;
}

export async function transferPoints(
  fromId: string,
  fromName: string,
  toId: string,
  toName: string,
  amount: number,
  note: string,
  qrCodeUsed = false,
): Promise<TransferResult> {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: 'Amount must be a positive whole number' };
  if (amount > 100000) return { ok: false, error: 'Single transfers are capped at 100,000 points' };
  if (fromId === toId) return { ok: false, error: 'You cannot transfer points to yourself' };
  try {
    await runTransaction(fsDb(), async (txn) => {
      const fromSnap = await txn.get(doc(fsDb(), COL.users, fromId));
      const toSnap = await txn.get(doc(fsDb(), COL.users, toId));
      if (!fromSnap.exists()) throw new Error('Sender account not found');
      if (!toSnap.exists()) throw new Error('Recipient not found');
      const fromBalance = (fromSnap.data().bsdcPoints as number) || 0;
      if (fromBalance < amount) throw new Error('Insufficient BSDC points balance');
      txn.set(doc(fsDb(), COL.users, fromId), { bsdcPoints: fromBalance - amount, updatedAt: Date.now() }, { merge: true });
      const toBalance = (toSnap.data().bsdcPoints as number) || 0;
      txn.set(doc(fsDb(), COL.users, toId), { bsdcPoints: toBalance + amount, updatedAt: Date.now() }, { merge: true });
    });
    await logTransaction({
      from: fromId,
      to: toId,
      fromName,
      toName,
      amount,
      type: 'transfer',
      reason: note || 'Points transfer',
      qrCodeUsed,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Transfer failed' };
  }
}

export async function getPointsHistory(uid: string, max = 50): Promise<(PointTransaction & { id: string })[]> {
  const q = query(
    collection(fsDb(), COL.pointTransactions),
    where('to', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  const [incoming, outgoing] = await Promise.all([
    getDocs(q),
    getDocs(
      query(
        collection(fsDb(), COL.pointTransactions),
        where('from', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(max),
      ),
    ),
  ]);
  const merged: (PointTransaction & { id: string })[] = [];
  incoming.forEach((d) => merged.push({ ...(d.data() as PointTransaction), id: d.id }));
  outgoing.forEach((d) => merged.push({ ...(d.data() as PointTransaction), id: d.id }));
  return merged.sort((a, b) => b.createdAt - a.createdAt).slice(0, max);
}

export async function getLeaderboard(max = 25): Promise<{ uid: string; displayName: string; username: string; avatar: string; bsdcPoints: number; isVerified: boolean }[]> {
  const q = query(collection(fsDb(), COL.users), orderBy('bsdcPoints', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        displayName: (data.displayName as string) || 'BSDC Member',
        username: (data.username as string) || 'unknown',
        avatar: (data.avatar as string) || '',
        bsdcPoints: (data.bsdcPoints as number) || 0,
        isVerified: Boolean(data.isVerified),
      };
    })
    .filter((u) => u.bsdcPoints > 0);
}

/** Daily login bonus + streak — awards once per calendar day. */
export async function claimDailyLoginIfDue(userId: string, currentStreak: number, lastLoginDay: string): Promise<{ awarded: boolean; streak: number }> {
  const today = todayKey();
  if (lastLoginDay === today) return { awarded: false, streak: currentStreak };
  const yesterday = todayKey(Date.now() - 24 * 60 * 60 * 1000);
  const streak = lastLoginDay === yesterday ? currentStreak + 1 : 1;
  await awardPoints(userId, POINTS.dailyLogin, 'Daily login bonus');
  await runTransaction(fsDb(), async (txn) => {
    const snap = await txn.get(doc(fsDb(), COL.users, userId));
    if (!snap.exists()) return;
    const data = snap.data();
    if ((data.lastLoginDay as string) === today) return;
    txn.set(
      doc(fsDb(), COL.users, userId),
      { lastLoginDay: today, streak, lastActive: Date.now() },
      { merge: true },
    );
  });
  return { awarded: true, streak };
}

export async function getPointsBalance(uid: string): Promise<number> {
  const snap = await getDoc(doc(fsDb(), COL.users, uid));
  return snap.exists() ? ((snap.data().bsdcPoints as number) || 0) : 0;
}

export const LEVELS = [
  { name: 'Newcomer', min: 0, icon: 'sprout' },
  { name: 'Explorer', min: 100, icon: 'compass' },
  { name: 'Builder', min: 500, icon: 'hammer' },
  { name: 'Craftsman', min: 1500, icon: 'wrench' },
  { name: 'Architect', min: 5000, icon: 'building' },
  { name: 'Mentor', min: 15000, icon: 'graduation' },
  { name: 'Legend', min: 50000, icon: 'crown' },
] as const;

export function levelOf(points: number): { name: string; min: number; next: number | null; progress: number } {
  let current: (typeof LEVELS)[number] = LEVELS[0];
  let next: number | null = null;
  for (const lvl of LEVELS) {
    if (points >= lvl.min) current = lvl;
  }
  const idx = LEVELS.indexOf(current);
  const nextLvl = LEVELS[idx + 1];
  if (nextLvl) {
    next = nextLvl.min;
    return { name: current.name, min: current.min, next, progress: Math.min(100, Math.round(((points - current.min) / (nextLvl.min - current.min)) * 100)) };
  }
  return { name: current.name, min: current.min, next: null, progress: 100 };
}
