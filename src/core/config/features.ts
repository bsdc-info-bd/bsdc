/**
 * BSDC — src/core/config/features.ts
 * Purpose : The plugin / feature-flag registry seed (PART 04 LAW-11, PART 19.2/17).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   :
 *   Every platform capability is a plugin with a stable key. All flags default to ON; only a
 *   passkey holder may toggle them, and toggles support a schedule (start/end datetime).
 *   This file is the build-time seed of the register. The runtime copy lives in Firestore
 *   (`featureFlags`) and is merged over this seed in RESPONSE 4; unknown remote keys are
 *   ignored so a bad remote document can never disable the shell.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Lifecycle state of a flag in the shipped build. */
export type FlagStatus = 'shipped' | 'beta' | 'planned';

/** A single plugin / feature-flag definition. */
export interface FlagDefinition {
  /** Stable dotted key, e.g. `feed.ranking`. Never renamed after release. */
  readonly key: string;
  /** Owning module (maps to src/features/*). */
  readonly module: string;
  readonly labelBn: string;
  readonly labelEn: string;
  readonly description: string;
  /** Enabled by default — LAW-11 requires every feature to be on unless explicitly disabled. */
  readonly defaultOn: boolean;
  /** When true, toggling requires the plugin passkey and writes an audit entry. */
  readonly passkeyRequired: boolean;
  /** Routes hidden when the flag is off (used by the router guard and the admin matrix). */
  readonly surfaces: readonly string[];
  readonly status: FlagStatus;
}

/**
 * Flag keys as a const object so call sites cannot mistype a string.
 * `useFlag(FLAG_KEYS.feedRanking)` is the only approved access pattern.
 */
export const FLAG_KEYS = {
  shell: 'shell',
  shellCommandPalette: 'shell.commandPalette',
  shellBottomNav: 'shell.bottomNav',
  shellRailNav: 'shell.railNav',
  themeEngine: 'theme.engine',
  themeOled: 'theme.oled',
  themeHighContrast: 'theme.highContrast',
  i18n: 'i18n',
  i18nBanglaNumerals: 'i18n.banglaNumerals',
  i18nLocaleSwitcher: 'i18n.localeSwitcher',
  a11y: 'a11y',
  a11yLiveAnnouncer: 'a11y.liveAnnouncer',
  a11yReducedMotion: 'a11y.reducedMotion',
  pwa: 'pwa',
  pwaInstallPrompt: 'pwa.installPrompt',
  pwaOffline: 'pwa.offline',
  launchCountdown: 'launch.countdown',
  launchMaintenanceMode: 'launch.maintenanceMode',
  networkHub: 'network.hub',
  designSystemLab: 'designSystem.lab',
  feed: 'feed',
  feedRanking: 'feed.ranking',
  feedInfiniteScroll: 'feed.infiniteScroll',
  feedPullToRefresh: 'feed.pullToRefresh',
  composer: 'composer',
  composerDrafts: 'composer.drafts',
  composerSchedule: 'composer.schedule',
  search: 'search',
  searchCommandPalette: 'search.commandPalette',
  searchPeople: 'search.people',
  profiles: 'profiles',
  profilesFollowGraph: 'profiles.followGraph',
  profilesEditor: 'profiles.editor',
  messenger: 'messenger',
  messengerVoiceNotes: 'messenger.voiceNotes',
  messengerEncryption: 'messenger.encryption',
  notifications: 'notifications',
  notificationsPush: 'notifications.push',
  notificationsSound: 'notifications.sound',
  notificationsOneSignalManual: 'notifications.oneSignalManual',
  stories: 'stories',
  storiesComposer: 'stories.composer',
  groups: 'groups',
  pages: 'pages',
  events: 'events',
  eventsMap: 'events.map',
  jobs: 'jobs',
  jobsApplications: 'jobs.applications',
  freelancer: 'freelancer',
  projects: 'projects',
  gamification: 'gamification',
  gamificationLeaderboards: 'gamification.leaderboards',
  marketplace: 'marketplace',
  marketplaceVendorOnboarding: 'marketplace.vendorOnboarding',
  marketplaceBkashManual: 'marketplace.bkashManual',
  marketplaceQrVerification: 'marketplace.qrVerification',
  marketplaceLabelPrinting: 'marketplace.labelPrinting',
  ads: 'ads',
  adsEngine: 'ads.engine',
  adsManualInvoice: 'ads.manualInvoice',
  licensing: 'licensing',
  creatorProgram: 'creatorProgram',
  moderation: 'moderation',
  moderationAutoFlag: 'moderation.autoFlag',
  moderationAppeals: 'moderation.appeals',
  reports: 'reports',
  reportsScheduledPdf: 'reports.scheduledPdf',
  brandingStudio: 'brandingStudio',
  analytics: 'analytics',
  seo: 'seo',
  seoPrerender: 'seo.prerender',
  seoSitemap: 'seo.sitemap',
  seoRss: 'seo.rss',
  nativeAndroid: 'native.android',
  adminConsole: 'admin.console',
  adminFeatureFlags: 'admin.featureFlags',
  adminAuditTrail: 'admin.auditTrail',
  adminRecoveryBin: 'admin.recoveryBin',
} as const;

