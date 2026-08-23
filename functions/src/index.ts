/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * BSDC Firebase Cloud Functions
 *
 * These functions are OPTIONAL for the client app (everything critical runs
 * client-side), but they add server-side hardening:
 *   1. onUserCreate   — mirrors the custom `role` claim; assigns superadmin to
 *                       the configured founder email; seeds the profile doc.
 *   2. scheduledCleanup — deletes stories older than 24h and expires job /
 *                       notice posts hourly.
 *   3. sitemap        — regenerates sitemap.xml from Firestore into Hosting-
 *                       compatible storage (or serves it directly for crawlers
 *                       that hit the functions endpoint).
 *
 * Deploy: cd functions && npm i && npm run deploy
 */
import { initializeApp } from 'firebase-admin/app';
import { getDatabase, getFirestore, FieldValue } from 'firebase-admin/firestore';

const rtdbAdmin = getDatabase();
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated, onValueWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';

initializeApp();
const db = getFirestore();

const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || 'rahimchawdhury63@gmail.com').toLowerCase();

/* ------------------------------------------------- superadmin bootstrap */

export const onUserCreate = onDocumentCreated('users/{uid}', async (event) => {
  const uid = event.params.uid;
  const data = event.data?.data() || {};
  const email = String(data.email || '').toLowerCase();

  const claims: Record<string, unknown> = { role: data.role || 'user' };
  if (email === SUPERADMIN_EMAIL) {
    claims.role = 'superadmin';
    await db.doc(`users/${uid}`).set({ role: 'superadmin', isVerified: true }, { merge: true });
  }
  await getAuth().setCustomUserClaims(uid, claims);

  // Welcome email notification record
  await db.collection(`notifications/${uid}/items`).add({
    userId: uid,
    type: 'system',
    actorId: 'platform',
    actorName: 'BSDC',
    actorAvatar: '',
    title: 'Welcome to BSDC — The Pride of Bangladesh',
    body: 'Complete your profile to earn your first 50 BSDC points.',
    link: '/settings',
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
});

/* -------------------------------------------------- scheduled cleanup */

export const scheduledCleanup = onSchedule('every 60 minutes', async () => {
  const now = Date.now();

  // Stories auto-delete after 24 hours
  const stories = await db.collection('stories').where('expiresAt', '<', now).get();
  const storyDeletes = stories.docs.map((d) => d.ref.delete());

  // Publish due scheduled posts
  const scheduled = await db.collection('posts').where('status', '==', 'scheduled').get();
  const publishes = scheduled.docs
    .filter((d) => ((d.data().scheduledAt as number) || 0) <= now)
    .map((d) => d.ref.set({ status: 'published', publishedAt: now, updatedAt: now }, { merge: true }));

  // Expire job / notice posts
  const expiring = await db.collection('posts').get();
  const expiries = expiring.docs
    .filter((d) => {
      const job = d.data().job as { expiryAt?: number } | null;
      const notice = d.data().notice as { expiresAt?: number } | null;
      const expiry = job?.expiryAt || notice?.expiresAt || 0;
      return expiry > 0 && expiry < now && d.data().status === 'published';
    })
    .map((d) => d.ref.set({ status: 'hidden', updatedAt: now }, { merge: true }));

  await Promise.all([...storyDeletes, ...publishes, ...expiries]);
});

/* --------------------------------------------- real Web Push (FCM) */

/**
 * Real background push: when a chat message is written to Realtime DB, every
 * other participant with registered browser push tokens (stored on their
 * Firestore profile by lib/pushNotifications.ts) receives an FCM
 * notification — even with the app closed.
 */
export const onChatMessagePush = onValueWritten(
  { region: 'asia-southeast1', ref: 'chats/{chatId}/messages/{messageId}' },
  async (event) => {
    const after = event.data.after.val() as
      | { senderId?: string; senderName?: string; text?: string; imageUrl?: string; audioUrl?: string; fileUrl?: string; fileName?: string }
      | null;
    if (!after) return; // deleted
    const chatId = event.params.chatId;

    const metaSnap = await rtdbAdmin.ref(`chats/${chatId}/metadata`).get();
    const meta = (metaSnap.val() as { participantIds?: string[]; name?: string } | null) || {};
    const participants = meta.participantIds || [];
    const recipients = participants.filter((uid) => uid !== after.senderId);
    if (recipients.length === 0) return;

    const body =
      after.text?.slice(0, 90) ||
      (after.imageUrl ? 'Sent a photo' : after.audioUrl ? 'Sent a voice note' : after.fileUrl ? `Sent ${after.fileName || 'a file'}` : 'New message');

    const tokens: string[] = [];
    for (const uid of recipients) {
      const userSnap = await db.doc(`users/${uid}`).get();
      const pushTokens = (userSnap.data()?.pushTokens as string[] | undefined) || [];
      tokens.push(...pushTokens);
    }
    if (tokens.length === 0) return;

    await getMessaging().sendEachForMulticast({
      notification: {
        title: meta.name || after.senderName || 'BSDC',
        body,
      },
      data: { url: '/messages' },
      tokens,
      android: { priority: 'high', notification: { icon: 'default', tag: 'bsdc-message' } },
      webpush: {
        notification: { icon: '/favicon-192.png', badge: '/favicon-192.png', tag: 'bsdc-message' },
        fcmOptions: { link: 'https://www.bsdc.info.bd/messages' },
      },
    });
  },
);

/* -------------------------------------------------------- sitemap.xml */

export const sitemap = onRequest({ memory: '256MiB' }, async (_req, res) => {
  const base = 'https://www.bsdc.info.bd';
  const urls: string[] = [
    '', '/explore', '/trending', '/blog', '/qa', '/snippets', '/docs', '/wiki',
    '/projects', '/jobs', '/events', '/groups', '/marketplace', '/directory',
    '/leaderboard', '/creator-program', '/license', '/about', '/contact',
    '/guidelines', '/terms', '/privacy',
  ];

  const posts = await db.collection('posts').where('deleted', '==', false).limit(2000).get();
  posts.docs.forEach((d) => {
    const slug = d.data().slug as string | undefined;
    const type = d.data().type as string | undefined;
    if (slug && type) urls.push(`/${type === 'snippet' ? 'snippet' : type}/${slug}`);
  });

  const users = await db.collection('users').limit(2000).get();
  users.docs.forEach((d) => {
    const username = d.data().username as string | undefined;
    if (username) urls.push(`/p/${username}`);
  });

  const groups = await db.collection('groups').limit(1000).get();
  groups.docs.forEach((d) => {
    const slug = d.data().slug as string | undefined;
    if (slug) urls.push(`/g/${slug}`);
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${base}${u}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`)
    .join('\n')}\n</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.status(200).send(xml);
});
