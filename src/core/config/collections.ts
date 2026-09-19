/**
 * BSDC — src/core/config/collections.ts
 * Purpose : Every Firestore collection and Realtime Database path in one typed registry.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A path is data, not a string typed at a call site (ADR-004). Rules, repositories,
 *           the listener registry and the data-model document all read from here, so a renamed
 *           collection is a one-line change and a typo is a compile error.
 *           Firestore holds durable truth; the Realtime Database holds the ephemeral plane only
 *           (presence, typing, receipts, notification fan-out, live counters).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Top-level Firestore collections. */
export const COLLECTIONS = {
  users: 'users',
  usernames: 'usernames',
  posts: 'posts',
  groups: 'groups',
  conversations: 'conversations',
  mediaAssets: 'mediaAssets',
  reports: 'reports',
  appeals: 'appeals',
  auditLogs: 'auditLogs',
  appConfig: 'appConfig',
  featureFlags: 'featureFlags',
  notifications: 'notifications',
  rateLimits: 'rateLimits',
  passkeys: 'passkeys',
  stories: 'stories',
  events: 'events',
  jobs: 'jobs',
  projects: 'projects',
  gigs: 'gigs',
  gigOrders: 'gigOrders',
  broadcasts: 'broadcasts',
  reportDocuments: 'reportDocuments',
  reputationEvents: 'reputationEvents',
} as const;

/** Firestore subcollections, keyed by their parent collection. */
export const SUBCOLLECTIONS = {
  saved: 'saved',
  drafts: 'drafts',
  devices: 'devices',
  comments: 'comments',
  reactions: 'reactions',
  members: 'members',
  joinRequests: 'joinRequests',
  messages: 'messages',
  followers: 'followers',
  following: 'following',
  rsvps: 'rsvps',
  applications: 'applications',
  views: 'views',
  badges: 'badges',
} as const;

/** Realtime Database roots. */
export const RTDB_PATHS = {
  presence: 'presence',
  typing: 'typing',
  receipts: 'receipts',
  conversationMembers: 'conversationMembers',
  notificationFanout: 'notificationFanout',
  liveCounters: 'liveCounters',
  liveEvents: 'liveEvents',
  liveAttendees: 'liveAttendees',
  storySeen: 'storySeen',
  gigQueue: 'gigQueue',
} as const;

/**
 * Builds a Firestore document path.
 * @param segments path segments, alternating collection and document ids
 * @returns a slash-joined path
 */
export function docPath(...segments: readonly string[]): string {
  return segments.filter((segment) => segment.length > 0).join('/');
}

/**
 * Path of a user document.
 * @param uid account id
 * @returns the document path
 */
export function userPath(uid: string): string {
  return docPath(COLLECTIONS.users, uid);
}

/**
 * Path of a post document.
 * @param postId post id
 * @returns the document path
 */
export function postPath(postId: string): string {
  return docPath(COLLECTIONS.posts, postId);
}

/**
 * Path of a comment document.
 * @param postId post id
 * @param commentId comment id
 * @returns the document path
 */
export function commentPath(postId: string, commentId: string): string {
  return docPath(COLLECTIONS.posts, postId, SUBCOLLECTIONS.comments, commentId);
}

/**
 * Path of a reaction document, whose id is the reacting account id.
 * @param postId post id
 * @param uid reacting account id
 * @returns the document path
 */
export function reactionPath(postId: string, uid: string): string {
  return docPath(COLLECTIONS.posts, postId, SUBCOLLECTIONS.reactions, uid);
}

/**
 * Path of a group member document.
 * @param groupId group id
 * @param uid account id
 * @returns the document path
 */
export function groupMemberPath(groupId: string, uid: string): string {
  return docPath(COLLECTIONS.groups, groupId, SUBCOLLECTIONS.members, uid);
}

/**
 * Path of a conversation message document.
 * @param conversationId conversation id
 * @param messageId message id
 * @returns the document path
 */
