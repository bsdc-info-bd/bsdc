/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId as documentIdField,
  getDoc,
  getDocs,
  increment,
  limit as fsLimit,
  onSnapshot,
  orderBy as fsOrderBy,
  query as fsQuery,
  runTransaction,
  setDoc,
  updateDoc,
  where as fsWhere,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { COL, fsDb, normalizeComment, normalizePost, normalizeStory, normalizeUser, pushNotification } from './firestore';
import { notifyUser } from './notifications';
import { earn } from './points';
import { slugify, truncate, extractMentions, readingMinutes, randomId } from './utils';
import { MAX_TAGS_PER_POST } from '@/config/constants';
import type { Comment, Post, PostType, Story } from '@/types/post';
import type { ReactionType, Visibility } from '@/types/common';
import type { CommunityEvent, Group, Report } from '@/types/domain';
import type { UserProfile } from '@/types/user';
import type { AppNotification } from '@/types/domain';

/* ------------------------------------------------------------------ posts */

export interface CreatePostInput {
  author: UserProfile;
  type: PostType;
  title?: string;
  body: string;
  images?: string[];
  tags?: string[];
  visibility?: Visibility;
  status?: 'draft' | 'published' | 'scheduled';
  scheduledAt?: number | null;
  groupId?: string | null;
  groupName?: string | null;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  snippet?: { language: string; code: string } | null;
  job?: Post['job'];
  project?: Post['project'];
  notice?: Post['notice'];
  poll?: Post['poll'];
}

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || `post-${randomId(6)}`;
  let n = 1;
  // Firestore 'in' queries accept up to 10 values — check batches of candidates.
  for (;;) {
    const batch = Array.from({ length: 5 }, (_, i) => (n === 1 && i === 0 ? root : `${root}-${n + i - 1}`));
    const snap = await getDocs(fsQuery(collection(fsDb(), COL.posts), fsWhere('slug', 'in', batch)));
    const taken = new Set(snap.docs.map((d) => d.data().slug));
    for (const c of batch) if (!taken.has(c)) return c;
    n += 5;
  }
  void root;
}

export async function createPost(input: CreatePostInput): Promise<Post> {
  const now = Date.now();
  const status = input.status || 'published';
  const tags = (input.tags || []).slice(0, MAX_TAGS_PER_POST).map((t) => t.toLowerCase());
  const title = (input.title || '').trim();
  const slug = await uniqueSlug(title || `${input.type}-${truncate(input.body.replace(/\s+/g, ' '), 40)}`);
  const isFirstPost = input.author.postCount === 0;

  const postData: DocumentData = {
    slug,
    type: input.type,
    authorId: input.author.uid,
    authorName: input.author.displayName,
    authorUsername: input.author.username,
    authorAvatar: input.author.avatar,
    authorVerified: input.author.isVerified,
    authorRole: input.author.role,
    title,
    body: input.body,
    images: input.images || [],
    tags,
    visibility: input.visibility || 'public',
    status,
    groupId: input.groupId || null,
    groupName: input.groupName || null,
    pinned: false,
    featured: false,
    publishedAt: status === 'published' ? now : null,
    scheduledAt: status === 'scheduled' ? input.scheduledAt || null : null,
    reactionCounts: {},
    reactionTotal: 0,
    commentCount: 0,
    viewCount: 0,
    shareCount: 0,
    bookmarkCount: 0,
    readingMinutes: readingMinutes(`${title} ${input.body}`),
    seoTitle: input.seoTitle || '',
    seoDescription: input.seoDescription || '',
    canonicalUrl: input.canonicalUrl || '',
    edited: false,
    deleted: false,
    poll: input.poll || null,
    job: input.job || null,
    project: input.project || null,
    snippet: input.snippet ? { ...input.snippet, forks: 0 } : null,
    notice: input.notice || null,
    wikiRevisions: [],
    createdAt: now,
    updatedAt: now,
  };
  const ref = await addDoc(collection(fsDb(), COL.posts), postData);
  const post = normalizePost(postData, ref.id);

  if (status === 'published') {
    await Promise.all([
      updateDoc(doc(fsDb(), COL.users, input.author.uid), { postCount: increment(1), lastActive: now }),
      ...tags.map((t) => setDoc(doc(fsDb(), COL.tags, t), { postCount: increment(1), updatedAt: now, name: t }, { merge: true })),
    ]);
    await earn(input.author.uid, isFirstPost ? 'first_post' : 'publish_post');
    const mentions = extractMentions(`${title} ${input.body}`);
    await Promise.all(
      mentions.map(async (username) => {
        const unameDoc = await getDoc(doc(fsDb(), COL.usernames, username));
        if (!unameDoc.exists()) return;
        const uid = unameDoc.data().uid as string;
        await notifyUser({
          userId: uid,
          type: 'mention',
          actorId: input.author.uid,
          actorName: input.author.displayName,
          actorAvatar: input.author.avatar,
          title: `${input.author.displayName} mentioned you`,
          body: truncate(title || input.body, 80),
          link: `/${postRouteOf(post.type)}/${post.slug}`,
        });
      }),
    );
  }
  return post;
}

