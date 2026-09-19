/**
 * BSDC — src/core/config/limits.ts
 * Purpose : Every numeric product limit in one auditable place (PART 29.1, PART 11.03).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : No magic numbers in components or services — a limit is always imported from here,
 *           so the composer counter, the upload validator, the Zod schema and the Firestore rule
 *           documentation can never disagree (ADR-017).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Firestore hard limits we must respect (PART 11.03). */
export const FIRESTORE_LIMITS = {
  maxDocumentBytes: 1_048_576,
  maxPostBodyChars: 100_000,
  maxWriteBatchOps: 500,
} as const;

/** Username rules (F-021, F-022). */
export const USERNAME = {
  minLength: 3,
  maxLength: 30,
  pattern: /^[a-z0-9._]+$/,
  /** Handles that can never be claimed. */
  reserved: [
    'admin',
    'root',
    'bsdc',
    'rrc',
    'support',
    'help',
    'moderator',
    'about',
    'settings',
    'market',
    'ads',
    'api',
    'status',
    'security',
    'legal',
    'contact',
    'news',
    'wiki',
    'docs',
    'cloud',
    'team',
    'press',
    'brand',
    'partners',
    'changelog',
    'roadmap',
    'guidelines',
    'terms',
    'privacy',
  ],
} as const;

/** Text limits per surface. */
export const TEXT_LIMITS = {
  bio: 320,
  headline: 120,
  shortPost: 5_000,
  comment: 4_000,
  chatMessage: 8_000,
  storyCaption: 300,
  productDescription: 5_000,
  reportReason: 500,
} as const;

/** Image contexts and their upload ceilings (PART 29.1 STEP 3). */
export const MEDIA_LIMITS = {
  avatar: { maxBytes: 5 * 1024 * 1024, maxEdge: 1024, provider: 'cloudinary' },
  cover: { maxBytes: 10 * 1024 * 1024, maxEdge: 1920, provider: 'cloudinary' },
  feedImage: { maxBytes: 10 * 1024 * 1024, maxEdge: 2048, provider: 'imgbb' },
  chatImage: { maxBytes: 8 * 1024 * 1024, maxEdge: 1600, provider: 'imgbb' },
  chatPdf: { maxBytes: 20 * 1024 * 1024, maxEdge: 0, provider: 'cloudinary' },
  kycDocument: { maxBytes: 10 * 1024 * 1024, maxEdge: 2560, provider: 'firebase-storage' },
  adCreative: { maxBytes: 5 * 1024 * 1024, maxEdge: 2048, provider: 'cloudinary' },
  productImage: { maxBytes: 8 * 1024 * 1024, maxEdge: 2048, provider: 'cloudinary' },
  brandingExport: { maxBytes: 25 * 1024 * 1024, maxEdge: 4096, provider: 'cloudinary' },
  storyImage: { maxBytes: 10 * 1024 * 1024, maxEdge: 1920, provider: 'imgbb' },
  ogImage: { maxBytes: 2 * 1024 * 1024, maxEdge: 1200, provider: 'cloudinary' },
} as const;

export type MediaContext = keyof typeof MEDIA_LIMITS;

/** Accepted image MIME types. Video is refused everywhere (PART 29.1 STEP 1). */
export const ACCEPTED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/heic',
  'application/pdf',
] as const;

/** Magic-byte signatures used to validate files beyond their declared MIME type. */
export const MAGIC_BYTES: readonly { mime: string; signature: readonly number[] }[] = [
  { mime: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', signature: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/gif', signature: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'application/pdf', signature: [0x25, 0x50, 0x44, 0x46] },
  { mime: 'image/webp', signature: [0x52, 0x49, 0x46, 0x46] },
];

/** Feed assembly budgets (PART 12.10). */
export const FEED_BUDGETS = {
  stage1Ms: 120,
  stage2Ms: 25,
  stage3Ms: 60,
  candidatesTarget: 1_200,
  lightRankKeep: 280,
  heavyRankKeep: 120,
  pageSize: 20,
  virtualizationThreshold: 100,
} as const;

/** Rate limits enforced client-side before the server rule applies. */
export const RATE_LIMITS = {
  loginAttemptsPerWindow: 5,
  loginWindowMinutes: 15,
  passkeyAttemptsPerWindow: 5,
  passkeyWindowMinutes: 15,
  messagesPerMinute: 60,
  postsPerHour: 20,
  commentsPerMinute: 10,
  reportsPerDay: 25,
} as const;

/** Voice note ceiling (F-387): 20 seconds, exactly as specified. */
export const VOICE_NOTE_MAX_SECONDS = 20;

/** Retention and recovery windows (LAW-19). */
export const RETENTION = {
  softDeleteRecoveryDays: 30,
  storyHours: 24,
  sessionIdleMinutes: 60,
  auditRetentionDays: 730,
} as const;