export type FlagKey = (typeof FLAG_KEYS)[keyof typeof FLAG_KEYS];

const def = (
  key: string,
  module: string,
  labelBn: string,
  labelEn: string,
  description: string,
  options: Partial<
    Omit<FlagDefinition, 'key' | 'module' | 'labelBn' | 'labelEn' | 'description'>
  > = {},
): FlagDefinition => ({
  key,
  module,
  labelBn,
  labelEn,
  description,
  defaultOn: options.defaultOn ?? true,
  passkeyRequired: options.passkeyRequired ?? false,
  surfaces: options.surfaces ?? [],
  status: options.status ?? 'shipped',
});

/** Build-time seed of the register. Extended per response; never trimmed. */
export const FLAG_REGISTRY: readonly FlagDefinition[] = [
  def(FLAG_KEYS.shell, 'shell', 'অ্যাপ শেল', 'App shell', 'Persistent app chrome and routing.', {
    passkeyRequired: true,
    surfaces: ['*'],
  }),
  def(
    FLAG_KEYS.shellCommandPalette,
    'shell',
    'কমান্ড প্যালেট',
    'Command palette',
    'Ctrl/Cmd+K command palette for navigation and quick actions.',
    { surfaces: ['*'] },
  ),
  def(
    FLAG_KEYS.shellBottomNav,
    'shell',
    'নিচের নেভিগেশন',
    'Bottom navigation',
    'Bottom tab bar on viewports at or below 768px.',
    { surfaces: ['*'] },
  ),
  def(
    FLAG_KEYS.shellRailNav,
    'shell',
    'রেল নেভিগেশন',
    'Rail navigation',
    'Left rail navigation between 1024px and 1679px.',
    { surfaces: ['*'] },
  ),
  def(FLAG_KEYS.themeEngine, 'theme', 'থিম ইঞ্জিন', 'Theme engine', 'Nine switchable themes.'),
  def(
    FLAG_KEYS.themeOled,
    'theme',
    'OLED ব্ল্যাক',
    'OLED black',
    'Pure-black theme for OLED panels.',
    { status: 'shipped' },
  ),
  def(
    FLAG_KEYS.themeHighContrast,
    'theme',
    'হাই কনট্রাস্ট',
    'High contrast',
    'WCAG AAA high-contrast theme.',
    { status: 'shipped' },
  ),
  def(
    FLAG_KEYS.i18n,
    'i18n',
    'দ্বিভাষিক ইন্টারফেস',
    'Bilingual interface',
    'Bangla and English UI.',
  ),
  def(
    FLAG_KEYS.i18nBanglaNumerals,
    'i18n',
    'বাংলা সংখ্যা',
    'Bangla numerals',
    'Render numbers as ০১২৩৪৫৬৭৮৯ per locale or user preference.',
  ),
  def(
    FLAG_KEYS.i18nLocaleSwitcher,
    'i18n',
    'ভাষা পরিবর্তন',
    'Locale switcher',
    'Header locale switcher with hreflang-correct URLs.',
  ),
  def(FLAG_KEYS.a11y, 'a11y', 'অ্যাক্সেসিবিলিটি', 'Accessibility', 'WCAG 2.2 AA affordances.'),
  def(
    FLAG_KEYS.a11yLiveAnnouncer,
    'a11y',
    'লাইভ ঘোষণা',
    'Live announcer',
    'Screen-reader announcements for route and state changes.',
  ),
  def(
    FLAG_KEYS.a11yReducedMotion,
    'a11y',
    'কম অ্যানিমেশন',
    'Reduced motion',
    'Honour prefers-reduced-motion across the product.',
  ),
  def(FLAG_KEYS.pwa, 'pwa', 'PWA', 'PWA', 'Installable progressive web app.', {
    status: 'shipped',
  }),
  def(
    FLAG_KEYS.pwaInstallPrompt,
    'pwa',
    'ইনস্টল প্রম্পট',
    'Install prompt',
    'Branded install prompt after meaningful engagement.',
    { status: 'shipped' },
  ),
  def(
    FLAG_KEYS.pwaOffline,
    'pwa',
    'অফলাইন মোড',
    'Offline mode',
    'Cached shell, last feed and queued actions while offline.',
    { status: 'shipped' },
  ),
  def(
    FLAG_KEYS.launchCountdown,
    'launch',
    'লঞ্চ কাউন্টডাউন',
    'Launch countdown',
    'Live countdown to the admin-configured launch timestamp.',
  ),
  def(
    FLAG_KEYS.launchMaintenanceMode,
    'launch',
    'মেইনটেনেন্স মোড',
    'Maintenance mode',
    'Public maintenance page with staff bypass.',
    { defaultOn: false, passkeyRequired: true, surfaces: ['/maintenance'] },
  ),
  def(
    FLAG_KEYS.networkHub,
    'network',
    'নেটওয়ার্ক হাব',
    'Network hub',
    'BSDC network links in the footer.',
  ),
  def(
    FLAG_KEYS.designSystemLab,
    'designSystem',
    'ডিজাইন সিস্টেম ল্যাব',
    'Design system lab',
    'Interactive catalogue of every primitive, token and theme.',
    { surfaces: ['/design-system'] },
  ),
  def(FLAG_KEYS.feed, 'feed', 'ফিড', 'Feed', 'Home feed surfaces.', { status: 'planned' }),
  def(
    FLAG_KEYS.feedRanking,
    'feed',
    'ফিড র‍্যাঙ্কিং',
    'Feed ranking',
    'Four-stage retrieval and ranking pipeline.',
    { status: 'planned' },
  ),
  def(
    FLAG_KEYS.feedInfiniteScroll,
    'feed',
    'ইনফিনিট স্ক্রল',
    'Infinite scroll',
    'Cursor-paginated infinite feed with sentinels.',
    { status: 'planned' },
  ),
  def(
    FLAG_KEYS.feedPullToRefresh,
    'feed',
    'পুল টু রিফ্রেশ',
    'Pull to refresh',
    'Pull-to-refresh gesture on touch surfaces.',
  ),
  def(FLAG_KEYS.composer, 'composer', 'কম্পোজার', 'Composer', 'Universal posting system.', {
    status: 'planned',
  }),
  def(
    FLAG_KEYS.composerDrafts,
    'composer',
    'খসড়া',
    'Drafts',
    'Local and cloud draft autosave with recovery.',
    { status: 'planned' },
  ),
  def(
    FLAG_KEYS.composerSchedule,
    'composer',
    'শিডিউল',
    'Scheduling',
    'Timezone-aware scheduled publishing.',
    { status: 'planned' },
  ),
  def(FLAG_KEYS.search, 'search', 'অনুসন্ধান', 'Search', 'Search across every entity.', {
    status: 'shipped',
    surfaces: ['/search'],
  }),
  def(
    FLAG_KEYS.searchCommandPalette,
    'search',
    'কমান্ড প্যালেট অনুসন্ধান',
    'Command palette search',
    'Search inside the command palette.',
    { status: 'shipped', surfaces: ['*'] },
  ),
  def(
    FLAG_KEYS.searchPeople,
    'search',
    'মানুষ খোঁজা',
    'People search',
    'Search the member directory by handle and name.',
    { status: 'shipped', surfaces: ['/search', '/u/:username'] },
  ),
  def(
    FLAG_KEYS.profiles,
    'profiles',
    'প্রোফাইল',
    'Profiles',
    'Public member profiles with portfolio sections.',
    { status: 'shipped', surfaces: ['/u/:username'] },
  ),
  def(
    FLAG_KEYS.profilesFollowGraph,
    'profiles',
    'ফলো গ্রাফ',
    'Follow graph',
    'Follow and unfollow members, with follower counts.',
    { status: 'shipped', surfaces: ['/u/:username'] },
  ),
  def(
    FLAG_KEYS.profilesEditor,
    'profiles',
    'প্রোফাইল সম্পাদনা',
    'Profile editor',
    'Edit your own headline, bio, skills and links.',
    { status: 'shipped', surfaces: ['/u/:username'] },
  ),
  def(
    FLAG_KEYS.messenger,
    'messenger',
    'মেসেঞ্জার',
    'Messenger',
    'BSDC Messenger realtime suite.',
    {
      status: 'shipped',
      surfaces: ['/messages'],
    },
  ),
  def(
    FLAG_KEYS.messengerVoiceNotes,
    'messenger',
    'ভয়েস নোট',
    'Voice notes',
    'Voice notes up to 20 seconds with waveform.',
    { status: 'planned' },
  ),
  def(
    FLAG_KEYS.messengerEncryption,
    'messenger',
    'এন্ড-টু-এন্ড এনক্রিপশন',
    'End-to-end encryption',
    'WebCrypto AES-GCM encryption for 1:1 and group chats.',
    { status: 'planned' },
  ),
  def(
    FLAG_KEYS.notifications,
    'notifications',
    'নোটিফিকেশন',
    'Notifications',
    'Notification engine.',
    {
      status: 'planned',
    },
  ),
  def(
    FLAG_KEYS.notificationsPush,
    'notifications',
    'পুশ নোটিফিকেশন',
    'Push notifications',
    'FCM web push and native Android push.',
    { status: 'planned' },
  ),
  def(
    FLAG_KEYS.notificationsSound,
    'notifications',
    'নোটিফিকেশন সাউন্ড',
    'Notification sound',
    'WebAudio alert tones with user-controlled volume.',
    { status: 'planned' },
  ),
  def(
    FLAG_KEYS.notificationsOneSignalManual,
    'notifications',
    'OneSignal ম্যানুয়াল ব্রডকাস্ট',
    'OneSignal manual broadcast',
    'Human-triggered broadcasts only. Never automated (LAW-09).',
    { defaultOn: false, passkeyRequired: true, status: 'planned' },
  ),
  def(FLAG_KEYS.stories, 'stories', 'রিয়েল স্টোরি', 'Real Story', '24-hour story system.', {
    status: 'shipped',
    surfaces: ['/stories', '/feed'],
  }),
  def(
    FLAG_KEYS.storiesComposer,
    'stories',
    'স্টোরি তৈরি',
    'Story composer',
    'Publish a 24-hour image story with a caption.',
    { status: 'shipped', surfaces: ['/stories'] },
  ),
  def(FLAG_KEYS.groups, 'groups', 'গ্রুপ', 'Groups', 'Public, closed and secret groups.', {
    status: 'planned',
  }),
  def(FLAG_KEYS.pages, 'pages', 'পেজ', 'Pages', 'Organisation and project pages.', {
    status: 'planned',
  }),
  def(FLAG_KEYS.events, 'events', 'ইভেন্ট', 'Events', 'Virtual, physical and hybrid events.', {
    status: 'shipped',
    surfaces: ['/events', '/events/:eventId'],
  }),
  def(
    FLAG_KEYS.eventsMap,
    'events',
    'ইভেন্ট মানচিত্র',
    'Event map',
    'OSM venue picker for events.',
    {
      status: 'shipped',
      surfaces: ['/events/:eventId'],
    },
  ),
  def(FLAG_KEYS.jobs, 'jobs', 'চাকরি', 'Jobs', 'Job board with structured applications.', {
    status: 'shipped',
    surfaces: ['/jobs', '/jobs/:jobId'],
  }),
  def(
    FLAG_KEYS.jobsApplications,
    'jobs',
    'চাকরির আবেদন',
    'Job applications',
    'Apply, track and withdraw applications with a cover note.',
    { status: 'shipped', surfaces: ['/jobs/:jobId'] },
  ),
  def(
    FLAG_KEYS.freelancer,
    'freelancer',
    'ফ্রিল্যান্সার হাব',
    'Freelancer hub',
    'Gig catalogues and orders.',
    {
      status: 'shipped',
      surfaces: ['/freelancer'],
    },
  ),
  def(FLAG_KEYS.projects, 'projects', 'প্রজেক্ট', 'Projects', 'Project showcase entities.', {
    status: 'shipped',
    surfaces: ['/projects'],
  }),
  def(
    FLAG_KEYS.gamification,
    'gamification',
    'গেমিফিকেশন',
    'Gamification',
    'Reputation, levels and badges.',
    {
      status: 'shipped',
      surfaces: ['/leaderboard'],
    },
  ),
  def(
    FLAG_KEYS.gamificationLeaderboards,
    'gamification',
    'লিডারবোর্ড',
    'Leaderboards',
    'Weekly, monthly and yearly leaderboards with opt-out.',
    { status: 'shipped', surfaces: ['/leaderboard'] },
  ),
  def(
    FLAG_KEYS.marketplace,
    'marketplace',
    'মার্কেটপ্লেস',
    'Marketplace',
    'Order-based vendor marketplace.',
    {
      status: 'planned',
      surfaces: ['/market', '/vendor'],
    },
  ),
  def(
    FLAG_KEYS.marketplaceVendorOnboarding,
    'marketplace',
    'বিক্রেতা অনবোর্ডিং',
    'Vendor onboarding',
    'Multi-step vendor onboarding with KYC.',
    { status: 'planned' },
  ),
  def(
    FLAG_KEYS.marketplaceBkashManual,
    'marketplace',
    'বিকাশ ম্যানুয়াল পেমেন্ট',
    'bKash manual payment',
    'Manual bKash send-money verification flow.',
    { status: 'planned' },
  ),
  def(
    FLAG_KEYS.marketplaceQrVerification,
    'marketplace',
    'কিউআর যাচাই',
    'QR verification',
    'Public QR verification pages for orders.',
    { status: 'planned' },
  ),
  def(
    FLAG_KEYS.marketplaceLabelPrinting,
    'marketplace',
    'লেবেল প্রিন্ট',
    'Label printing',
    'Thermal 4x6 and A4 order labels.',
    { status: 'planned' },
  ),
  def(FLAG_KEYS.ads, 'ads', ' বিজ্ঞাপন', 'Ads', 'BSDC Ads Engine.', {
    status: 'planned',
    surfaces: ['/ads'],
  }),
  def(
    FLAG_KEYS.adsEngine,
    'ads',
    'বিজ্ঞাপন ইঞ্জিন',
    'Ads engine',
    'Automatic delivery, pacing and ledger.',
    {
      status: 'planned',
    },
  ),
  def(
    FLAG_KEYS.adsManualInvoice,
    'ads',
    'বিজ্ঞাপন ইনভয়েস',
    'Ads invoice',
    'Branded invoice PDF with QR and secure link.',
    { status: 'planned' },
  ),
  def(
    FLAG_KEYS.licensing,
    'licensing',
    'লাইসেন্স রেজিস্ট্রি',
    'Licence registry',
    'Signed online software licences.',
    {
      status: 'planned',
    },
  ),
  def(
    FLAG_KEYS.creatorProgram,
    'creatorProgram',
    'ক্রিয়েটর প্রোগ্রাম',
    'Creator program',
    'Creator milestones and applications.',
    {
      status: 'planned',
    },
  ),
  def(
    FLAG_KEYS.moderation,
    'moderation',
    'মডারেশন',
    'Moderation',
    'Report queues, actions and appeals.',
    {
      status: 'shipped',
      surfaces: ['/moderation'],
    },
  ),
  def(
    FLAG_KEYS.moderationAutoFlag,
    'moderation',
    'স্বয়ংক্রিয় ফ্ল্যাগ',
    'Automatic flagging',
    'Keyword, pattern and link-reputation heuristics.',
    { status: 'shipped', surfaces: ['/moderation'] },
  ),
  def(
    FLAG_KEYS.moderationAppeals,
    'moderation',
    'আপিল',
    'Appeals',
    'One appeal per decision, reviewed by a different moderator.',
    { status: 'shipped', surfaces: ['/moderation'] },
  ),
  def(FLAG_KEYS.reports, 'reports', 'প্রতিবেদন', 'Reports', 'Report and PDF engine.', {
    status: 'shipped',
  }),
  def(
    FLAG_KEYS.reportsScheduledPdf,
    'reports',
    'নির্ধারিত প্রতিবেদন',
    'Scheduled reports',
    'Hourly to yearly scheduled PDF reports.',
    { status: 'planned' },
  ),
  def(
    FLAG_KEYS.brandingStudio,
    'brandingStudio',
    'ব্র্যান্ডিং স্টুডিও',
    'Branding studio',
    'Admin-only brand asset generator.',
    { status: 'planned', passkeyRequired: true, surfaces: ['/admin/branding-studio'] },
  ),
  def(FLAG_KEYS.analytics, 'analytics', 'অ্যানালিটিক্স', 'Analytics', 'Product analytics engine.', {
    status: 'planned',
  }),
  def(FLAG_KEYS.seo, 'seo', 'এসইও', 'SEO', 'SEO master system.', { status: 'shipped' }),
  def(
    FLAG_KEYS.seoPrerender,
    'seo',
    'প্রি-রেন্ডার',
    'Prerender',
    'Build-time and snapshot prerendering.',
    {
      status: 'shipped',
    },
  ),
  def(FLAG_KEYS.seoSitemap, 'seo', 'সাইটম্যাপ', 'Sitemap', 'Firestore-driven split sitemaps.', {
    status: 'shipped',
  }),
  def(FLAG_KEYS.seoRss, 'seo', 'আরএসএস', 'RSS feeds', 'RSS 2.0 and Atom feeds.', {
    status: 'shipped',
  }),
  def(
    FLAG_KEYS.nativeAndroid,
    'native',
    'অ্যান্ড্রয়েড অ্যাপ',
    'Android app',
    'Capacitor Android app bd.info.bsdc.app.',
    {
      status: 'shipped',
    },
  ),
  def(
    FLAG_KEYS.adminConsole,
    'admin',
    'প্রশাসন কনসোল',
    'Admin console',
    'Administration: roles, feature flags, audit trail and the recovery bin.',
    {
      passkeyRequired: true,
      surfaces: ['/admin', '/admin/features', '/admin/roles', '/admin/audit', '/admin/recovery'],
    },
  ),
  def(
    FLAG_KEYS.adminFeatureFlags,
    'admin',
    'ফিচার ফ্ল্যাগ',
    'Feature flags',
    'The plugin register: switch a capability off, or schedule it between two dates.',
    {
      passkeyRequired: true,
      surfaces: ['/admin/features'],
    },
  ),
  def(
    FLAG_KEYS.adminAuditTrail,
    'admin',
    'অডিট ট্রেইল',
    'Audit trail',
    'The immutable record of every privileged action, with what changed.',
    { surfaces: ['/admin/audit'] },
  ),
  def(
    FLAG_KEYS.adminRecoveryBin,
    'admin',
    'রিকভারি বিন',
    'Recovery bin',
    'Restore or permanently purge soft-deleted content inside its thirty-day window.',
    { surfaces: ['/admin/recovery'] },
  ),
];

/** Fast lookup map used by the flag client and the admin matrix. */
export const FLAG_MAP: ReadonlyMap<string, FlagDefinition> = new Map(
  FLAG_REGISTRY.map((flag) => [flag.key, flag]),
);

/**
 * Returns the default state of a flag.
 * @param key flag key
 * @returns true when the feature is on by default
 */
export function isFlagOnByDefault(key: string): boolean {
  return FLAG_MAP.get(key)?.defaultOn ?? true;
}
