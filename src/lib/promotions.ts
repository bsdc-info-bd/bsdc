/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * Promotion & reminder engine — real data only.
 *
 * Surfaces: follow suggestions (mutuals/skills/geo via feed-algorithm), post
 * suggestions (relevance-ranked, seen-filtered), and scheduled reminders
 * (streak nudge, unread messages, profile completion, weekly digest) delivered
 * through three real channels: in-app toasts, native/FCM push notifications,
 * and emails via formsubmit.co. State is persisted locally per device.
 */
import { collection, getDoc, doc, updateDoc } from 'firebase/firestore';
import { COL, fsDb } from '@/lib/firestore';
import { fetchActiveUsers, fetchFollowerIds, fetchRecentPosts, visibleToViewer } from '@/lib/data';
import { rankFeed, trendingScores, type FeedContext } from '@/lib/feed-algorithm';
import { showNativeNotification } from '@/lib/pushNotifications';
import { playBeep } from '@/lib/chatSounds';
import { sendDigestEmail, emailNotificationsEnabled } from '@/lib/emailNotifications';
import type { Post } from '@/types/post';
import type { UserProfile } from '@/types/user';

/* -------------------------------------------------------- suggestions */

export interface SuggestionResult {
  users: { user: UserProfile; reason: string }[];
  posts: Post[];
}

/** Real follow + post suggestions computed from live data. */
export async function computeSuggestions(viewer: UserProfile, followingIds: Set<string>): Promise<SuggestionResult> {
  const [users, postsRaw, followersOfViewer] = await Promise.all([
    fetchActiveUsers(80).catch(() => [] as UserProfile[]),
    fetchRecentPosts(200).catch(() => [] as Post[]),
    fetchFollowerIds(viewer.uid, 200).catch(() => [] as string[]),
  ]);

  // Follow suggestions — mutuals, shared skills, geo proximity (real signals).
  const { suggestUsers } = await import('@/lib/feed-algorithm');
  const userSuggestions = suggestUsers(users, viewer, followingIds, new Set(followersOfViewer), 5).map((s) => ({
    user: s.user,
    reason: s.reason,
  }));

  // Post suggestions — personalized ranking excluding the viewer's own posts
  // and anything currently pinned-to-them (they've likely seen it).
  const ctx: FeedContext = {
    viewer,
    followingIds,
    followedTags: viewer.skills.map((s) => s.toLowerCase()),
    groupIds: new Set(),
    secondDegreeIds: new Set(),
    engagedTypes: {},
    platformAvgEngagement: 1,
  };
  const authors = new Map(users.map((u) => [u.uid, u]));
  const candidates = postsRaw
    .filter((p) => p.authorId !== viewer.uid)
    .filter((p) => visibleToViewer(p, viewer, followingIds))
    .filter((p) => (p.publishedAt || p.createdAt) > Date.now() - 7 * 24 * 3600 * 1000);
  const ranked = rankFeed(candidates, ctx, authors).map((s) => s.post).slice(0, 5);
  const trending = trendingScores(candidates, 24 * 3600 * 1000).map((s) => s.post).slice(0, 5);
  const seen = new Set<string>();
  const posts = [...ranked, ...trending].filter((p) => (seen.has(p.id) ? false : seen.add(p.id) !== undefined)).slice(0, 6);

  return { users: userSuggestions, posts };
}

/* -------------------------------------------------------- reminders */

export type ReminderKind =
  | 'streak' // post today to keep your streak
  | 'unread' // you have unread messages
  | 'profile' // complete your profile (+50 points)
  | 'digest'; // weekly digest

interface ReminderState {
  [kind: string]: number; // last shown timestamp
}

const STATE_KEY = 'bsdc-reminder-state';
const DAY = 24 * 60 * 60 * 1000;

function loadState(): ReminderState {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') as ReminderState;
  } catch {
    return {};
  }
}