export function postRouteOf(type: PostType): string {
  switch (type) {
    case 'blog': return 'blog';
    case 'qa': return 'qa';
    case 'snippet': return 'snippet';
    case 'docs': return 'docs';
    case 'wiki': return 'wiki';
    case 'project': return 'project';
    case 'job': return 'job';
    case 'notice': return 'notice';
    default: return 'post';
  }
}

export async function updatePost(postId: string, patch: Partial<Post>, editorSummary = ''): Promise<void> {
  const ref = doc(fsDb(), COL.posts, postId);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? normalizePost(snap.data(), postId) : null;
  const revision = editorSummary
    ? [...(prev?.wikiRevisions || []), { editorId: '', editorName: '', summary: editorSummary, editedAt: Date.now() }]
    : prev?.wikiRevisions || [];
  const nextBody = patch.body ?? prev?.body ?? '';
  const nextTitle = patch.title ?? prev?.title ?? '';
  await updateDoc(ref, {
    ...patch,
    readingMinutes: readingMinutes(`${nextTitle} ${nextBody}`),
    edited: true,
    updatedAt: Date.now(),
    wikiRevisions: revision,
  });
}

export async function findRelatedPosts(post: Post, limit = 4): Promise<Post[]> {
  const posts = await fetchRecentPosts(200);
  const tags = new Set(post.tags);
  return posts
    .filter((candidate) => candidate.id !== post.id && candidate.status === 'published' && candidate.visibility === 'public')
    .map((candidate) => {
      const sharedTags = candidate.tags.filter((tag) => tags.has(tag)).length;
      const sameType = candidate.type === post.type ? 1 : 0;
      const sameAuthor = candidate.authorId === post.authorId ? 1 : 0;
      return { candidate, score: sharedTags * 4 + sameType + sameAuthor };
    })
    .sort((a, b) => b.score - a.score || (b.candidate.publishedAt || b.candidate.createdAt) - (a.candidate.publishedAt || a.candidate.createdAt))
    .filter((entry) => entry.score > 0)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

export async function softDeletePost(postId: string, removed = true): Promise<void> {
  await updateDoc(doc(fsDb(), COL.posts, postId), { deleted: removed, status: removed ? 'removed' : 'published', updatedAt: Date.now() });
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  const snap = await getDocs(fsQuery(collection(fsDb(), COL.posts), fsWhere('slug', '==', slug), fsLimit(2)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return normalizePost(d.data(), d.id);
}

export async function getPostById(postId: string): Promise<Post | null> {
  const snap = await getDoc(doc(fsDb(), COL.posts, postId));
  return snap.exists() ? normalizePost(snap.data(), postId) : null;
}

export function listenPost(postId: string, cb: (post: Post | null) => void): () => void {
  return onSnapshot(doc(fsDb(), COL.posts, postId), (snap) => cb(snap.exists() ? normalizePost(snap.data(), snap.id) : null));
}

/** Load recent posts and filter client-side — avoids composite index requirements. */
export async function fetchRecentPosts(max = 200): Promise<Post[]> {
  const snap = await getDocs(fsQuery(collection(fsDb(), COL.posts), fsOrderBy('createdAt', 'desc'), fsLimit(max)));
  return snap.docs.map((d) => normalizePost(d.data(), d.id)).filter((p) => !p.deleted);
}

export function visibleToViewer(post: Post, viewer: UserProfile | null, followingIds: Set<string>): boolean {
  if (post.deleted) return false;
  if (post.status === 'scheduled') {
    // Scheduled posts auto-publish when their time arrives.
    if (post.scheduledAt && post.scheduledAt <= Date.now()) return post.visibility === 'public';
    return Boolean(viewer && viewer.uid === post.authorId);
  }
  if (post.status !== 'published') {
    if (viewer && (viewer.uid === post.authorId || viewer.role === 'superadmin' || viewer.role === 'admin' || viewer.role === 'moderator')) {
      return true;
    }
    return false;
  }
  if (!viewer) return post.visibility === 'public';
  if (viewer.uid === post.authorId) return true;
  switch (post.visibility) {
    case 'public': return true;
    case 'followers': return followingIds.has(post.authorId) || roleAtLeastView(viewer);
    case 'group': return post.groupId ? true : false;
    case 'private': return false;
    default: return true;
  }
}

function roleAtLeastView(viewer: UserProfile): boolean {
  return ['superadmin', 'admin', 'moderator'].includes(viewer.role);
}

export async function incrementShareCount(postId: string): Promise<void> {
  await updateDoc(doc(fsDb(), COL.posts, postId), { shareCount: increment(1), updatedAt: Date.now() }).catch(() => undefined);
}

export async function incrementPostView(postId: string): Promise<void> {
  await updateDoc(doc(fsDb(), COL.posts, postId), { viewCount: increment(1) }).catch(() => undefined);
}

/* -------------------------------------------------------------- reactions */

export async function setReaction(
  post: Post,
  viewer: UserProfile,
  reaction: ReactionType,
): Promise<void> {
  const reactionId = `${post.id}_${viewer.uid}`;
  const ref = doc(fsDb(), COL.reactions, reactionId);
  await runTransaction(fsDb(), async (txn) => {
    const snap = await txn.get(ref);
    const prevType = snap.exists() ? (snap.data().type as ReactionType | undefined) : undefined;
    if (prevType === reaction) return;
    const counts = { ...post.reactionCounts };
    if (prevType && counts[prevType]) counts[prevType] -= 1;
    counts[reaction] = (counts[reaction] || 0) + 1;
    const prevTotal = Math.max(0, post.reactionTotal - (prevType ? 1 : 0));
    txn.set(ref, {
      targetId: post.id,
      targetType: 'post',
      userId: viewer.uid,
      username: viewer.username,
      type: reaction,
      createdAt: Date.now(),
    });
    txn.update(doc(fsDb(), COL.posts, post.id), { reactionCounts: counts, reactionTotal: prevTotal + 1 });
  });
  await earn(post.authorId, 'receive_reaction');
  await notifyUser({
    userId: post.authorId,
    type: 'post_reaction',
    actorId: viewer.uid,
    actorName: viewer.displayName,
    actorAvatar: viewer.avatar,
    title: `${viewer.displayName} reacted to your post`,
    body: truncate(post.title || post.body, 80),
    link: `/${postRouteOf(post.type)}/${post.slug}`,
  });
}

export async function removeReaction(post: Post, viewerUid: string): Promise<void> {
  const reactionId = `${post.id}_${viewerUid}`;
  const ref = doc(fsDb(), COL.reactions, reactionId);
  await runTransaction(fsDb(), async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists()) return;
    const prevType = snap.data().type as ReactionType;
    const counts = { ...post.reactionCounts };
    if (counts[prevType]) counts[prevType] -= 1;
    txn.delete(ref);
    txn.update(doc(fsDb(), COL.posts, post.id), {
      reactionCounts: counts,
      reactionTotal: Math.max(0, post.reactionTotal - 1),
    });
  });
}

export async function getMyReaction(targetId: string, viewerUid: string): Promise<ReactionType | null> {
  const snap = await getDoc(doc(fsDb(), COL.reactions, `${targetId}_${viewerUid}`));
  return snap.exists() ? ((snap.data().type as ReactionType) || null) : null;
}

export async function setCommentReaction(comment: Comment, viewer: UserProfile, reaction: ReactionType): Promise<void> {
  const reactionId = `${comment.id}_${viewer.uid}`;
  const ref = doc(fsDb(), COL.reactions, reactionId);
  await runTransaction(fsDb(), async (txn) => {
    const snap = await txn.get(ref);
    const prevType = snap.exists() ? (snap.data().type as ReactionType | undefined) : undefined;
    if (prevType === reaction) return;
    const counts = { ...comment.reactionCounts };
    if (prevType && counts[prevType]) counts[prevType] -= 1;
    counts[reaction] = (counts[reaction] || 0) + 1;
    const prevTotal = Math.max(0, comment.reactionTotal - (prevType ? 1 : 0));
    txn.set(ref, { targetId: comment.id, targetType: 'comment', userId: viewer.uid, username: viewer.username, type: reaction, createdAt: Date.now() });
    txn.update(doc(fsDb(), COL.comments, comment.id), { reactionCounts: counts, reactionTotal: prevTotal + 1 });
  });
}

/* --------------------------------------------------------------- comments */

export async function addComment(
  post: Post,
  viewer: UserProfile,
  body: string,
  parentComment: Comment | null,
  imageUrl = '',
): Promise<Comment> {
  const now = Date.now();
  const commentData: DocumentData = {
    postId: post.id,
    parentCommentId: parentComment?.id || null,
    depth: parentComment ? Math.min(parentComment.depth + 1, 5) : 0,
    authorId: viewer.uid,
    authorName: viewer.displayName,
    authorUsername: viewer.username,
    authorAvatar: viewer.avatar,
    authorVerified: viewer.isVerified,
    body,
    imageUrl,
    reactionCounts: {},
    reactionTotal: 0,
    replyCount: 0,
    edited: false,
    deleted: false,
    createdAt: now,
    updatedAt: now,
  };
  const ref = await addDoc(collection(fsDb(), COL.comments), commentData);
  await Promise.all([
    updateDoc(doc(fsDb(), COL.posts, post.id), { commentCount: increment(1) }),
    ...(parentComment ? [updateDoc(doc(fsDb(), COL.comments, parentComment.id), { replyCount: increment(1) })] : []),
  ]);
  await earn(post.authorId, 'receive_comment');
  if (!parentComment) {
    await notifyUser({
      userId: post.authorId,
      type: 'comment',
      actorId: viewer.uid,
      actorName: viewer.displayName,
      actorAvatar: viewer.avatar,
      title: `${viewer.displayName} commented on your post`,
      body: truncate(body, 80),
      link: `/${postRouteOf(post.type)}/${post.slug}`,
    });
  } else if (parentComment.authorId !== viewer.uid) {
    await notifyUser({
      userId: parentComment.authorId,
      type: 'reply',
      actorId: viewer.uid,
      actorName: viewer.displayName,
      actorAvatar: viewer.avatar,
      title: `${viewer.displayName} replied to your comment`,
      body: truncate(body, 80),
      link: `/${postRouteOf(post.type)}/${post.slug}`,
    });
  }
  return normalizeComment(commentData, ref.id);
}

export async function fetchComments(postId: string, max = 300): Promise<Comment[]> {
  const snap = await getDocs(fsQuery(collection(fsDb(), COL.comments), fsWhere('postId', '==', postId), fsLimit(max)));
  return snap.docs
    .map((d) => normalizeComment(d.data(), d.id))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function editComment(commentId: string, body: string): Promise<void> {
  await updateDoc(doc(fsDb(), COL.comments, commentId), { body, edited: true, updatedAt: Date.now() });
}

export async function deleteComment(comment: Comment): Promise<void> {
  await runTransaction(fsDb(), async (txn) => {
    const postSnap = await txn.get(doc(fsDb(), COL.posts, comment.postId));
    const count = postSnap.exists() ? ((postSnap.data().commentCount as number) || 0) : 0;
    txn.update(doc(fsDb(), COL.comments, comment.id), { deleted: true, body: '', imageUrl: '' });
    txn.update(doc(fsDb(), COL.posts, comment.postId), { commentCount: Math.max(0, count - 1) });
  });
}

export async function acceptAnswer(post: Post, comment: Comment): Promise<void> {
  await updateDoc(doc(fsDb(), COL.comments, comment.id), { accepted: true });
  await earn(comment.authorId, 'accepted_answer');
  await notifyUser({
    userId: comment.authorId,
    type: 'comment',
    actorId: post.authorId,
    actorName: post.authorName,
    actorAvatar: post.authorAvatar,
    title: 'Your answer was accepted',
    body: truncate(post.title || post.body, 80),
    link: `/${postRouteOf(post.type)}/${post.slug}`,
  });
}

/* ---------------------------------------------------------------- follows */

export function followId(followerId: string, followingId: string): string {
  return `${followerId}_${followingId}`;
}

export async function followUser(follower: UserProfile, target: UserProfile): Promise<void> {
  const id = followId(follower.uid, target.uid);
  const snap = await getDoc(doc(fsDb(), COL.follows, id));
  if (snap.exists()) return;
  const batch = writeBatch(fsDb());
  batch.set(doc(fsDb(), COL.follows, id), {
    followerId: follower.uid,
    followingId: target.uid,
    createdAt: Date.now(),
  });
  batch.update(doc(fsDb(), COL.users, follower.uid), { followingCount: increment(1) });
  batch.update(doc(fsDb(), COL.users, target.uid), { followerCount: increment(1) });
  await batch.commit();
  await notifyUser({
    userId: target.uid,
    type: 'new_follower',
    actorId: follower.uid,
    actorName: follower.displayName,
    actorAvatar: follower.avatar,
    title: `${follower.displayName} started following you`,
    link: `/p/${follower.username}`,
  });
}

export async function unfollowUser(followerUid: string, targetUid: string): Promise<void> {
  const id = followId(followerUid, targetUid);
  const snap = await getDoc(doc(fsDb(), COL.follows, id));
  if (!snap.exists()) return;
  const batch = writeBatch(fsDb());
  batch.delete(doc(fsDb(), COL.follows, id));
  batch.update(doc(fsDb(), COL.users, followerUid), { followingCount: increment(-1) });
  batch.update(doc(fsDb(), COL.users, targetUid), { followerCount: increment(-1) });
  await batch.commit();
}

export async function isFollowing(followerUid: string, targetUid: string): Promise<boolean> {
  const snap = await getDoc(doc(fsDb(), COL.follows, followId(followerUid, targetUid)));
  return snap.exists();
}

export async function fetchFollowingIds(uid: string, max = 500): Promise<string[]> {
  const snap = await getDocs(fsQuery(collection(fsDb(), COL.follows), fsWhere('followerId', '==', uid), fsLimit(max)));
  return snap.docs.map((d) => (d.data().followingId as string) || '').filter(Boolean);
}

export async function fetchFollowerIds(uid: string, max = 500): Promise<string[]> {
  const snap = await getDocs(fsQuery(collection(fsDb(), COL.follows), fsWhere('followingId', '==', uid), fsLimit(max)));
  return snap.docs.map((d) => (d.data().followerId as string) || '').filter(Boolean);
}

export async function fetchUsersByIds(uids: string[]): Promise<UserProfile[]> {
  const users: UserProfile[] = [];
  for (let i = 0; i < uids.length; i += 10) {
    const chunk = uids.slice(i, i + 10);
    if (chunk.length === 0) continue;
    const snap = await getDocs(fsQuery(collection(fsDb(), COL.users), fsWhere('uid', 'in', chunk)));
    snap.docs.forEach((d) => users.push(normalizeUser(d.data(), d.id)));
  }
  return users;
}

/* -------------------------------------------------------------- bookmarks */

export async function toggleBookmark(viewer: UserProfile, post: Post): Promise<boolean> {
  const id = `${viewer.uid}_${post.id}`;
  const ref = doc(fsDb(), COL.bookmarks, id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const batch = writeBatch(fsDb());
    batch.delete(ref);
    batch.update(doc(fsDb(), COL.posts, post.id), { bookmarkCount: increment(-1) });
    await batch.commit();
    return false;
  }
  const batch = writeBatch(fsDb());
  batch.set(ref, { userId: viewer.uid, postId: post.id, createdAt: Date.now() });
  batch.update(doc(fsDb(), COL.posts, post.id), { bookmarkCount: increment(1) });
  await batch.commit();
  return true;
}

export async function fetchBookmarkedPosts(viewerUid: string, max = 100): Promise<Post[]> {
  const snap = await getDocs(fsQuery(collection(fsDb(), COL.bookmarks), fsWhere('userId', '==', viewerUid), fsLimit(max)));
  const postIds = snap.docs.map((d) => (d.data().postId as string) || '').filter(Boolean);
  const posts: Post[] = [];
  for (let i = 0; i < postIds.length; i += 10) {
    const chunk = postIds.slice(i, i + 10);
    if (chunk.length === 0) continue;
    const postSnap = await getDocs(fsQuery(collection(fsDb(), COL.posts), fsWhere(documentIdField(), 'in', chunk)));
    postSnap.docs.forEach((d) => posts.push(normalizePost(d.data(), d.id)));
  }
  return posts.sort((a, b) => b.createdAt - a.createdAt);
}

export async function isBookmarked(viewerUid: string, postId: string): Promise<boolean> {
  const snap = await getDoc(doc(fsDb(), COL.bookmarks, `${viewerUid}_${postId}`));
  return snap.exists();
}

/* ------------------------------------------------------------------ users */

export async function getUserByUsername(username: string): Promise<UserProfile | null> {
  const uname = await getDoc(doc(fsDb(), COL.usernames, username.toLowerCase()));
  if (uname.exists()) {
    const uid = uname.data().uid as string;
    const userSnap = await getDoc(doc(fsDb(), COL.users, uid));
    return userSnap.exists() ? normalizeUser(userSnap.data(), uid) : null;
  }
  const snap = await getDocs(fsQuery(collection(fsDb(), COL.users), fsWhere('username', '==', username), fsLimit(2)));
  return snap.empty ? null : normalizeUser(snap.docs[0].data(), snap.docs[0].id);
}

export async function fetchActiveUsers(max = 50): Promise<UserProfile[]> {
  const snap = await getDocs(fsQuery(collection(fsDb(), COL.users), fsOrderBy('lastActive', 'desc'), fsLimit(max)));
  return snap.docs.map((d) => normalizeUser(d.data(), d.id));
}

export async function fetchAllUsers(max = 500): Promise<UserProfile[]> {
  const snap = await getDocs(fsQuery(collection(fsDb(), COL.users), fsLimit(max)));
  return snap.docs.map((d) => normalizeUser(d.data(), d.id));
}

/* ---------------------------------------------------------------- stories */

export async function createStory(viewer: UserProfile, imageUrl: string, caption: string, backgroundColor: string): Promise<void> {
  const now = Date.now();
  await addDoc(collection(fsDb(), COL.stories), {
    authorId: viewer.uid,
    authorName: viewer.displayName,
    authorUsername: viewer.username,
    authorAvatar: viewer.avatar,
    imageUrl,
    caption,
    backgroundColor: backgroundColor || '#0A8F3F',
    viewCount: 0,
    viewers: [],
    expiresAt: now + 24 * 60 * 60 * 1000,
    createdAt: now,
    updatedAt: now,
  });
}

export async function fetchActiveStories(followingIds: string[], viewerUid: string, max = 100): Promise<Story[]> {
  const ids = Array.from(new Set([...followingIds, viewerUid]));
  const stories: Story[] = [];
  for (let i = 0; i < ids.length && i < 30; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const snap = await getDocs(fsQuery(collection(fsDb(), COL.stories), fsWhere('authorId', 'in', chunk), fsLimit(max)));
    snap.docs.forEach((d) => stories.push(normalizeStory(d.data(), d.id)));
  }
  return stories.filter((s) => s.expiresAt > Date.now()).sort((a, b) => b.createdAt - a.createdAt);
}

export async function markStoryViewed(story: Story, viewerUid: string): Promise<void> {
  if (story.viewers.some((v) => v.userId === viewerUid)) return;
  await updateDoc(doc(fsDb(), COL.stories, story.id), {
    viewCount: increment(1),
    viewers: [...story.viewers, { userId: viewerUid, viewedAt: Date.now() }],
  });
}

/* ---------------------------------------------------------------- reports */

export async function submitReport(
  viewer: UserProfile,
  targetType: Report['targetType'],
  targetId: string,
  targetPreview: string,
  reason: string,
  details: string,
): Promise<void> {
  const priority: Report['priority'] = reason === 'spam' ? 'normal' : reason === 'harassment' || reason === 'illegal' ? 'urgent' : 'normal';
  await addDoc(collection(fsDb(), COL.reports), {
    reporterId: viewer.uid,
    reporterName: viewer.displayName,
    targetType,
    targetId,
    targetPreview: truncate(targetPreview, 160),
    reason,
    details,
    priority,
    status: 'open',
    handledBy: '',
    handledAt: 0,
    resolution: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function fetchReports(status?: Report['status'], max = 200): Promise<(Report & { id: string })[]> {
  const q = status
    ? fsQuery(collection(fsDb(), COL.reports), fsWhere('status', '==', status), fsLimit(max))
    : fsQuery(collection(fsDb(), COL.reports), fsLimit(max));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<Report, 'id'>), id: d.id }))
    .sort((a, b) => {
      const order = { urgent: 0, high: 1, normal: 2, low: 3 } as const;
      if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
      return b.createdAt - a.createdAt;
    });
}

export async function resolveReport(report: Report, handler: UserProfile, status: Report['status'], resolution: string): Promise<void> {
  await updateDoc(doc(fsDb(), COL.reports, report.id), {
    status,
    resolution,
    handledBy: handler.uid,
    handledAt: Date.now(),
    updatedAt: Date.now(),
  });
  await addDoc(collection(fsDb(), COL.modLogs), {
    actorId: handler.uid,
    actorName: handler.displayName,
    action: `report:${status}`,
    targetType: report.targetType,
    targetId: report.targetId,
    targetPreview: report.targetPreview,
    reason: resolution,
    severity: 'info',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  if (report.reporterId) {
    await pushNotification(report.reporterId, {
      userId: report.reporterId,
      type: 'moderation_action',
      actorId: handler.uid,
      actorName: handler.displayName,
      actorAvatar: handler.avatar,
      title: 'Your report has been reviewed',
      body: resolution,
      link: '/',
      read: false,
    });
  }
}

/* ----------------------------------------------------------------- groups */

export async function createGroup(
  viewer: UserProfile,
  name: string,
  description: string,
  type: Group['type'],
  category: string,
  coverPhoto: string,
  rules: string[],
): Promise<string> {
  const now = Date.now();
  const slug = `${slugify(name)}-${randomId(4)}`;
  const ref = await addDoc(collection(fsDb(), COL.groups), {
    name,
    slug,
    description,
    coverPhoto,
    type,
    memberCount: 1,
    createdBy: viewer.uid,
    createdByName: viewer.displayName,
    rules,
    tags: [],
    category,
    createdAt: now,
    updatedAt: now,
  });
  await setDoc(doc(fsDb(), COL.groupMembers, `${ref.id}_${viewer.uid}`), {
    groupId: ref.id,
    userId: viewer.uid,
    displayName: viewer.displayName,
    username: viewer.username,
    avatar: viewer.avatar,
    role: 'owner',
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function fetchGroups(max = 100): Promise<(Group & { id: string })[]> {
  const snap = await getDocs(fsQuery(collection(fsDb(), COL.groups), fsLimit(max)));
  return snap.docs.map((d) => ({ ...(d.data() as Omit<Group, 'id'>), id: d.id })).sort((a, b) => b.memberCount - a.memberCount);
}

export async function getGroupBySlug(slug: string): Promise<(Group & { id: string }) | null> {
  const snap = await getDocs(fsQuery(collection(fsDb(), COL.groups), fsWhere('slug', '==', slug), fsLimit(2)));
  return snap.empty ? null : { ...(snap.docs[0].data() as Omit<Group, 'id'>), id: snap.docs[0].id };
}

export async function fetchGroupMembers(groupId: string, max = 200): Promise<{ userId: string; role: string; displayName: string; username: string; avatar: string }[]> {
  const snap = await getDocs(fsQuery(collection(fsDb(), COL.groupMembers), fsWhere('groupId', '==', groupId), fsLimit(max)));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      userId: (data.userId as string) || '',
      role: (data.role as string) || 'member',
      displayName: (data.displayName as string) || 'Member',
      username: (data.username as string) || 'unknown',
      avatar: (data.avatar as string) || '',
    };
  });
}

export async function isGroupMember(groupId: string, uid: string): Promise<boolean> {
  const snap = await getDoc(doc(fsDb(), COL.groupMembers, `${groupId}_${uid}`));
  return snap.exists();
}

export async function joinGroup(group: Group & { id: string }, viewer: UserProfile): Promise<void> {
  const id = `${group.id}_${viewer.uid}`;
  const snap = await getDoc(doc(fsDb(), COL.groupMembers, id));
  if (snap.exists()) return;
  const now = Date.now();
  await setDoc(doc(fsDb(), COL.groupMembers, id), {
    groupId: group.id,
    userId: viewer.uid,
    displayName: viewer.displayName,
    username: viewer.username,
    avatar: viewer.avatar,
    role: 'member',
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await updateDoc(doc(fsDb(), COL.groups, group.id), { memberCount: increment(1) });
}

export async function leaveGroup(groupId: string, uid: string): Promise<void> {
  const id = `${groupId}_${uid}`;
  const snap = await getDoc(doc(fsDb(), COL.groupMembers, id));
  if (!snap.exists()) return;
  await deleteDoc(doc(fsDb(), COL.groupMembers, id));
  await updateDoc(doc(fsDb(), COL.groups, groupId), { memberCount: increment(-1) });
}

/* ----------------------------------------------------------------- events */

export async function createEvent(viewer: UserProfile, input: Omit<CommunityEvent, 'id' | 'createdAt' | 'updatedAt' | 'rsvps' | 'goingCount' | 'interestedCount' | 'hostId' | 'hostName' | 'slug'>): Promise<string> {
  const now = Date.now();
  const ref = await addDoc(collection(fsDb(), COL.events), {
    ...input,
    slug: `${slugify(input.title)}-${randomId(4)}`,
    hostId: viewer.uid,
    hostName: viewer.displayName,
    rsvps: { [viewer.uid]: 'going' },
    goingCount: 1,
    interestedCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function fetchEvents(max = 100): Promise<(CommunityEvent & { id: string })[]> {
  const snap = await getDocs(fsQuery(collection(fsDb(), COL.events), fsLimit(max)));
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<CommunityEvent, 'id'>), id: d.id }))
    .sort((a, b) => a.startsAt - b.startsAt);
}

export async function setRsvp(eventId: string, uid: string, status: 'going' | 'interested' | 'not_going'): Promise<void> {
  await runTransaction(fsDb(), async (txn) => {
    const ref = doc(fsDb(), COL.events, eventId);
    const snap = await txn.get(ref);
    if (!snap.exists()) return;
    const data = snap.data() as CommunityEvent;
    const rsvps = { ...(data.rsvps || {}) };
    const prev = rsvps[uid];
    let going = data.goingCount || 0;
    let interested = data.interestedCount || 0;
    if (prev === 'going') going -= 1;
    if (prev === 'interested') interested -= 1;
    if (status === 'going') going += 1;
    if (status === 'interested') interested += 1;
    rsvps[uid] = status;
    txn.update(ref, { rsvps, goingCount: Math.max(0, going), interestedCount: Math.max(0, interested), updatedAt: Date.now() });
  });
}

/* ------------------------------------------------------------------- polls */

export async function votePoll(post: Post, optionId: string, voterUid: string): Promise<boolean> {
  if (!post.poll) return false;
  const voteDocId = `poll_${post.id}_${voterUid}`;
  const voteRef = doc(fsDb(), COL.polls, voteDocId);
  const prev = await getDoc(voteRef);
  if (prev.exists()) return false;
  await setDoc(voteRef, { pollId: post.id, optionId, voterUid, createdAt: Date.now() });
  const poll = post.poll;
  const options = poll.options.map((o) => (o.id === optionId ? { ...o, votes: o.votes + 1 } : o));
  await updateDoc(doc(fsDb(), COL.posts, post.id), {
    poll: { ...poll, options, totalVotes: poll.totalVotes + 1 },
  });
  return true;
}

export async function hasVoted(postId: string, voterUid: string): Promise<string | null> {
  const snap = await getDoc(doc(fsDb(), COL.polls, `poll_${postId}_${voterUid}`));
  return snap.exists() ? ((snap.data().optionId as string) || null) : null;
}

/* ------------------------------------------------------------------- tags */

export async function fetchPopularTags(max = 30): Promise<{ name: string; postCount: number }[]> {
  const snap = await getDocs(fsQuery(collection(fsDb(), COL.tags), fsLimit(max)));
  return snap.docs
    .map((d) => ({ name: d.id, postCount: ((d.data().postCount as number) || 0) }))
    .filter((t) => t.postCount > 0)
    .sort((a, b) => b.postCount - a.postCount);
}

/* -------------------------------------------------------------- analytics */

export async function logSearchEvent(query: string, resultsCount: number): Promise<void> {
  if (!query.trim()) return;
  await addDoc(collection(fsDb(), COL.searchLog), {
    query: query.slice(0, 120),
    resultsCount,
    createdAt: Date.now(),
  }).catch(() => undefined);
}

export type { AppNotification };
