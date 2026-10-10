import { z } from 'zod';

/**
 * The universal composer produces one shape for every kind of contribution.
 * Kind-specific rules are applied by `draftSchema` below, so a question
 * cannot be published without a title and a snippet cannot be published
 * without code — the same rules the database enforces.
 */
export const POST_KINDS = ['post', 'article', 'question', 'poll', 'snippet', 'media'] as const;
export type PostKind = (typeof POST_KINDS)[number];

export const VISIBILITIES = ['public', 'followers', 'private'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export type PostStatus = 'draft' | 'published' | 'archived' | 'removed';

export const TITLE_MAX = 160;
export const BODY_MAX = 60000;
export const EXCERPT_MAX = 320;
export const CODE_MAX = 20000;
export const TAGS_MAX = 5;
export const POLL_OPTIONS_MIN = 2;
export const POLL_OPTIONS_MAX = 10;

export const CODE_LANGUAGES = [
  'typescript',
  'javascript',
  'php',
  'python',
  'dart',
  'java',
  'kotlin',
  'go',
  'rust',
  'sql',
  'bash',
  'json',
  'html',
  'css',
  'plaintext',
] as const;
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

export interface DraftMedia {
  url: string;
  thumbUrl: string;
  mediaId: string;
  altText: string;
  /** Measured pixels, so the composer can show the arrangement it will publish. */
  width: number | null;
  height: number | null;
}

/** The media fields the attachment queue has once a picture is durably recorded. */
export type ReadyAttachmentMedia = Pick<
  DraftMedia,
  'url' | 'thumbUrl' | 'mediaId' | 'altText' | 'width' | 'height'
>;

export interface PostDraft {
  id: string | null;
  kind: PostKind;
  title: string;
  body: string;
  code: string;
  codeLanguage: CodeLanguage;
  tags: string[];
  media: DraftMedia[];
  pollOptions: string[];
  visibility: Visibility;
  language: 'bn' | 'en';
  allowComments: boolean;
  isSensitive: boolean;
  coverUrl: string;
  updatedAt: string;
}

/**
 * Snapshot the queue's current durable attachments into a draft.
 *
 * The queue is authoritative at submit time: its bridge into React draft state
 * runs in a passive effect and can lag the render that first marks an upload
 * complete. Taking this snapshot prevents a fast publish click from saving the
 * text while silently leaving the just-uploaded image out of `post_media`.
 */
export function withReadyMedia(
  draft: PostDraft,
  ready: readonly ReadyAttachmentMedia[],
): PostDraft {
  return {
    ...draft,
    media: ready.map((item) => ({
      url: item.url,
      thumbUrl: item.thumbUrl,
      mediaId: item.mediaId,
      altText: item.altText,
      width: item.width,
      height: item.height,
    })),
  };
}

/**
 * The draft that opens the editor on an existing post.
 *
 * `updatedAt` is not taken from the post: it is the local autosave clock, and
 * carrying the row's timestamp would make the composer claim an unsaved
 * restore the moment it opens.
 */
export function draftFromPost(post: {
  id: string;
  kind: PostKind;
  title: string;
  body: string;
  code: string;
  codeLanguage: string;
  tags: string[];
  media: {
    mediaId: string;
    url: string;
    thumbUrl: string;
    altText: string;
    width?: number | null;
    height?: number | null;
  }[];
  poll: { label: string }[];
  visibility: Visibility;
  language: 'bn' | 'en';
  allowComments: boolean;
  isSensitive: boolean;
  coverUrl: string;
}): PostDraft {
  const codeLanguage = CODE_LANGUAGES.find((value) => value === post.codeLanguage);
  return {
    id: post.id,
    kind: post.kind,
    title: post.title,
    body: post.body,
    code: post.code,
    codeLanguage: codeLanguage ?? 'typescript',
    tags: post.tags,
    media: post.media.map((item) => ({
      mediaId: item.mediaId,
      url: item.url,
      thumbUrl: item.thumbUrl,
      altText: item.altText,
      width: item.width ?? null,
      height: item.height ?? null,
    })),
    pollOptions: post.poll.length > 0 ? post.poll.map((option) => option.label) : ['', ''],
    visibility: post.visibility,
    language: post.language,
    allowComments: post.allowComments,
    isSensitive: post.isSensitive,
    coverUrl: post.coverUrl,
    updatedAt: new Date(0).toISOString(),
  };
}

export const EMPTY_DRAFT: PostDraft = {
  id: null,
  kind: 'post',
  title: '',
  body: '',
  code: '',
  codeLanguage: 'typescript',
  tags: [],
  media: [],
  pollOptions: ['', ''],
  visibility: 'public',
  language: 'bn',
  allowComments: true,
  isSensitive: false,
  coverUrl: '',
  updatedAt: new Date(0).toISOString(),
};

const mediaSchema = z.object({
  url: z.string().url(),
  thumbUrl: z.string(),
  mediaId: z.string(),
  altText: z.string().max(280),
  // Optional: a draft stored on this device before sizes were kept still has
  // to open. A missing size costs a default shape, not the member's writing.
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
});

/** Shape check used when a locally stored draft is restored. */
export const storedDraftSchema = z.object({
  id: z.string().nullable(),
  kind: z.enum(POST_KINDS),
  title: z.string().max(TITLE_MAX),
  body: z.string().max(BODY_MAX),
  code: z.string().max(CODE_MAX),
  codeLanguage: z.enum(CODE_LANGUAGES),
  tags: z.array(z.string()).max(TAGS_MAX),
  media: z.array(mediaSchema).max(10),
  pollOptions: z.array(z.string().max(80)).max(POLL_OPTIONS_MAX),
  visibility: z.enum(VISIBILITIES),
  language: z.enum(['bn', 'en']),
  allowComments: z.boolean(),
  isSensitive: z.boolean(),
  coverUrl: z.string(),
  updatedAt: z.string(),
});

export type ValidationIssue = { field: keyof PostDraft; messageKey: string };

/** Publish-time validation. Returns every problem, not just the first. */
export function validateDraft(draft: PostDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const title = draft.title.trim();
  const body = draft.body.trim();

  if (draft.kind === 'article' || draft.kind === 'question') {
    if (title.length < 3) issues.push({ field: 'title', messageKey: 'compose.errors.titleShort' });
  }
  if (title.length > TITLE_MAX) {
    issues.push({ field: 'title', messageKey: 'compose.errors.titleLong' });
  }

  if (draft.kind === 'snippet') {
    if (draft.code.trim().length === 0) {
      issues.push({ field: 'code', messageKey: 'compose.errors.codeRequired' });
    }
  } else if (draft.kind === 'poll') {
    const filled = draft.pollOptions.map((option) => option.trim()).filter(Boolean);
    if (filled.length < POLL_OPTIONS_MIN) {
      issues.push({ field: 'pollOptions', messageKey: 'compose.errors.pollOptions' });
    }
    if (new Set(filled).size !== filled.length) {
      issues.push({ field: 'pollOptions', messageKey: 'compose.errors.pollDuplicate' });
    }
    if (body.length === 0 && title.length === 0) {
      issues.push({ field: 'body', messageKey: 'compose.errors.bodyRequired' });
    }
  } else if (draft.kind === 'media') {
    if (draft.media.length === 0) {
      issues.push({ field: 'media', messageKey: 'compose.errors.mediaRequired' });
    }
  } else if (body.length === 0) {
    issues.push({ field: 'body', messageKey: 'compose.errors.bodyRequired' });
  }

  if (body.length > BODY_MAX) issues.push({ field: 'body', messageKey: 'compose.errors.bodyLong' });
  if (draft.tags.length > TAGS_MAX) {
    issues.push({ field: 'tags', messageKey: 'compose.errors.tooManyTags' });
  }

  return issues;
}