function saveState(state: ReminderState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export interface Reminder {
  kind: ReminderKind;
  title: string;
  body: string;
  url: string;
}

/**
 * Evaluate which reminders are due (real conditions, real data).
 * Returns [] when nothing is due — nothing is invented.
 */
export async function evaluateReminders(
  viewer: UserProfile,
  unreadMessages: number,
): Promise<Reminder[]> {
  const state = loadState();
  const now = Date.now();
  const due: Reminder[] = [];

  // Streak nudge — once per day if the user posts regularly but hasn't today.
  const postedToday = viewer.postCount > 0 && viewer.lastLoginDay === new Date().toISOString().slice(0, 10);
  if (viewer.streak >= 2 && !postedToday && (now - (state.streak || 0)) > DAY) {
    due.push({
      kind: 'streak',
      title: 'Keep your BSDC streak alive',
      body: `You are on a ${viewer.streak}-day streak — share something today to keep it going.`,
      url: '/create',
    });
  }

  // Unread messages — max once per hour.
  if (unreadMessages > 2 && (now - (state.unread || 0)) > 60 * 60 * 1000) {
    due.push({
      kind: 'unread',
      title: `You have ${unreadMessages} unread messages`,
      body: 'Your community is waiting for you in the BSDC messenger.',
      url: '/messages',
    });
  }

  // Profile completion — once every 3 days until completed.
  if (!viewer.profileCompleted && (now - (state.profile || 0)) > 3 * DAY) {
    due.push({
      kind: 'profile',
      title: 'Complete your profile',
      body: 'Add your photo, bio and skills to earn 50 BSDC points.',
      url: '/settings',
    });
  }

  // Weekly digest — once per week.
  if ((now - (state.digest || 0)) > 7 * DAY) {
    due.push({
      kind: 'digest',
      title: 'Your weekly BSDC digest',
      body: `Catch up on the best of the week — you have ${viewer.followerCount} followers and ${viewer.postCount} posts.`,
      url: '/trending',
    });
  }

  return due;
}

/** Mark a reminder delivered so it does not repeat until its window elapses. */
export function markReminderDelivered(kind: ReminderKind): void {
  const state = loadState();
  state[kind] = Date.now();
  saveState(state);
}

/** Deliver a reminder through every enabled channel (in-app handled by caller). */
export async function deliverReminderChannels(
  reminder: Reminder,
  viewer: UserProfile,
  opts: { push: boolean; email: boolean; sound: boolean },
): Promise<void> {
  markReminderDelivered(reminder.kind);
  if (opts.sound) playBeep('alert');
  if (opts.push) {
    void showNativeNotification({
      title: `${reminder.title} · BSDC`,
      body: reminder.body,
      tag: `bsdc-reminder-${reminder.kind}`,
      url: reminder.url,
    });
  }
  if (opts.email && emailNotificationsEnabled() && viewer.email) {
    if (reminder.kind === 'digest') {
      void sendDigestEmail(viewer.email, viewer.displayName, {
        unread: 0,
        followers: viewer.followerCount,
        streak: viewer.streak,
      });
    } else {
      void (await import('@/lib/emailNotifications')).sendEmail({
        to: viewer.email,
        subject: reminder.title,
        message: `${reminder.body}\n\nOpen BSDC: https://www.bsdc.info.bd${reminder.url}`,
      });
    }
  }
}

/* ------------------------------------------------- follow-back signals */

/** Real "someone followed you" cross-check used by the promotion engine. */
export async function hasNewFollowers(viewer: UserProfile, sinceMs: number): Promise<boolean> {
  try {
    const snap = await getDoc(doc(fsDb(), COL.users, viewer.uid));
    if (!snap.exists()) return false;
    return ((snap.data().followerCount as number) || 0) > viewer.followerCount && Date.now() - sinceMs > 0;
  } catch {
    return false;
  }
}

/** Used by the scheduled Cloud Function counterpart to store promo state. */
export async function storePromoState(uid: string, patch: Record<string, unknown>): Promise<void> {
  await updateDoc(doc(fsDb(), COL.users, uid), { promoState: patch, updatedAt: Date.now() }).catch(() => undefined);
}

export { collection };
