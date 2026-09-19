/**
 * BSDC — src/core/errors/taxonomy.ts
 * Purpose : The single error taxonomy for the whole platform (PART 24.2).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every user-visible failure carries a stable code (BSDC-XXX-NNN) so support, logs and
 *           the admin error dashboard all refer to the same thing. Codes are never reused.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Every error class the product can surface. */
export type ErrorDomain =
  | 'APP'
  | 'NET'
  | 'AUTH'
  | 'DATA'
  | 'MEDIA'
  | 'CHAT'
  | 'MKT'
  | 'ADS'
  | 'PDF'
  | 'SEO'
  | 'PWA'
  | 'SEARCH'
  | 'EVENT'
  | 'JOB'
  | 'GIG'
  | 'REP'
  | 'MOD'
  | 'PUSH';

/** Severity used for logging, alerting and SLA routing. */
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

/** A catalogued error definition. */
export interface ErrorDefinition {
  readonly code: string;
  readonly domain: ErrorDomain;
  readonly severity: ErrorSeverity;
  /** What happened, why, the exact next action (PART 09.02). */
  readonly en: string;
  readonly bn: string;
  /** Whether the UI should offer an automatic retry. */
  readonly retryable: boolean;
}

const define = (
  code: string,
  domain: ErrorDomain,
  severity: ErrorSeverity,
  en: string,
  bn: string,
  retryable: boolean,
): ErrorDefinition => ({ code, domain, severity, en, bn, retryable });

