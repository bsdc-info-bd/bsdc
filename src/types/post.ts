/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import type { BaseEntity, ReactionType, Visibility } from './common';

export type PostType =
  | 'text'
  | 'image'
  | 'blog'
  | 'qa'
  | 'snippet'
  | 'docs'
  | 'wiki'
  | 'story'
  | 'project'
  | 'job'
  | 'notice'
  | 'poll';

export const POST_TYPES: PostType[] = [
  'text',
  'image',
  'blog',
  'qa',
  'snippet',
  'docs',
  'wiki',
  'project',
  'job',
  'notice',
  'poll',
];

export type PostStatus = 'draft' | 'published' | 'scheduled' | 'hidden' | 'removed';

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface PollData {
  question: string;
  options: PollOption[];
  multiple: boolean;
  expiresAt: number | null;
  anonymous: boolean;
  totalVotes: number;
}

export interface JobData {
  company: string;
  companyLogo: string;
  jobType: 'remote' | 'onsite' | 'hybrid';
  location: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: 'BDT' | 'USD';
  applyUrl: string;
  requirements: string[];
  expiryAt: number | null;
}

export interface ProjectData {
  repoUrl: string;
  liveUrl: string;
  techStack: string[];
  teamMemberIds: string[];
  starCount: number;
}

export interface SnippetData {
  language: string;
  code: string;
  forks: number;
}

export interface WikiRevision {
  editorId: string;
  editorName: string;
  summary: string;
  editedAt: number;
}

export interface NoticeData {
  priority: 'normal' | 'important' | 'urgent';
  expiresAt: number | null;
}

export interface Post extends BaseEntity {
  slug: string;
  type: PostType;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  authorVerified: boolean;
  authorRole: string;
  title: string;
  body: string;
  images: string[];
  tags: string[];
  visibility: Visibility;
  status: PostStatus;
  groupId: string | null;
  groupName: string | null;
  pinned: boolean;
  featured: boolean;
  publishedAt: number | null;
  scheduledAt: number | null;
  reactionCounts: Record<string, number>;
  reactionTotal: number;
  commentCount: number;
  viewCount: number;
  shareCount: number;
  bookmarkCount: number;
  readingMinutes: number;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  edited: boolean;
  deleted: boolean;
  poll: PollData | null;
  job: JobData | null;
  project: ProjectData | null;
  snippet: SnippetData | null;
  notice: NoticeData | null;
  wikiRevisions: WikiRevision[];
}

export type PostSort = 'forYou' | 'latest' | 'trending' | 'following';

export interface Comment extends BaseEntity {
  postId: string;
  parentCommentId: string | null;
  depth: number;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  authorVerified: boolean;
  body: string;
  imageUrl: string;
  reactionCounts: Record<string, number>;
  reactionTotal: number;
  replyCount: number;
  edited: boolean;
  deleted: boolean;
}

export interface ReactionRecord {
  id: string;
  targetId: string;
  targetType: 'post' | 'comment';
  userId: string;
  username: string;
  type: ReactionType;
  createdAt: number;
}

export interface StoryView {
  userId: string;
  viewedAt: number;
}

export interface Story extends BaseEntity {
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  imageUrl: string;
  caption: string;
  backgroundColor: string;
  viewCount: number;
  viewers: StoryView[];
  expiresAt: number;
}

export interface BookmarkRecord {
  id: string;
  userId: string;
  postId: string;
  createdAt: number;
}