export function messagePath(conversationId: string, messageId: string): string {
  return docPath(COLLECTIONS.conversations, conversationId, SUBCOLLECTIONS.messages, messageId);
}

/**
 * Path of a user notification document.
 * @param uid account id
 * @param notificationId notification id
 * @returns the document path
 */
export function notificationPath(uid: string, notificationId: string): string {
  return docPath(COLLECTIONS.users, uid, COLLECTIONS.notifications, notificationId);
}

/**
 * Path of a saved-post marker.
 * @param uid account id
 * @param postId post id
 * @returns the document path
 */
export function savedPostPath(uid: string, postId: string): string {
  return docPath(COLLECTIONS.users, uid, SUBCOLLECTIONS.saved, postId);
}

/**
 * Path of a cloud draft.
 * @param uid account id
 * @param draftId draft id
 * @returns the document path
 */
export function draftPath(uid: string, draftId: string): string {
  return docPath(COLLECTIONS.users, uid, SUBCOLLECTIONS.drafts, draftId);
}

/**
 * Presence node of an account in the Realtime Database.
 * @param uid account id
 * @returns the database path
 */
export function presencePath(uid: string): string {
  return `${RTDB_PATHS.presence}/${uid}`;
}

/**
 * Typing node of one account inside one conversation.
 * @param conversationId conversation id
 * @param uid account id
 * @returns the database path
 */
export function typingPath(conversationId: string, uid: string): string {
  return `${RTDB_PATHS.typing}/${conversationId}/${uid}`;
}

/**
 * Membership mirror used by the Realtime Database rules to authorise reads.
 * @param conversationId conversation id
 * @param uid account id
 * @returns the database path
 */
export function conversationMemberPath(conversationId: string, uid: string): string {
  return `${RTDB_PATHS.conversationMembers}/${conversationId}/${uid}`;
}

/**
 * Delivery receipt node for one message and one recipient.
 * @param conversationId conversation id
 * @param messageId message id
 * @param uid recipient account id
 * @returns the database path
 */
export function receiptPath(conversationId: string, messageId: string, uid: string): string {
  return `${RTDB_PATHS.receipts}/${conversationId}/${messageId}/${uid}`;
}

/**
 * Ephemeral notification fan-out node.
 * @param uid account id
 * @param notificationId notification id
 * @returns the database path
 */
export function fanoutPath(uid: string, notificationId: string): string {
  return `${RTDB_PATHS.notificationFanout}/${uid}/${notificationId}`;
}

/**
 * Path of a follower edge: `users/{uid}/followers/{followerUid}`.
 * @param uid account being followed
 * @param followerUid account doing the following
 * @returns the document path
 */
export function followerPath(uid: string, followerUid: string): string {
  return docPath(COLLECTIONS.users, uid, SUBCOLLECTIONS.followers, followerUid);
}

/**
 * Path of a following edge: `users/{uid}/following/{targetUid}`.
 * @param uid account doing the following
 * @param targetUid account being followed
 * @returns the document path
 */
export function followingPath(uid: string, targetUid: string): string {
  return docPath(COLLECTIONS.users, uid, SUBCOLLECTIONS.following, targetUid);
}

/**
 * Path of a story document.
 * @param storyId story id
 * @returns the document path
 */
export function storyPath(storyId: string): string {
  return docPath(COLLECTIONS.stories, storyId);
}

/**
 * Path of one viewer of one story.
 * @param storyId story id
 * @param uid viewer account id
 * @returns the document path
 */
export function storyViewPath(storyId: string, uid: string): string {
  return docPath(COLLECTIONS.stories, storyId, SUBCOLLECTIONS.views, uid);
}

/**
 * Path of an event document.
 * @param eventId event id
 * @returns the document path
 */
export function eventPath(eventId: string): string {
  return docPath(COLLECTIONS.events, eventId);
}

/**
 * Path of one person's answer to one event invitation.
 * @param eventId event id
 * @param uid account id
 * @returns the document path
 */
export function rsvpPath(eventId: string, uid: string): string {
  return docPath(COLLECTIONS.events, eventId, SUBCOLLECTIONS.rsvps, uid);
}

