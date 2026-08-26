/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */

export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Bangladesh Software Development Community';
export const APP_SHORT_NAME = 'BSDC';
export const APP_TAGLINE = 'The Pride of Bangladesh — Where Developers Unite';
export const APP_URL = (import.meta.env.VITE_APP_URL || 'https://www.bsdc.info.bd').replace(/\/$/, '');
export const APP_EMAIL = 'hello@bsdc.info.bd';
export const APP_EMAIL_SECONDARY = 'bsdc.rrc@gmail.com';
export const PARENT_ORG = 'RRC Development';
export const FOUNDER_NAME = 'Rizwan Rahim Chowdhury';
export const FOUNDER_SITE = 'https://rrc.cloud.bsdc.info.bd';
export const SISTER_PROJECT_NAME = 'DebateSylhetBD';
export const SISTER_PROJECT_URL = 'https://debatesylhetbd.onrender.com/';
export const SUPERADMIN_EMAIL = (import.meta.env.VITE_SUPERADMIN_EMAIL || '').toLowerCase();

export const CLOUDINARY_CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dpemuwrpz';
export const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'bsdc_unsigned';
export const CLOUDINARY_API_KEY = import.meta.env.VITE_CLOUDINARY_API_KEY || '';
export const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY || '';
export const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID || '';

export const BRAND_COLORS = {
  primary: '#0A8F3F',
  primaryDark: '#097335',
  primaryLight: '#3FC57F',
  secondary: '#1877F2',
  accentTeal: '#14B8A6',
  emerald: '#10B981',
  dark: '#0F0F0F',
  darkRaised: '#1A1A1A',
  light: '#FFFFFF',
};

export const MAX_IMAGES_PER_POST = 10;
export const MAX_TAGS_PER_POST = 5;
export const MAX_POST_BODY_LENGTH = 50000;
export const MAX_TITLE_LENGTH = 160;
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export const PAGE_SIZE = 10;
export const FEED_PAGE_SIZE = 15;
export const STORIES_TTL_MS = 24 * 60 * 60 * 1000;

export const POINTS = {
  dailyLogin: 5,
  publishPost: 10,
  receiveReaction: 2,
  receiveComment: 3,
  acceptedAnswer: 25,
  completeProfile: 50,
  firstPost: 20,
  referral: 100,
  followerMilestone: 200,
} as const;

export const SNIPPET_LANGUAGES = [
  'typescript', 'javascript', 'react', 'nodejs', 'python', 'java', 'c', 'cpp', 'csharp', 'go',
  'rust', 'ruby', 'php', 'swift', 'kotlin', 'dart', 'flutter', 'sql', 'html', 'css', 'scss',
  'bash', 'powershell', 'dockerfile', 'yaml', 'json', 'xml', 'markdown', 'graphql', 'solidity',
  'assembly', 'matlab', 'r', 'perl', 'lua', 'haskell', 'elixir', 'clojure', 'scala', 'vue',
  'svelte', 'angular', 'nextjs', 'nestjs', 'django', 'flask', 'laravel', 'spring', 'unity', 'arduino',
] as const;

export const MARKETPLACE_CATEGORIES = [
  'Software Tools', 'Templates & UI Kits', 'Development Services', 'Courses & Ebooks',
  'Hardware', 'Domain & Hosting', 'Design Assets', 'Other',
] as const;

export const LICENSE_CATEGORIES = [
  'Web App', 'Mobile App', 'Desktop App', 'Library', 'Framework', 'API Service',
  'CLI Tool', 'Game', 'Extension', 'Plugin', 'Other',
] as const;

export const LICENSE_TYPES = ['MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3-Clause', 'MPL-2.0', 'AGPL-3.0', 'Proprietary'] as const;

export const GROUP_CATEGORIES = [
  'Web Development', 'Mobile Development', 'AI & Machine Learning', 'Data Science',
  'DevOps & Cloud', 'Cybersecurity', 'Game Development', 'Open Source',
  'Startups & Freelancing', 'Competitive Programming', 'Regional', 'Other',
] as const;

export const AD_MODELS = [
  { id: 'crm', label: 'CRM — Cost per 1,000 Impressions' },
  { id: 'cpc', label: 'CPC — Cost per Click' },
  { id: 'cpa', label: 'CPA — Cost per Action' },
  { id: 'cpv', label: 'CPV — Cost per View' },
  { id: 'sponsored', label: 'Sponsored Post' },
  { id: 'banner', label: 'Banner Ad' },
  { id: 'native', label: 'Native Ad' },
  { id: 'interstitial', label: 'Interstitial Ad' },
  { id: 'pop_under', label: 'Pop-under Ad' },
  { id: 'video', label: 'Video Ad (pre-roll)' },
  { id: 'newsletter', label: 'Newsletter Ad' },
] as const;

export const TRENDING_WINDOWS = [
  { id: '1h', label: '1 hour', ms: 60 * 60 * 1000 },
  { id: '6h', label: '6 hours', ms: 6 * 60 * 60 * 1000 },
  { id: '24h', label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { id: '7d', label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
] as const;

export const STORAGE_KEYS = {
  theme: 'bsdc-theme',
  language: 'bsdc-language',
  sound: 'bsdc-sound',
  activeFeed: 'bsdc-active-feed',
  recentSearches: 'bsdc-recent-searches',
  shortcutsHintSeen: 'bsdc-shortcuts-seen',
  onboardingDone: 'bsdc-onboarding-done',
};
