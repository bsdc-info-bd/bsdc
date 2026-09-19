/**
 * BSDC — src/core/config/search.ts
 * Purpose : Search scopes, field weights, ranking knobs and the command-palette registry.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   :
 *   Search runs in two layers. Remote search (Firestore prefix queries) answers when the backend
 *   is reachable; the device index (built from the offline mirror) answers when it is not, and
 *   answers instantly for anything this device has already seen. Both layers use the same
 *   scoring function in src/entities/search/ranking.ts, so the ordering a person sees does not
 *   change with connectivity — only the coverage does, and the UI says so.
 *   Bangla and English are both first-class: the tokeniser normalises Unicode NFC, strips
 *   zero-width marks and folds case, so "ঢাকা" written two ways matches once.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** The kinds of thing the platform can search. */
export const SEARCH_KINDS = [
  'people',
  'posts',
  'groups',
  'events',
  'jobs',
  'projects',
  'gigs',
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/** Kinds the command palette offers before any query is typed. */
export const DEFAULT_SEARCH_KINDS: readonly SearchKind[] = [
  'people',
  'posts',
  'groups',
  'events',
  'jobs',
];

/** Field weights per kind. A name match outranks a body match, always. */
export const SEARCH_WEIGHTS: Readonly<Record<SearchKind, Readonly<Record<string, number>>>> = {
  people: { username: 10, displayName: 9, displayNameBn: 9, headline: 4, bio: 2, skills: 3 },
  posts: { title: 8, body: 4, tags: 6, authorName: 3 },
  groups: { name: 9, description: 3, tags: 5 },
  events: { title: 9, titleBn: 9, description: 3, venueLabel: 5, tags: 4 },
  jobs: { title: 9, companyName: 7, description: 3, skills: 6, location: 4 },
  projects: { title: 9, summary: 5, description: 2, stack: 6 },
  gigs: { title: 9, description: 3, skills: 6, category: 5 },
};

/** Score bonuses, applied once per hit. */
export const SEARCH_BONUS = {
  /** Whole query matches the whole field. */
  exact: 60,
  /** Field starts with the query. */
  prefix: 30,
  /** Every token matched somewhere. */
  allTokens: 18,
  /** Recency, scaled by the age of the record. */
  freshnessMax: 12,
  /** Popularity, scaled by reactions, members or applicants. */
  popularityMax: 10,
} as const;

/** A hit below this score is not worth showing. */
export const SEARCH_SCORE_FLOOR = 8;

/** Minimum characters before a search runs at all. */
export const SEARCH_MIN_QUERY = 2;

/** Maximum hits returned per kind. */
export const SEARCH_KIND_LIMIT = 8;

/** Maximum hits on the full search route per page. */
export const SEARCH_PAGE_SIZE = 20;

/** How many recent queries are remembered on this device. */
export const RECENT_SEARCH_LIMIT = 8;

/** Half-life used by the freshness bonus, in days. */
export const FRESHNESS_HALF_LIFE_DAYS = 30;

/** A command the palette can run. */
export interface PaletteCommand {
  readonly id: string;
  /** Translation key under the `search` namespace. */
  readonly labelKey: string;
  readonly path: string;
  /** Keywords matched in both languages, lower-cased. */
  readonly keywords: readonly string[];
  /** Shown only to members whose role outranks this one; undefined means everyone. */
  readonly staffOnly?: boolean;
}

/** Static navigation commands, always available in the palette. */
export const PALETTE_COMMANDS: readonly PaletteCommand[] = [
  { id: 'home', labelKey: 'command.home', path: '/', keywords: ['home', 'হোম', 'ফিড'] },
  { id: 'feed', labelKey: 'command.feed', path: '/feed', keywords: ['feed', 'ফিড', 'পোস্ট'] },
  {
    id: 'groups',
    labelKey: 'command.groups',
    path: '/groups',
    keywords: ['groups', 'গ্রুপ', 'community'],
  },
  {
    id: 'events',
    labelKey: 'command.events',
    path: '/events',
    keywords: ['events', 'ইভেন্ট', 'meetup', 'মিটআপ'],
  },
  { id: 'jobs', labelKey: 'command.jobs', path: '/jobs', keywords: ['jobs', 'চাকরি', 'career'] },
  {
    id: 'projects',
    labelKey: 'command.projects',
    path: '/projects',
    keywords: ['projects', 'প্রকল্প', 'open source'],
  },
  {
    id: 'freelancer',
    labelKey: 'command.freelancer',
    path: '/freelancer',
    keywords: ['freelance', 'ফ্রিল্যান্স', 'gig', 'গিগ'],
  },
  {
    id: 'leaderboard',
    labelKey: 'command.leaderboard',
    path: '/leaderboard',
    keywords: ['leaderboard', 'লিডারবোর্ড', 'points', 'পয়েন্ট'],
  },
  {
    id: 'messages',
    labelKey: 'command.messages',
    path: '/messages',
    keywords: ['messages', 'বার্তা', 'chat', 'inbox'],
  },
  {
    id: 'notifications',
    labelKey: 'command.notifications',
    path: '/notifications',
    keywords: ['notifications', 'বিজ্ঞপ্তি'],
  },
  {
    id: 'moderation',
    labelKey: 'command.moderation',
    path: '/moderation',
    keywords: ['moderation', 'মডারেশন', 'reports', 'রিপোর্ট'],
    staffOnly: true,
  },
];

/** Keyboard shortcut that opens the palette. */
export const PALETTE_SHORTCUT = { key: 'k', meta: true } as const;
