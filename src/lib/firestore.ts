/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  endBefore,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { DEFAULT_SYSTEM_SETTINGS, type AppNotification, type SystemSettings } from '@/types/domain';
import type { UserProfile } from '@/types/user';
import type { Comment, Post, PostType, Story } from '@/types/post';
import { STORIES_TTL_MS } from '@/config/constants';

export const COL = {
  users: 'users',
  usernames: 'usernames',
  posts: 'posts',
  comments: 'comments',
  reactions: 'reactions',
  follows: 'follows',
  groups: 'groups',
  groupMembers: 'groupMembers',
  notifications: 'notifications',
  reports: 'reports',
  tags: 'tags',
  licenses: 'licenses',
  creatorApplications: 'creatorApplications',
  marketplace: 'marketplace',
  ads: 'ads',
  events: 'events',
  stories: 'stories',
  polls: 'polls',
  pointTransactions: 'pointTransactions',
  bookmarks: 'bookmarks',
  modLogs: 'modLogs',
  adminLogs: 'adminLogs',
  analytics: 'analytics',
  systemConfig: 'systemConfig',
  announcements: 'announcements',
  rsvps: 'rsvps',
  searchLog: 'searchLog',
} as const;

/* ------------------------------------------------------------------ users */

export function normalizeUser(data: DocumentData, uid: string): UserProfile {
  return {
    id: uid,
    uid,
    email: str(data.email),
    username: str(data.username) || uid.slice(0, 10),
    displayName: str(data.displayName) || 'BSDC Member',
    avatar: str(data.avatar),
    coverPhoto: str(data.coverPhoto),
    bio: str(data.bio),
    bioTitle: str(data.bioTitle),
    location: str(data.location),
    geo: normalizeGeo(data.geo),
    website: str(data.website),
    github: str(data.github),
    linkedin: str(data.linkedin),
    twitter: str(data.twitter),
    skills: arr(data.skills),
    education: str(data.education),
    work: str(data.work),
    createdAt: num(data.createdAt),
    updatedAt: num(data.updatedAt),
    joinedAt: num(data.joinedAt) || num(data.createdAt),
    lastActive: num(data.lastActive),
    role: (str(data.role) || 'user') as UserProfile['role'],
    isVerified: Boolean(data.isVerified),
    isCreator: Boolean(data.isCreator),
    followerCount: num(data.followerCount),
    followingCount: num(data.followingCount),
    postCount: num(data.postCount),
    bsdcPoints: num(data.bsdcPoints),
    language: (str(data.language) || 'en') as UserProfile['language'],
    theme: (str(data.theme) || 'light') as UserProfile['theme'],
    isOnline: Boolean(data.isOnline),
    emailVerified: Boolean(data.emailVerified),
    creatorProgramStatus: (str(data.creatorProgramStatus) || 'none') as UserProfile['creatorProgramStatus'],
    softwareLicenses: arr(data.softwareLicenses),
    profileCompleted: Boolean(data.profileCompleted),
    onboardingStep: num(data.onboardingStep),
    provider: str(data.provider),
    streak: num(data.streak),
    lastLoginDay: str(data.lastLoginDay),
  };
}

export function normalizePost(data: DocumentData, id: string): Post {
  const publishedAt = num(data.publishedAt);
  return {
    id,
    slug: str(data.slug) || id,
    type: (str(data.type) || 'text') as PostType,
    authorId: str(data.authorId),
    authorName: str(data.authorName) || 'BSDC Member',
    authorUsername: str(data.authorUsername) || 'unknown',
    authorAvatar: str(data.authorAvatar),
    authorVerified: Boolean(data.authorVerified),
    authorRole: str(data.authorRole) || 'user',
    createdAt: num(data.createdAt),
    updatedAt: num(data.updatedAt) || num(data.createdAt),
    title: str(data.title),
    body: str(data.body),
    images: arr(data.images),
    tags: arr(data.tags),
    visibility: (str(data.visibility) || 'public') as Post['visibility'],
    status: (str(data.status) || 'published') as Post['status'],
    groupId: str(data.groupId) || null,
    groupName: str(data.groupName) || null,
    pinned: Boolean(data.pinned),
    featured: Boolean(data.featured),
    publishedAt: publishedAt || null,
    scheduledAt: num(data.scheduledAt) || null,
    reactionCounts: (data.reactionCounts as Record<string, number>) || {},
    reactionTotal: num(data.reactionTotal),
    commentCount: num(data.commentCount),
    viewCount: num(data.viewCount),
    shareCount: num(data.shareCount),
    bookmarkCount: num(data.bookmarkCount),
    readingMinutes: num(data.readingMinutes) || 1,
    seoTitle: str(data.seoTitle),
    seoDescription: str(data.seoDescription),
    canonicalUrl: str(data.canonicalUrl),
    edited: Boolean(data.edited),
    deleted: Boolean(data.deleted),
    poll: (data.poll as Post['poll']) || null,
    job: (data.job as Post['job']) || null,
    project: (data.project as Post['project']) || null,
    snippet: (data.snippet as Post['snippet']) || null,
    notice: (data.notice as Post['notice']) || null,
    wikiRevisions: arr(data.wikiRevisions) as unknown as Post['wikiRevisions'],
  };
}