/** The catalogue. Extended as modules land; entries are never removed. */
export const ERROR_CATALOGUE: readonly ErrorDefinition[] = [
  define(
    'BSDC-APP-001',
    'APP',
    'critical',
    'Something went wrong while rendering this screen. Your data is safe.',
    'এই স্ক্রিন দেখানোর সময় একটি সমস্যা হয়েছে। আপনার তথ্য নিরাপদ আছে।',
    true,
  ),
  define(
    'BSDC-APP-002',
    'APP',
    'error',
    'A part of the app failed to load. Reload to fetch the latest version.',
    'অ্যাপের একটি অংশ লোড হয়নি। সর্বশেষ সংস্করণ আনতে রিলোড করুন।',
    true,
  ),
  define(
    'BSDC-APP-003',
    'APP',
    'info',
    'A newer version of BSDC is available. Update when you are ready.',
    'BSDC-এর একটি নতুন সংস্করণ পাওয়া যাচ্ছে। প্রস্তুত হলে আপডেট করুন।',
    false,
  ),
  define(
    'BSDC-NET-001',
    'NET',
    'warning',
    'You are offline. Anything you do now will be sent when the connection returns.',
    'আপনি অফলাইনে আছেন। এখন যা করবেন তা সংযোগ ফিরলে পাঠানো হবে।',
    true,
  ),
  define(
    'BSDC-NET-002',
    'NET',
    'warning',
    'The request took too long. Check your connection and try again.',
    'অনুরোধটি সময় নিয়েছে অনেক। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।',
    true,
  ),
  define(
    'BSDC-NET-003',
    'NET',
    'warning',
    'Too many attempts. Wait a moment, then try again.',
    'অনেকবার চেষ্টা করা হয়েছে। একটু অপেক্ষা করে আবার চেষ্টা করুন।',
    true,
  ),
  define(
    'BSDC-NET-004',
    'NET',
    'error',
    'A service is temporarily unavailable. Our team has been notified.',
    'একটি সেবা সাময়িকভাবে বন্ধ আছে। আমাদের দলকে জানানো হয়েছে।',
    true,
  ),
  define(
    'BSDC-AUTH-000',
    'AUTH',
    'warning',
    'We could not sign you in with that method. Try another sign-in option.',
    'এই পদ্ধতিতে সাইন ইন করা যায়নি। অন্য একটি পদ্ধতি চেষ্টা করুন।',
    false,
  ),
  define(
    'BSDC-DATA-001',
    'DATA',
    'error',
    'You do not have permission to do that. If this looks wrong, contact support.',
    'এটি করার অনুমতি আপনার নেই। ভুল মনে হলে সাপোর্টে যোগাযোগ করুন।',
    false,
  ),
  define(
    'BSDC-DATA-002',
    'DATA',
    'error',
    'A database query needs an index that is not deployed yet.',
    'একটি প্রশ্নের জন্য প্রয়োজনীয় ইনডেক্স এখনো চালু হয়নি।',
    false,
  ),
  define(
    'BSDC-DATA-003',
    'DATA',
    'warning',
    'The platform is at its usage limit for the moment. Some features are paused.',
    'প্ল্যাটফর্ম এই মুহূর্তে ব্যবহারের সীমায় আছে। কিছু ফিচার বিরতিতে আছে।',
    true,
  ),
  define(
    'BSDC-DATA-004',
    'DATA',
    'warning',
    'This content is too large to save. Shorten it or move part of it to a new post.',
    'এই কনটেন্ট সংরক্ষণ করার জন্য অনেক বড়। ছোট করুন বা ভাগ করে নতুন পোস্ট করুন।',
    false,
  ),
  define(
    'BSDC-DATA-005',
    'DATA',
    'warning',
    'Someone else edited this while you were writing. Review both versions and choose.',
    'আপনি লেখার সময় অন্য কেউ এটি সম্পাদনা করেছেন। দুটি সংস্করণ দেখে বেছে নিন।',
    false,
  ),
  define(
    'BSDC-MEDIA-001',
    'MEDIA',
    'error',
    'The upload failed. Check your connection and try again.',
    'আপলোড ব্যর্থ হয়েছে। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।',
    true,
  ),
  define(
    'BSDC-MEDIA-002',
    'MEDIA',
    'warning',
    'That file is not accepted here. Use a JPG, PNG, WebP, GIF or PDF under the size limit.',
    'এই ফাইল এখানে গ্রহণযোগ্য নয়। নির্ধারিত সাইজের মধ্যে JPG, PNG, WebP, GIF বা PDF ব্যবহার করুন।',
    false,
  ),
  define(
    'BSDC-MEDIA-004',
    'MEDIA',
    'info',
    'BSDC does not host video uploads. Paste a YouTube or Vimeo link instead and we will embed it.',
    'BSDC ভিডিও আপলোড গ্রহণ করে না। এর বদলে YouTube বা Vimeo লিংক দিন, আমরা এমবেড করব।',
    false,
  ),
  define(
    'BSDC-CHAT-001',
    'CHAT',
    'error',
    'The message could not be sent. It is saved as a draft and will retry automatically.',
    'বার্তাটি পাঠানো যায়নি। এটি খসড়ায় সংরক্ষিত আছে এবং স্বয়ংক্রিয়ভাবে আবার চেষ্টা করবে।',
    true,
  ),
  define(
    'BSDC-MKT-001',
    'MKT',
    'warning',
    'Your plan has expired. You can view orders but cannot accept new ones until you renew.',
    'আপনার প্ল্যানের মেয়াদ শেষ। নবায়ন না করা পর্যন্ত নতুন অর্ডার নেওয়া যাবে না।',
    false,
  ),
  define(
    'BSDC-ADS-001',
    'ADS',
    'error',
    'That passkey is not correct. After several attempts the action locks for your protection.',
    'পাসকি সঠিক নয়। কয়েকবার চেষ্টার পর নিরাপত্তার জন্য এই কাজটি লক হয়ে যাবে।',
    false,
  ),
  define(
    'BSDC-PDF-001',
    'PDF',
    'error',
    'The report could not be generated. Nothing was lost — try again or pick a smaller range.',
    'প্রতিবেদন তৈরি করা যায়নি। কিছু হারায়নি — আবার চেষ্টা করুন বা ছোট সময় বেছে নিন।',
    true,
  ),
  define(
    'BSDC-SEO-001',
    'SEO',
    'warning',
    'The sitemap could not be refreshed. The previous version stays online.',
    'সাইটম্যাপ আপডেট করা যায়নি। আগের সংস্করণ অনলাইনে থাকবে।',
    true,
  ),
  define(
    'BSDC-PWA-001',
    'PWA',
    'info',
    'An update is ready. Reload to switch to the new version.',
    'একটি আপডেট প্রস্তুত। নতুন সংস্করণে যেতে রিলোড করুন।',
    false,
  ),
  // ---- RESPONSE 2: backend, identity, realtime, media, comments, reactions ----
  define(
    'BSDC-AUTH-001',
    'AUTH',
    'warning',
    'You need to sign in to continue. Nothing you were doing has been lost.',
    'চালিয়ে যেতে সাইন ইন করতে হবে। আপনি যা করছিলেন তা হারায়নি।',
    false,
  ),
  define(
    'BSDC-AUTH-002',
    'AUTH',
    'warning',
    'This area needs a higher access level. Contact support if you believe this is wrong.',
    'এই অংশে উচ্চতর অ্যাক্সেস প্রয়োজন। ভুল মনে হলে সাপোর্টে জানান।',
    false,
  ),
  define(
    'BSDC-AUTH-003',
    'AUTH',
    'error',
    'Your session expired. Sign in again to continue where you left off.',
    'আপনার সেশন শেষ হয়ে গেছে। যেখানে ছিলেন সেখান থেকে চালিয়ে যেতে আবার সাইন ইন করুন।',
    true,
  ),
  define(
    'BSDC-AUTH-004',
    'AUTH',
    'warning',
    'Confirm your email address to post, comment and message. Check your inbox.',
    'পোস্ট, মন্তব্য ও বার্তা পাঠাতে ইমেইল ঠিকানা নিশ্চিত করুন। ইনবক্স দেখুন।',
    false,
  ),
  define(
    'BSDC-AUTH-005',
    'AUTH',
    'error',
    'This account is suspended. Read the appeal instructions sent to your email.',
    'এই অ্যাকাউন্টটি স্থগিত করা হয়েছে। আপনার ইমেইলে পাঠানো আপিলের নির্দেশনা পড়ুন।',
    false,
  ),
  define(
    'BSDC-AUTH-006',
    'AUTH',
    'warning',
    'That sign-in link has expired. Request a new one and try again.',
    'সেই সাইন-ইন লিংকের মেয়াদ শেষ। নতুন লিংক নিন এবং আবার চেষ্টা করুন।',
    true,
  ),
  define(
    'BSDC-AUTH-007',
    'AUTH',
    'warning',
    'That username is already taken. Choose another one.',
    'এই ব্যবহারকারী নামটি ইতিমধ্যে নেওয়া হয়েছে। অন্য একটি বেছে নিন।',
    false,
  ),
  define(
    'BSDC-AUTH-008',
    'AUTH',
    'warning',
    'A username must be 3 to 30 characters and may contain letters, numbers, dots and underscores.',
    'ব্যবহারকারী নাম ৩ থেকে ৩০ অক্ষরের হতে হবে এবং অক্ষর, সংখ্যা, ডট ও আন্ডারস্কোর থাকতে পারবে।',
    false,
  ),
  define(
    'BSDC-AUTH-009',
    'AUTH',
    'warning',
    'That passkey was not accepted. Five attempts are allowed every fifteen minutes.',
    'সেই পাসকি গ্রহণ করা হয়নি। পনেরো মিনিটে পাঁচবার চেষ্টা করা যাবে।',
    true,
  ),
  define(
    'BSDC-AUTH-010',
    'AUTH',
    'warning',
    'Too many passkey attempts. Wait for the cooldown window and try again.',
    'অনেকবার পাসকি চেষ্টা করা হয়েছে। কুলডাউন শেষ হলে আবার চেষ্টা করুন।',
    true,
  ),
  define(
    'BSDC-NET-005',
    'NET',
    'warning',
    'The live backend is unreachable. You are working on this device only; your work is queued and will sync.',
    'লাইভ ব্যাকএন্ডে পাওয়া যাচ্ছে না। আপনি শুধু এই ডিভাইসে কাজ করছেন; আপনার কাজ সারিতে রাখা হয়েছে এবং সিঙ্ক হবে।',
    true,
  ),
  define(
    'BSDC-DATA-006',
    'DATA',
    'warning',
    'That item is already in your saved list.',
    'এই আইটেমটি ইতিমধ্যে আপনার সংরক্ষিত তালিকায় আছে।',
    false,
  ),
  define(
    'BSDC-DATA-007',
    'DATA',
    'warning',
    'A post must contain text, an image or a link.',
    'একটি পোস্টে লেখা, ছবি বা লিংক থাকতে হবে।',
    false,
  ),
  define(
    'BSDC-DATA-008',
    'DATA',
    'warning',
    'This text is longer than the limit for this field. Shorten it and try again.',
    'এই লেখা এই ঘরের সীমার চেয়ে বড়। ছোট করুন এবং আবার চেষ্টা করুন।',
    false,
  ),
  define(
    'BSDC-DATA-009',
    'DATA',
    'info',
    'The item was moved to the recovery bin. You can restore it within thirty days.',
    'আইটেমটি রিকভারি বিনে সরানো হয়েছে। ত্রিশ দিনের মধ্যে ফিরিয়ে আনা যাবে।',
    false,
  ),
  define(
    'BSDC-DATA-010',
    'DATA',
    'info',
    'The item was restored from the recovery bin.',
    'আইটেমটি রিকভারি বিন থেকে ফিরিয়ে আনা হয়েছে।',
    false,
  ),
  define(
    'BSDC-MEDIA-003',
    'MEDIA',
    'warning',
    'Video uploads are not supported anywhere in BSDC. Share an image, a link or text instead.',
    'BSDC-এ কোথাও ভিডিও আপলোড সমর্থিত নয়। এর বদলে ছবি, লিংক বা লেখা শেয়ার করুন।',
    false,
  ),
  define(
    'BSDC-MEDIA-005',
    'MEDIA',
    'warning',
    'That file is larger than the limit for this surface.',
    'এই সারফেসের জন্য ফাইলটি সীমার চেয়ে বড়।',
    false,
  ),
  define(
    'BSDC-MEDIA-006',
    'MEDIA',
    'warning',
    'That image is larger than the allowed dimensions. Resize it and try again.',
    'ছবিটির মাপ অনুমোদিত সীমার চেয়ে বড়। মাপ ছোট করে আবার চেষ্টা করুন।',
    false,
  ),
  define(
    'BSDC-MEDIA-007',
    'MEDIA',
    'warning',
    'Only PNG, JPEG, WebP, GIF and PDF files can be uploaded here.',
    'এখানে শুধু PNG, JPEG, WebP, GIF ও PDF ফাইল আপলোড করা যাবে।',
    false,
  ),
  define(
    'BSDC-MEDIA-008',
    'MEDIA',
    'warning',
    'The upload did not finish. Check your connection and try again.',
    'আপলোড শেষ হয়নি। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।',
    true,
  ),
  define(
    'BSDC-CHAT-002',
    'CHAT',
    'warning',
    'The message could not be sent. It stays in your outbox until it goes through.',
    'বার্তাটি পাঠানো যায়নি। পাঠানো না হওয়া পর্যন্ত এটি আউটবক্সে থাকবে।',
    true,
  ),
  define(
    'BSDC-CHAT-003',
    'CHAT',
    'warning',
    'Voice notes are limited to twenty seconds.',
    'ভয়েস নোট সর্বোচ্চ কুড়ি সেকেন্ডের।',
    false,
  ),
  define(
    'BSDC-CHAT-004',
    'CHAT',
    'warning',
    'This conversation is read-only for you right now.',
    'এই কথোপকথনটি এই মুহূর্তে আপনার জন্য শুধু পড়ার।',
    false,
  ),
];

/** Lookup map by code. */
export const ERROR_MAP: ReadonlyMap<string, ErrorDefinition> = new Map(
  ERROR_CATALOGUE.map((entry) => [entry.code, entry]),
);

/**
 * Resolves a catalogue entry by code.
 * @param code BSDC error code
 * @returns the definition, or undefined when the code is unknown
 */
export function findError(code: string): ErrorDefinition | undefined {
  return ERROR_MAP.get(code);
}
