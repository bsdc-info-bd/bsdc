import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getDatabase } from "firebase-admin/database";
import { logger } from "firebase-functions";
import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { onValueCreated } from "firebase-functions/v2/database";
import { onSchedule } from "firebase-functions/v2/scheduler";

initializeApp();

const REGION = "asia-southeast1";
const firestore = getFirestore();
const CURRENT_LEGAL_VERSION = "2026-09-30";
const LEGAL_ACCEPTANCE_CLAIM = "legalAcceptanceVersion";
const REQUIRED_LEGAL_DOCUMENTS = [
  { id: "terms-2026-09-30", version: CURRENT_LEGAL_VERSION },
  { id: "privacy-2026-09-30", version: CURRENT_LEGAL_VERSION },
] as const;

type DeviceRecord = { token?: string };
type NotificationPayload = {
  kind: "comment" | "reaction" | "follow" | "message";
  title: string;
  body: string;
  targetPath: string;
  actorId?: string;
};

/** Recomputing counters is retry-safe; increments inside at-least-once event handlers are not. */
async function recomputeCount(documentPath: string, collectionPath: string, field: string): Promise<void> {
  const aggregate = await firestore.collection(collectionPath).count().get();
  await firestore.doc(documentPath).set({ [field]: aggregate.data().count }, { merge: true });
}

