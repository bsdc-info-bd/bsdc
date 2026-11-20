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
  // Required by Google Play: a reachable policy URL for an app that stores
  // profiles, addresses and orders. Public, no sign-in.
  privacy: '/privacy',
  // The terms of service, beside the privacy policy. Public, no sign-in.
  terms: '/terms',
  // Google Play asks for a deletion URL that works without the app installed —
  // a page a reviewer, or a member who no longer has the handset, can open and
  // follow. Public, no sign-in.
  accountDeletion: '/account-deletion',
  contact: '/contact',
  // The page that proves the platform is working, with evidence a member can
  // copy into a support message. Public on purpose: a visitor whose pictures do
  // not load should be able to answer the question without signing in.
  systemCheck: '/system-check',
  login: '/auth/login',
  signup: '/auth/signup',
  reset: '/auth/reset',
  verify: '/auth/verify',
  onboarding: '/onboarding',
  /**
   * Settings is a set of panels, each with its own address.
   *
   * It used to be one address and a `useState`, which meant the back button did
   * nothing, a link could not point at "your privacy settings", and a member who
   * chose a panel could not bookmark it or send it to themselves. `/settings`
   * still exists and redirects to the first panel, so every older link works.
   */
  settings: '/settings',
  settingsAccount: '/settings/account',
  settingsAppearance: '/settings/appearance',
  settingsLanguage: '/settings/language',
  settingsNotifications: '/settings/notifications',
  settingsFeed: '/settings/feed',
  settingsPrivacy: '/settings/privacy',
  settingsSecurity: '/settings/security',
  settingsDanger: '/settings/danger',
  compose: '/compose',
  create: '/create',
  notifications: '/notifications',
  bookmarks: '/bookmarks',
  trash: '/trash',
  messages: '/messages',
  groups: '/groups',
  events: '/events',
  jobs: '/jobs',
  myJobApplications: '/jobs/my-applications',
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
  vendorApply: '/vendor/apply',
  vendorConsole: '/vendor/console',
  adminMarketplace: '/admin/marketplace',
  adminAds: '/admin/ads',
  market: '/marketplace',
  marketCart: '/marketplace/cart',
  marketOrders: '/marketplace/orders',
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

/** Channel permalink: /g/groupSlug/c/channelSlug. */
export function channelPath(groupSlug: string, channelSlug: string): string {
  return `/g/${encodeURIComponent(groupSlug)}/c/${encodeURIComponent(channelSlug)}`;
}

/** Project permalink: /projects/slug. */
export function projectPath(slug: string): string {
  return `${ROUTES.projects}/${encodeURIComponent(slug.trim())}`;
}

/**
 * The owner's editor for one project: /projects/slug/edit.
 *
 * A child of the permalink rather than a separate top-level route, so the thing
 * being edited reads as part of the thing it is — and so a member who is not the
 * owner, arriving here from a shared link, is standing on a path whose parent
 * they can already see.
 */
export function projectEditPath(slug: string): string {
  return `${projectPath(slug)}/edit`;
}

/** Job permalink: /jobs/slug. */
export function jobPath(slug: string): string {
  return `${ROUTES.jobs}/${encodeURIComponent(slug.trim())}`;
}

/** The applicant queue for one job: /jobs/<slug>/applications. */
export function jobApplicationsPath(slug: string): string {
  return `${jobPath(slug)}/applications`;
}

/** A freelance gig's own page: /freelance/<slug>. */
export function gigPath(slug: string): string {
  return `${ROUTES.freelance}/${encodeURIComponent(slug.trim())}`;
}

/** The proposal queue for one gig: /freelance/<slug>/proposals. */
export function gigProposalsPath(slug: string): string {
  return `${gigPath(slug)}/proposals`;
}

/** Event permalink: /events/slug. */
export function eventPath(slug: string): string {
  return `${ROUTES.events}/${encodeURIComponent(slug.trim())}`;
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
