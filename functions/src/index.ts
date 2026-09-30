import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getDatabase } from "firebase-admin/database";
import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
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

type ModerationDecision = "DISMISS" | "HIDE_POST";

function requireStaff(request: { auth?: { uid: string; token: Record<string, unknown> } | null }): string {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in with a BSDC staff account first.");
  const role = request.auth.token.role;
  if (role !== "admin" && role !== "moderator") {
    throw new HttpsError("permission-denied", "A trusted BSDC staff role is required for moderation.");
  }
  return request.auth.uid;
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new HttpsError("invalid-argument", `${field} must be a non-empty string up to ${maxLength} characters.`);
  }
  return value.trim();
}

function optionalStaffNote(value: unknown): string {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > 1000) {
    throw new HttpsError("invalid-argument", "Staff note must be text up to 1,000 characters.");
  }
  return value.trim();
}

/**
 * A staff review is an Admin-SDK transaction, not a privileged client-side Firestore update.
 * It atomically closes the immutable report, optionally removes the post from public reads, and
 * leaves an append-only staff audit event.
 */
export const moderateReport = onCall({ region: REGION }, async (request) => {
  const reviewerId = requireStaff(request);
  const payload = request.data as Record<string, unknown>;
  const reportId = requiredString(payload.reportId, "reportId", 256);
  const action = payload.action;
  if (action !== "DISMISS" && action !== "HIDE_POST") {
    throw new HttpsError("invalid-argument", "Moderation action must be DISMISS or HIDE_POST.");
  }
  const note = optionalStaffNote(payload.note);
  const reportRef = firestore.collection("reports").doc(reportId);
  const auditRef = firestore.collection("moderationActions").doc();

  await firestore.runTransaction(async (transaction) => {
    const reportSnapshot = await transaction.get(reportRef);
    if (!reportSnapshot.exists) throw new HttpsError("not-found", "This report no longer exists.");
    const report = reportSnapshot.data() ?? {};
    if (report.state !== "OPEN" || report.targetType !== "post" || typeof report.targetId !== "string") {
      throw new HttpsError("failed-precondition", "This report is no longer open for moderation.");
    }
    const postRef = firestore.collection("posts").doc(report.targetId);
    const postSnapshot = await transaction.get(postRef);
    if (!postSnapshot.exists) throw new HttpsError("not-found", "The reported post no longer exists.");

    const now = FieldValue.serverTimestamp();
    transaction.update(reportRef, {
      state: action === "HIDE_POST" ? "ACTIONED" : "DISMISSED",
      reviewedAt: now,
      reviewerId,
      resolution: action,
      moderationNote: note,
    });
    if (action === "HIDE_POST") {
      transaction.update(postRef, {
        status: "moderated",
        moderatedAt: now,
        moderatedBy: reviewerId,
        updatedAt: now,
      });
    }
    transaction.set(auditRef, {
      kind: "REPORT_REVIEW",
      reportId,
      postId: report.targetId,
      action,
      reviewerId,
      note,
      createdAt: now,
    });
  });
  return { reportId, action: action as ModerationDecision };
});

/** Restoring a hidden post is separately audited and is restricted by the same trusted claim. */
export const restoreModeratedPost = onCall({ region: REGION }, async (request) => {
  const reviewerId = requireStaff(request);
  const payload = request.data as Record<string, unknown>;
  const postId = requiredString(payload.postId, "postId", 256);
  const note = optionalStaffNote(payload.note);
  const postRef = firestore.collection("posts").doc(postId);
  const auditRef = firestore.collection("moderationActions").doc();

  await firestore.runTransaction(async (transaction) => {
    const post = await transaction.get(postRef);
    if (!post.exists) throw new HttpsError("not-found", "This post no longer exists.");
    if (post.data()?.status !== "moderated") {
      throw new HttpsError("failed-precondition", "Only a currently hidden post can be restored.");
    }
    const now = FieldValue.serverTimestamp();
    transaction.update(postRef, {
      status: "published",
      restoredAt: now,
      restoredBy: reviewerId,
      updatedAt: now,
    });
    transaction.set(auditRef, {
      kind: "POST_RESTORATION",
      postId,
      action: "RESTORE_POST",
      reviewerId,
      note,
      createdAt: now,
    });
  });
  return { postId, action: "RESTORE_POST" };
});

const RECENT_LIFECYCLE_AUTH_WINDOW_SECONDS = 10 * 60;

type LifecycleRequestType = "EXPORT" | "ERASURE";

/** Sensitive lifecycle requests demand a freshly authenticated token in addition to the current
 * legal-access claim. A stale but valid session is insufficient for this non-reversible action. */
function requireRecentlyAuthenticatedMember(request: { auth?: { uid: string; token: Record<string, unknown> } | null }): string {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in again before submitting this sensitive request.");
  if (request.auth.token[LEGAL_ACCEPTANCE_CLAIM] !== CURRENT_LEGAL_VERSION) {
    throw new HttpsError("permission-denied", "Accept the current BSDC documents before managing account data.");
  }
  const authTime = request.auth.token.auth_time;
  if (typeof authTime !== "number" || !Number.isFinite(authTime) ||
      authTime > Date.now() / 1000 + 60 || Date.now() / 1000 - authTime > RECENT_LIFECYCLE_AUTH_WINDOW_SECONDS) {
    throw new HttpsError("failed-precondition", "For your protection, sign out and sign in again before submitting this request.");
  }
  return request.auth.uid;
}

/**
 * Creates an account-bound, immutable-from-the-client lifecycle request. This intentionally is
 * not an instant export/delete implementation: completion needs authenticated operations across
 * Firebase, Cloudinary, retention, report, and safety systems before it may be claimed.
 */
export const submitAccountLifecycleRequest = onCall({ region: REGION }, async (request) => {
  const uid = requireRecentlyAuthenticatedMember(request);
  const payload = request.data as Record<string, unknown>;
  const type = payload.type;
  if (type !== "EXPORT" && type !== "ERASURE") {
    throw new HttpsError("invalid-argument", "Request type must be EXPORT or ERASURE.");
  }
  const requestRef = firestore.collection("accountLifecycleRequests").doc(uid);
  await firestore.runTransaction(async (transaction) => {
    const existing = await transaction.get(requestRef);
    const existingState = existing.data()?.state;
    if (existingState === "PENDING" || existingState === "ACKNOWLEDGED") {
      throw new HttpsError("already-exists", "An account data request is already in progress.");
    }
    transaction.set(requestRef, {
      requesterId: uid,
      requestType: type,
      state: "PENDING",
      requestedAt: FieldValue.serverTimestamp(),
    });
  });
  logger.info("Created BSDC account lifecycle request", { uid, type: type as LifecycleRequestType });
  return { type, state: "PENDING" };
});

/** A member may withdraw only a request that operations has not yet acknowledged. */
export const cancelAccountLifecycleRequest = onCall({ region: REGION }, async (request) => {
  const uid = requireRecentlyAuthenticatedMember(request);
  const requestRef = firestore.collection("accountLifecycleRequests").doc(uid);
  await firestore.runTransaction(async (transaction) => {
    const existing = await transaction.get(requestRef);
    if (!existing.exists) throw new HttpsError("not-found", "No account data request was found.");
    if (existing.data()?.state !== "PENDING") {
      throw new HttpsError("failed-precondition", "Only a pending request can be cancelled.");
    }
    transaction.update(requestRef, {
      state: "CANCELLED",
      cancelledAt: FieldValue.serverTimestamp(),
    });
  });
  logger.info("Cancelled BSDC account lifecycle request", { uid });
  return { state: "CANCELLED" };
});

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
