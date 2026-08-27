/**
 * Build roadmap — single source of truth for phase names/statuses.
 * Used by the public roadmap section and the honest "not yet implemented"
 * screens. Structured data carries both languages directly (i18n JSON
 * covers free-text strings; this is typed content).
 */
export type PhaseStatus = 'shipped' | 'planned';

export interface PhaseInfo {
  id: number;
  status: PhaseStatus;
  name: { en: string; bn: string };
  summary: { en: string; bn: string };
}

export const PHASES: PhaseInfo[] = [
  {
    id: 0,
    status: 'shipped',
    name: { en: 'Foundation', bn: 'ভিত্তি' },
    summary: {
      en: 'Repo, tooling, design tokens, routing, i18n, Firebase wiring, CI.',
      bn: 'রিপো, টুলিং, ডিজাইন টোকেন, রাউটিং, আইটিএন, ফায়ারবেজ ওয়্যারিং, সিআই।',
    },
  },
  {
    id: 1,
    status: 'planned',
    name: { en: 'Identity', bn: 'পরিচয়' },
    summary: {
      en: 'Auth (Google/GitHub/Yahoo/email), profiles, /@username, roles.',
      bn: 'অথেনটিকেশন (গুগল/গিটহাব/ইয়াহু/ইমেইল), প্রোফাইল, /@username, রোল।',
    },
  },
  {
    id: 2,
    status: 'planned',
    name: { en: 'Content Engine', bn: 'কনটেন্ট ইঞ্জিন' },
    summary: {
      en: 'Composer, code snippets, media uploads, reactions, comments.',
      bn: 'কম্পোজার, কোড স্নিপেট, মিডিয়া আপলোড, রিঅ্যাকশন, কমেন্ট।',
    },
  },
  {
    id: 3,
    status: 'planned',
    name: { en: 'Social Graph & Feed', bn: 'সোশ্যাল গ্রাফ ও ফিড' },
    summary: {
      en: 'Follows, groups, pages, events, ranked feed, search.',
      bn: 'ফলো, গ্রুপ, পেজ, ইভেন্ট, র‍্যাংকড ফিড, সার্চ।',
    },
  },
  {
    id: 4,
    status: 'planned',
    name: { en: 'Real-Time Messaging', bn: 'রিয়েল-টাইম মেসেজিং' },
    summary: {
      en: '1:1/group chat, presence, typing, voice notes, push.',
      bn: '১:১/গ্রুপ চ্যাট, প্রেজেন্স, টাইপিং, ভয়েস নোট, পুশ।',
    },
  },
  {
    id: 5,
    status: 'planned',
    name: { en: 'Moderation & Admin', bn: 'মডারেশন ও অ্যাডমিন' },
    summary: {
      en: 'Moderator, Manager, Management and Admin panels with audit logs.',
      bn: 'মডারেটর, ম্যানেজার, ম্যানেজমেন্ট ও অ্যাডমিন প্যানেল — অডিট লগ সহ।',
    },
  },
  {
    id: 6,
    status: 'planned',
    name: { en: 'Creator, Jobs & Marketplace', bn: 'ক্রিয়েটর, চাকরি ও মার্কেটপ্লেস' },
    summary: {
      en: 'Job board, freelancing, creator program, licenses, ads.',
      bn: 'চাকরির বোর্ড, ফ্রিল্যান্সিং, ক্রিয়েটর প্রোগ্রাম, লাইসেন্স, অ্যাড।',
    },
  },
  {
    id: 7,
    status: 'planned',
    name: { en: 'SEO & Discoverability', bn: 'এসইও ও ডিসকভারেবিলিটি' },
    summary: {
      en: 'Meta strategy, sitemap/RSS via Cloud Functions, JSON-LD.',
      bn: 'মেটা স্ট্র্যাটেজি, ক্লাউড ফাংশনে সাইটম্যাপ/RSS, JSON-LD।',
    },
  },
  {
    id: 8,
    status: 'planned',
    name: { en: 'PWA, Offline & Android', bn: 'পিডব্লিউএ, অফলাইন ও অ্যান্ড্রয়েড' },
    summary: {
      en: 'PWA caching, offline feed cache, Capacitor Android build.',
      bn: 'পিডব্লিউএ ক্যাশিং, অফলাইন ফিড ক্যাশ, ক্যাপাসিটর অ্যান্ড্রয়েড বিল্ড।',
    },
  },
  {
    id: 9,
    status: 'planned',
    name: { en: 'Hardening & Launch', bn: 'হার্ডেনিং ও লঞ্চ' },
    summary: {
      en: 'Full rules audit, load tests, legal pages, launch countdown.',
      bn: 'সম্পূর্ণ রুলস অডিট, লোড টেস্ট, লিগ্যাল পেজ, লঞ্চ কাউন্টডাউন।',
    },
  },
];

export function localized<T>(value: { en: T; bn: T }, language: string | undefined): T {
  return language && language.startsWith('bn') ? value.bn : value.en;
}
