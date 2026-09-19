/**
 * BSDC — src/core/config/app.ts
 * Purpose : Locked product identity, ownership, contact and network facts (PART 03).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   :
 *   PART 03 is a locked block: these values are facts, not preferences, and must never be
 *   invented differently anywhere else in the product. Anything environment-specific
 *   (launch timestamp, URLs) is read from VITE_* env vars with a documented fallback so the
 *   build never fails on a missing variable in a preview environment.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Supported locales. Bangla is the default and is treated as a first-class language. */
export const LOCALES = ['bn', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'bn';

/** Product identity (PART 03.01). */
export const BRAND = {
  short: 'BSDC',
  nameEn: 'Bangladesh Software Development Community',
  nameBn: 'বাংলাদেশ সফটওয়্যার ডেভেলপমেন্ট কমিউনিটি',
  legalLine: 'a platform of RRC Development',
  taglineBn: 'বাংলাদেশের ডেভেলপারদের ঘর',
  taglineEn: "The home of Bangladesh's developers — and of every developer who builds with us.",
  positioning: 'Code. Community. Commerce. One platform.',
} as const;

/** Ownership (PART 03.02). Never rendered from anywhere else. */
export const OWNERSHIP = {
  owner: 'Rizwan Rahim Chowdhury',
  roleLine: 'Owner / CEO / Founder / Lead Developer',
  organisation: 'RRC Development',
  organisationFull: 'RRC Development (Rizwan Rahim Chowdhury Development)',
  ceoEmail: 'rahimchawdhury63@gmail.com',
  ceoSite: 'https://rrc.cloud.bsdc.info.bd',
  organisationSite: 'https://rrc.bsdc.info.bd',
  rootAdminEmail: 'rrc@bsdc.info.bd',
  /** The mandatory legal attribution line (PART 31.4). */
  legalLine: 'a platform of RRC Development',
} as const;

/** Official contact addresses (PART 03.03). */
export const CONTACT = {
  general: 'hello@bsdc.info.bd',
  operations: 'bsdc.rrc@gmail.com',
  security: 'hello@bsdc.info.bd',
  grievance: 'hello@bsdc.info.bd',
} as const;

/**
 * The BSDC network (PART 03.04). Used by the footer Network Hub, the in-app network switcher
 * and the `sameAs` entries of the Organization JSON-LD.
 */
export const NETWORK_SITES = [
  {
    key: 'main',
    labelBn: 'BSDC মূল সাইট',
    labelEn: 'BSDC main site',
    url: 'https://www.bsdc.info.bd',
    descriptionBn: 'কমিউনিটি প্ল্যাটফর্ম — ফিড, গ্রুপ, চাকরি, মার্কেটপ্লেস।',
    descriptionEn: 'The community platform — feed, groups, jobs, marketplace.',
  },
  {
    key: 'preview',
    labelBn: 'প্রিভিউ',
    labelEn: 'Preview',
    url: 'https://bsdc.pages.dev',
    descriptionBn: 'Cloudflare Pages প্রিভিউ বিল্ড।',
    descriptionEn: 'Cloudflare Pages preview build.',
  },
  {
    key: 'rrc',
    labelBn: 'RRC Development',
    labelEn: 'RRC Development',
    url: 'https://rrc.bsdc.info.bd',
    descriptionBn: 'কোম্পানি সাইট — RRC Development।',
    descriptionEn: 'Company site — RRC Development.',
  },
  {
    key: 'cloud',
    labelBn: 'BSDC Cloud',
    labelEn: 'BSDC Cloud',
    url: 'https://cloud.bsdc.info.bd',
    descriptionBn: 'শিক্ষার্থীদের জন্য ফ্রি PHP/MySQL/cron হোস্টিং।',
    descriptionEn: 'Free PHP/MySQL/cron hosting for students and worldwide users.',
  },
  {
    key: 'news',
    labelBn: 'BSDC News',
    labelEn: 'BSDC News',
    url: 'https://news.bsdc.info.bd',
    descriptionBn: 'বিশ্বব্যাপী প্রযুক্তি ও কোডিং খবর।',
    descriptionEn: 'Worldwide technology and coding news.',
  },
  {
    key: 'wiki',
    labelBn: 'BSDC Wiki',
    labelEn: 'BSDC Wiki',
    url: 'https://wiki.bsdc.info.bd',
    descriptionBn: 'উইকি/এনসাইক্লোপিডিয়া প্ল্যাটফর্ম।',
    descriptionEn: 'Wiki and encyclopaedia platform.',
  },
  {
    key: 'docs',
    labelBn: 'BSDC Docs',
    labelEn: 'BSDC Docs',
    url: 'https://docs.bsdc.info.bd',
    descriptionBn: 'ডকুমেন্টেশন প্ল্যাটফর্ম।',
    descriptionEn: 'Documentation platform.',
  },
  {
    key: 'source',
    labelBn: 'সোর্স কোড',
    labelEn: 'Source code',
    url: 'https://github.com/bsdc-info-bd/bsdc',
    descriptionBn: 'সোর্স অফ ট্রুথ — GitHub রিপোজিটরি।',
    descriptionEn: 'Source of truth — the GitHub repository.',
  },
] as const;

/** Environment-derived runtime configuration with safe fallbacks. */
const env = import.meta.env;

/** Canonical site URL used for canonicals, OG tags and JSON-LD `@id` URIs. */
export const SITE_URL: string = env.VITE_APP_URL ?? 'https://www.bsdc.info.bd';

/** Preview origin (Cloudflare Pages). */
export const PREVIEW_URL: string = env.VITE_APP_PREVIEW_URL ?? 'https://bsdc.pages.dev';

/**
 * Launch timestamp (PART 03.05). Admin-configurable at runtime; this is the build-time default
 * used by the countdown widget until the runtime configuration document is read.
 */
export const LAUNCH_DATE: Date = new Date(env.VITE_APP_LAUNCH_DATE ?? '2026-01-01T00:00:00+06:00');

/** OpenStreetMap configuration (PART 06.06). Attribution is mandatory and always visible. */
export const OSM = {
  tileUrl: env.VITE_OSM_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: env.VITE_OSM_ATTRIBUTION ?? '© OpenStreetMap contributors',
} as const;

/** Analytics and indexing switches, defaulted off in development. */
export const FEATURE_ENV = {
  analyticsEnabled: env.VITE_ANALYTICS_ENABLED === 'true',
  indexNowEnabled: env.VITE_ENABLE_INDEXNOW === 'true',
  isProduction: env.PROD,
  isDevelopment: env.DEV,
  mode: env.MODE,
} as const;