/**
 * Path of a job document.
 * @param jobId job id
 * @returns the document path
 */
export function jobPath(jobId: string): string {
  return docPath(COLLECTIONS.jobs, jobId);
}

/**
 * Path of one application to one job. The applicant id is the document id, which is what makes
 * a duplicate application impossible rather than merely unlikely.
 * @param jobId job id
 * @param uid applicant account id
 * @returns the document path
 */
export function applicationPath(jobId: string, uid: string): string {
  return docPath(COLLECTIONS.jobs, jobId, SUBCOLLECTIONS.applications, uid);
}

/**
 * Path of a project document.
 * @param projectId project id
 * @returns the document path
 */
export function projectPath(projectId: string): string {
  return docPath(COLLECTIONS.projects, projectId);
}

/**
 * Path of a project membership record.
 * @param projectId project id
 * @param uid member account id
 * @returns the document path
 */
export function projectMemberPath(projectId: string, uid: string): string {
  return docPath(COLLECTIONS.projects, projectId, SUBCOLLECTIONS.members, uid);
}

/**
 * Path of a gig document.
 * @param gigId gig id
 * @returns the document path
 */
export function gigPath(gigId: string): string {
  return docPath(COLLECTIONS.gigs, gigId);
}

/**
 * Path of a freelancer order document.
 * @param orderId order id
 * @returns the document path
 */
export function orderPath(orderId: string): string {
  return docPath(COLLECTIONS.gigOrders, orderId);
}

/**
 * Path of a manual broadcast draft. Only an admin may create one and only a Cloud Function may
 * send it (LAW-09: no automated broadcast ever leaves this platform).
 * @param broadcastId broadcast id
 * @returns the document path
 */
export function broadcastPath(broadcastId: string): string {
  return docPath(COLLECTIONS.broadcasts, broadcastId);
}

/**
 * Path of an appeal against a moderation decision.
 * @param appealId appeal id
 * @returns the document path
 */
export function appealPath(appealId: string): string {
  return docPath(COLLECTIONS.appeals, appealId);
}

/**
 * Path of an earned badge on a profile.
 * @param uid account id
 * @param badgeId badge id from src/core/config/points.ts
 * @returns the document path
 */
export function badgePath(uid: string, badgeId: string): string {
  return docPath(COLLECTIONS.users, uid, SUBCOLLECTIONS.badges, badgeId);
}

/**
 * Live attendee node for an event in the Realtime Database.
 * @param eventId event id
 * @returns the database path
 */
export function liveAttendeesPath(eventId: string): string {
  return `${RTDB_PATHS.liveAttendees}/${eventId}`;
}

/**
 * Ephemeral "story seen" marker, so a story the device has already shown is not shown twice.
 * @param uid viewer account id
 * @param storyId story id
 * @returns the database path
 */
export function storySeenPath(uid: string, storyId: string): string {
  return `${RTDB_PATHS.storySeen}/${uid}/${storyId}`;
}

/**
 * Path of one person's reaction to one chat message: the account id is the document id, which is
 * what lets the rules refuse a write that touches somebody else's reaction.
 * @param conversationId conversation id
 * @param messageId message id
 * @param uid reacting account id
 * @returns the document path
 */
export function messageReactionPath(
  conversationId: string,
  messageId: string,
  uid: string,
): string {
  return docPath(
    COLLECTIONS.conversations,
    conversationId,
    SUBCOLLECTIONS.messages,
    messageId,
    SUBCOLLECTIONS.reactions,
    uid,
  );
}

/**
 * Path of one person's request to join one group. The account id is the document id, so asking
 * twice updates the same request instead of creating two for a manager to arbitrate.
 * @param groupId group id
 * @param uid applicant account id
 * @returns the document path
 */
export function groupJoinRequestPath(groupId: string, uid: string): string {
  return docPath(COLLECTIONS.groups, groupId, SUBCOLLECTIONS.joinRequests, uid);
}
