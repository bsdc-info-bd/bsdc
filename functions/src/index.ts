import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getDatabase } from "firebase-admin/database";
import { logger } from "firebase-functions";
import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { onValueCreated } from "firebase-functions/v2/database";

initializeApp();

const REGION = "asia-southeast1";
const firestore = getFirestore();

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
    } | null;
    const recipients = Object.keys(conversation?.participants ?? {}).filter((uid) => uid !== message.senderId);
    const sender = (await firestore.doc(`profiles/${message.senderId}`).get()).data();
    const preview = message.kind === "image" ? "Sent an image" : message.kind === "audio" ? "Sent a voice note" : String(message.body || "New message");
    await Promise.all(recipients.map((uid) => notifyUser(uid, {
      kind: "message",
      title: String(sender?.displayName || "BSDC message"),
      body: preview,
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