export function normalizeComment(data: DocumentData, id: string): Comment {
  return {
    id,
    postId: str(data.postId),
    parentCommentId: str(data.parentCommentId) || null,
    depth: num(data.depth),
    authorId: str(data.authorId),
    authorName: str(data.authorName) || 'BSDC Member',
    authorUsername: str(data.authorUsername) || 'unknown',
    authorAvatar: str(data.authorAvatar),
    authorVerified: Boolean(data.authorVerified),
    createdAt: num(data.createdAt),
    updatedAt: num(data.updatedAt) || num(data.createdAt),
    body: str(data.body),
    imageUrl: str(data.imageUrl),
    reactionCounts: (data.reactionCounts as Record<string, number>) || {},
    reactionTotal: num(data.reactionTotal),
    replyCount: num(data.replyCount),
    edited: Boolean(data.edited),
    deleted: Boolean(data.deleted),
  };
}

export function normalizeStory(data: DocumentData, id: string): Story {
  return {
    id,
    createdAt: num(data.createdAt),
    updatedAt: num(data.updatedAt) || num(data.createdAt),
    authorId: str(data.authorId),
    authorName: str(data.authorName) || 'BSDC Member',
    authorUsername: str(data.authorUsername) || 'unknown',
    authorAvatar: str(data.authorAvatar),
    imageUrl: str(data.imageUrl),
    caption: str(data.caption),
    backgroundColor: str(data.backgroundColor) || '#0A8F3F',
    viewCount: num(data.viewCount),
    viewers: arr(data.viewers) as unknown as Story['viewers'],
    expiresAt: num(data.expiresAt) || num(data.createdAt) + STORIES_TTL_MS,
  };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function normalizeGeo(v: unknown): GeoPointT | null {
  if (typeof v !== 'object' || v === null) return null;
  const lat = (v as { lat?: unknown }).lat;
  const lng = (v as { lng?: unknown }).lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { lat, lng };
}
type GeoPointT = { lat: number; lng: number };
function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/* --------------------------------------------------------------- helpers */

export const fsDb = db;

export function postRef(postId: string) {
  return doc(fsDb(), COL.posts, postId);
}
export function userRef(uid: string) {
  return doc(fsDb(), COL.users, uid);
}

export async function getDocument<T>(path: string, ...pathSegments: string[]): Promise<T | null> {
  const snap = await getDoc(doc(fsDb(), path, ...pathSegments));
  return snap.exists() ? (snap.data() as T) : null;
}

export async function setDocument(path: string, id: string, data: DocumentData, merge = true): Promise<void> {
  await setDoc(doc(fsDb(), path, id), data, { merge });
}

export async function updateDocument(path: string, id: string, data: DocumentData): Promise<void> {
  await updateDoc(doc(fsDb(), path, id), data);
}

export async function deleteDocument(path: string, id: string): Promise<void> {
  await deleteDoc(doc(fsDb(), path, id));
}

export async function addDocument(path: string, data: DocumentData): Promise<string> {
  const ref = await addDoc(collection(fsDb(), path), data);
  return ref.id;
}

export async function listCollection<T>(
  path: string,
  constraints: QueryConstraint[] = [],
  max = 50,
): Promise<(T & { id: string })[]> {
  const q = query(collection(fsDb(), path), ...constraints, limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));
}

export function listenDocument(
  path: string,
  id: string,
  cb: (data: DocumentData | null) => void,
  onError?: (e: FirestoreError) => void,
): () => void {
  return onSnapshot(doc(fsDb(), path, id), (snap) => cb(snap.exists() ? snap.data() : null), onError ?? (() => undefined));
}

export { collection, doc, query, where, orderBy, limit, startAfter, endBefore, documentId, increment, serverTimestamp, writeBatch, onSnapshot, getDoc, getDocs, updateDoc, setDoc, addDoc, deleteDoc };

/* ---------------------------------------------------------- system config */

export async function getSystemSettings(): Promise<SystemSettings> {
  const raw = await getDocument<DocumentData>(COL.systemConfig, 'settings');
  if (!raw) return DEFAULT_SYSTEM_SETTINGS;
  return { ...DEFAULT_SYSTEM_SETTINGS, ...(raw as Partial<SystemSettings>) };
}

export function listenSystemSettings(cb: (s: SystemSettings) => void): () => void {
  return listenDocument(COL.systemConfig, 'settings', (data) => {
    cb(data ? { ...DEFAULT_SYSTEM_SETTINGS, ...(data as Partial<SystemSettings>) } : DEFAULT_SYSTEM_SETTINGS);
  });
}

export async function saveSystemSettings(patch: Partial<SystemSettings>): Promise<void> {
  await setDocument(COL.systemConfig, 'settings', { ...patch, updatedAt: Date.now() });
}

/* ---------------------------------------------------------- notifications */

export function notificationPath(uid: string) {
  return `${COL.notifications}/${uid}/items`;
}

export async function pushNotification(uid: string, notif: Omit<AppNotification, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
  await addDocument(notificationPath(uid), { ...notif, createdAt: Date.now(), updatedAt: Date.now() });
}

export function isFirestoreError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && String((e as { code: unknown }).code).startsWith('firestore/');
}
