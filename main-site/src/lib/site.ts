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
  create: '/create',
  notifications: '/notifications',
  bookmarks: '/bookmarks',
  trash: '/trash',
  messages: '/messages',
  groups: '/groups',
  events: '/events',
  jobs: '/jobs',
  freelance: '/freelance',
  projects: '/projects',
  playground: '/playground',
  shop: '/shop',
  cart: '/cart',
  checkout: '/checkout',
  orders: '/orders',
  admin: '/admin',
  adminAnalytics: '/admin/analytics',
  adminReports: '/admin/reports',
  adminPlugins: '/admin/plugins',
  adminModeration: '/admin/moderation',
  adminPeople: '/admin/people',
  ads: '/ads',
  vendor: '/vendor',
  vendorProducts: '/vendor/products',
  vendorOrders: '/vendor/orders',
  vendorPayouts: '/vendor/payouts',
  search: '/search',
  learn: '/learn',
  verifyCertificate: '/verify',
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

/** Product permalink: /shop/slug. */
export function productPath(slug: string): string {
  return `/shop/${slug}`;
}

/** Course permalink: /learn/slug. */
export function coursePath(slug: string): string {
  return `/learn/${slug}`;
}

/** Public certificate verification: /verify/code. */
export function certificatePath(code: string): string {
  return `/verify/${code.trim().toUpperCase()}`;
}

/** Tag archive: /tag/slug. */
export function tagPath(slug: string): string {
  return `/tag/${slug}`;
}

/**
 * Profile permalink: /@username (SEO title pattern "bsdc • username").
 *
 * A member who has not claimed a handle has no profile page to link to, so
 * the link goes home rather than to `/@`, which would 404.
 */
export function profilePath(username: string): string {
  const handle = username.trim();
  return handle.length > 0 ? `/@${handle}` : ROUTES.home;
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