async function notifyUser(uid: string, payload: NotificationPayload): Promise<void> {
  const notification = firestore.collection("profiles").doc(uid).collection("notifications").doc();
  await notification.set({
    recipientId: uid,
    actorId: payload.actorId ?? null,
    kind: payload.kind.toUpperCase(),
    title: payload.title,
    body: payload.body,
    targetPath: payload.targetPath,
    isRead: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  const devices = await firestore.collection("profiles").doc(uid).collection("devices").get();
  const tokens = devices.docs
    .map((device) => ({ id: device.id, token: (device.data() as DeviceRecord).token }))
    .filter((item): item is { id: string; token: string } => Boolean(item.token));
  if (tokens.length === 0) return;

  const response = await getMessaging().sendEachForMulticast({
    tokens: tokens.map((item) => item.token),
    data: {
      kind: payload.kind,
      title: payload.title.slice(0, 100),
      body: payload.body.slice(0, 240),
      targetPath: payload.targetPath,
    },
    android: { priority: "high", notification: { channelId: payload.kind === "message" ? "messages" : "community_updates" } },
  });
  await Promise.all(response.responses.map(async (result, index) => {
    if (!result.success && ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(result.error?.code ?? "")) {
      await devices.docs.find((item) => item.id === tokens[index].id)?.ref.delete();
    }
  }));
}

/**
 * Database rules trust only this Admin-issued claim for community writes. The source Firestore
 * records are immutable and rule-validated, so a mobile client cannot mint its own authorization.
 * Existing custom claims (for example staff role) are preserved when the legal-version claim is set.
 */
export const grantLegalAccessAfterAcceptance = onDocumentWritten(
  { document: "profiles/{uid}/legalAcceptances/{documentId}", region: REGION },
  async (event) => {
    if (!event.data?.after.exists) return;
    const uid = event.params.uid;
    const records = await Promise.all(
      REQUIRED_LEGAL_DOCUMENTS.map(({ id }) => firestore.doc(`profiles/${uid}/legalAcceptances/${id}`).get()),
    );
    const allCurrent = records.every((record, index) => {
      const expected = REQUIRED_LEGAL_DOCUMENTS[index];
      const data = record.data();
      return data?.documentId === expected.id
        && data?.documentVersion === expected.version
        && data?.source === "android_native"
        && (data?.locale === "en" || data?.locale === "bn")
        && data?.acceptedAt != null;
    });
    if (!allCurrent) return;

    const auth = getAuth();
    const user = await auth.getUser(uid);
    if (user.customClaims?.[LEGAL_ACCEPTANCE_CLAIM] === CURRENT_LEGAL_VERSION) return;
    await auth.setCustomUserClaims(uid, {
      ...(user.customClaims ?? {}),
      [LEGAL_ACCEPTANCE_CLAIM]: CURRENT_LEGAL_VERSION,
    });
    logger.info("Granted current BSDC legal access", { uid, version: CURRENT_LEGAL_VERSION });
  },
);

export const countPostReactions = onDocumentWritten(
  { document: "posts/{postId}/reactions/{uid}", region: REGION },
  async (event) => recomputeCount(`posts/${event.params.postId}`, `posts/${event.params.postId}/reactions`, "reactionCount"),
);

export const countPostComments = onDocumentWritten(
  { document: "posts/{postId}/comments/{commentId}", region: REGION },
  async (event) => recomputeCount(`posts/${event.params.postId}`, `posts/${event.params.postId}/comments`, "commentCount"),
);

export const countFollowers = onDocumentWritten(
  { document: "profiles/{uid}/followers/{followerUid}", region: REGION },
  async (event) => recomputeCount(`profiles/${event.params.uid}`, `profiles/${event.params.uid}/followers`, "followerCount"),
);

export const countFollowing = onDocumentWritten(
  { document: "profiles/{uid}/following/{targetUid}", region: REGION },
  async (event) => recomputeCount(`profiles/${event.params.uid}`, `profiles/${event.params.uid}/following`, "followingCount"),
);

/** Series counters are recomputed so retries and a post moving between series stay correct. */
export const countSeriesPosts = onDocumentWritten(
  { document: "posts/{postId}", region: REGION },
  async (event) => {
    const beforeSeries = event.data?.before.data()?.seriesId as string | undefined;
    const afterSeries = event.data?.after.data()?.seriesId as string | undefined;
    const affected = [...new Set([beforeSeries, afterSeries].filter((id): id is string => Boolean(id)))];
    await Promise.all(affected.map(async (seriesId) => {
      const count = await firestore.collection("posts")
        .where("seriesId", "==", seriesId)
        .where("status", "==", "published")
        .count().get();
      await firestore.doc(`series/${seriesId}`).set({ postCount: count.data().count, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }));
  },
);

/**
 * Scheduled posts are promoted by trusted infrastructure. Clients can request a schedule but
 * never need a privileged publishing credential. The query is bounded and idempotent.
 */
export const publishScheduledPosts = onSchedule(
  { schedule: "every 5 minutes", region: REGION, timeZone: "Asia/Dhaka" },
  async () => {
    const due = await firestore.collection("posts")
      .where("status", "==", "scheduled")
      .where("scheduledAt", "<=", Timestamp.now())
      .limit(100)
      .get();
    if (due.empty) return;
    const batch = firestore.batch();
    due.docs.forEach((document) => {
      batch.update(document.ref, {
        status: "published",
        publishedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
    logger.info("Published scheduled BSDC posts", { count: due.size });
  },
);

export const notifyPostAuthorOfComment = onDocumentCreated(
  { document: "posts/{postId}/comments/{commentId}", region: REGION },
  async (event) => {
    const comment = event.data?.data();
    const post = (await firestore.doc(`posts/${event.params.postId}`).get()).data();
    if (!comment || !post || post.authorId === comment.authorId) return;
    await notifyUser(post.authorId, {
      kind: "comment",
      title: "New comment on your post",
      body: `${String(comment.authorName || "A member")} commented on your discussion.`,
      targetPath: `/posts/${event.params.postId}`,
      actorId: comment.authorId,
    });
  },
);

export const notifyPostAuthorOfReaction = onDocumentCreated(
  { document: "posts/{postId}/reactions/{uid}", region: REGION },
  async (event) => {
    const post = (await firestore.doc(`posts/${event.params.postId}`).get()).data();
    if (!post || post.authorId === event.params.uid) return;
    await notifyUser(post.authorId, {
      kind: "reaction",
      title: "New reaction on your post",
      body: "A member reacted to your post.",
      targetPath: `/posts/${event.params.postId}`,
      actorId: event.params.uid,
    });
  },
);

export const notifyFollowedMember = onDocumentCreated(
  { document: "profiles/{uid}/followers/{followerUid}", region: REGION },
  async (event) => {
    const follower = (await firestore.doc(`profiles/${event.params.followerUid}`).get()).data();
    await notifyUser(event.params.uid, {
      kind: "follow",
      title: "You have a new follower",
      body: `${String(follower?.displayName || "A BSDC member")} started following you.`,
      targetPath: `/profile/${event.params.followerUid}`,
      actorId: event.params.followerUid,
    });
  },
);

/** Trusted backend fan-out for chat notifications; the client never holds an FCM server key. */
export const notifyChatParticipants = onValueCreated(
  { ref: "/messages/{conversationId}/{messageId}", region: REGION },
  async (event) => {
    const message = event.data.val() as { senderId?: string; body?: string; kind?: string };
    if (!message.senderId) return;
    const conversation = (await getDatabase().ref(`conversations/${event.params.conversationId}`).get()).val() as {
      participants?: Record<string, boolean>;
      kind?: string;
      title?: string;
    } | null;
    const recipients = Object.keys(conversation?.participants ?? {}).filter((uid) => uid !== message.senderId);
    const sender = (await firestore.doc(`profiles/${message.senderId}`).get()).data();
    const senderName = String(sender?.displayName || "BSDC member");
    const preview = message.kind === "image" ? "Sent an image" : message.kind === "audio" ? "Sent a voice note" : String(message.body || "New message");
    const groupTitle = String(conversation?.title || "BSDC group");
    await Promise.all(recipients.map((uid) => notifyUser(uid, {
      kind: "message",
      title: conversation?.kind === "group" ? groupTitle : senderName,
      body: conversation?.kind === "group" ? `${senderName}: ${preview}` : preview,
      targetPath: `/messages/${event.params.conversationId}`,
      actorId: message.senderId,
    })));
  },
);

// Kept exported for deployment observability: Firebase logs it when a malformed event is retried.
export const logDeletedComment = onDocumentDeleted(
  { document: "posts/{postId}/comments/{commentId}", region: REGION },
  async (event) => logger.info("Comment deleted", { postId: event.params.postId, commentId: event.params.commentId }),
);
