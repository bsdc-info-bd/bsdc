/**
 * BSDC official fact sheet. These values are the single source of truth for
 * branding, SEO and footer links across the main site.
 */
export const SITE = {
  name: 'Bangladesh Software Development Community',
  shortName: 'BSDC',
  tagline: {
    en: 'The open developer community of Bangladesh',
    bn: 'বাংলাদেশের উন্মুক্ত ডেভেলপার কমিউনিটি',
  },
  url: 'https://www.bsdc.info.bd',
  altUrl: 'https://bsdc.pages.dev',
  repository: 'https://github.com/bsdc-info-bd/bsdc',
  parentOrganization: 'RRC Development',
  emails: {
    primary: 'hello@bsdc.info.bd',
    secondary: 'bsdc.rrc@gmail.com',
  },
  owner: {
    name: 'Rizwan Rahim Chowdhury',
    role: { en: 'Founder & CEO', bn: 'প্রতিষ্ঠাতা ও সিইও' },
    site: 'https://rrc.cloud.bsdc.info.bd',
  },
  androidPackage: 'bd.info.bsdc.app',
  launchYear: 2026,
} as const;

/** Internal routes that exist today. Extended as modules are delivered. */
export const ROUTES = {
  home: '/',
  about: '/about',
  guidelines: '/guidelines',
  contact: '/contact',
  offline: '/offline',
  login: '/auth/login',
  signup: '/auth/signup',
  reset: '/auth/reset',
  verify: '/auth/verify',
  onboarding: '/onboarding',
  settings: '/settings',
  compose: '/compose',
  notifications: '/notifications',
  bookmarks: '/bookmarks',
  messages: '/messages',
  groups: '/groups',
  events: '/events',
} as const;

/** Post permalink: /p/slug. */
export function postPath(slug: string): string {
  return `/p/${slug}`;
}

/** One conversation: /messages/id. */
export function conversationPath(conversationId: string): string {
  return `/messages/${conversationId}`;
}

/** Group permalink: /g/slug. */
export function groupPath(slug: string): string {
  return `/g/${slug}`;
}

/** Tag archive: /tag/slug. */
export function tagPath(slug: string): string {
  return `/tag/${slug}`;
}

/** Profile permalink: /@username (SEO title pattern "bsdc • username"). */
export function profilePath(username: string): string {
  return `/@${username}`;
}

export type RouteKey = keyof typeof ROUTES;

/** RRC ecosystem properties — link partners, not part of this codebase. */
export const ECOSYSTEM_LINKS = [
  { href: 'https://rrc.bsdc.info.bd', labelKey: 'footer.ecosystem.rrc' },
  { href: 'https://cloud.bsdc.info.bd', labelKey: 'footer.ecosystem.cloud' },
  { href: 'https://news.bsdc.info.bd', labelKey: 'footer.ecosystem.news' },
  { href: 'https://wiki.bsdc.info.bd', labelKey: 'footer.ecosystem.wiki' },
  { href: 'https://docs.bsdc.info.bd', labelKey: 'footer.ecosystem.docs' },
] as const;

/** The seven product pillars presented on the home page. */
export const PILLARS = [
  'community',
  'knowledge',
  'opportunity',
  'commerce',
  'advertising',
  'trust',
  'reach',
] as const;

export type Pillar = (typeof PILLARS)[number];
