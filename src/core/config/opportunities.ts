/**
 * BSDC — src/core/config/opportunities.ts
 * Purpose : Shared vocabularies for events, jobs, projects and the freelancer hub.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every select, filter chip, Zod schema, Firestore rule doc-block and JSON-LD builder
 *   reads these lists, so a job type can never exist in the form but not in the filter, and a
 *   `salaryPeriod` can never be rendered in English while the rest of the screen is Bangla.
 *   Each entry carries both languages in-line: there is no second table to keep in step.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** A bilingual label used wherever one value is shown in two languages. */
export interface BilingualLabel {
  readonly bn: string;
  readonly en: string;
}

/** How an event happens. */
export const EVENT_MODES = ['onsite', 'online', 'hybrid'] as const;
export type EventMode = (typeof EVENT_MODES)[number];

export const EVENT_MODE_LABELS: Readonly<Record<EventMode, BilingualLabel>> = {
  onsite: { bn: 'মাঠে', en: 'On-site' },
  online: { bn: 'অনলাইনে', en: 'Online' },
  hybrid: { bn: 'মাঠে ও অনলাইনে', en: 'Hybrid' },
};

/** Lifecycle of an event. `cancelled` and `completed` are terminal. */
export const EVENT_STATUSES = ['draft', 'published', 'cancelled', 'completed'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_STATUS_LABELS: Readonly<Record<EventStatus, BilingualLabel>> = {
  draft: { bn: 'খসড়া', en: 'Draft' },
  published: { bn: 'প্রকাশিত', en: 'Published' },
  cancelled: { bn: 'বাতিল', en: 'Cancelled' },
  completed: { bn: 'শেষ', en: 'Completed' },
};

/** A person's answer to an invitation. */
export const RSVP_STATUSES = ['going', 'interested', 'declined'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export const RSVP_STATUS_LABELS: Readonly<Record<RsvpStatus, BilingualLabel>> = {
  going: { bn: 'যাচ্ছি', en: 'Going' },
  interested: { bn: 'আগ্রহী', en: 'Interested' },
  declined: { bn: 'যাব না', en: "Can't go" },
};

/** Employment type of a job. */
export const EMPLOYMENT_TYPES = [
  'full-time',
  'part-time',
  'contract',
  'internship',
  'freelance',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABELS: Readonly<Record<EmploymentType, BilingualLabel>> = {
  'full-time': { bn: 'পূর্ণকালীন', en: 'Full-time' },
  'part-time': { bn: 'খণ্ডকালীন', en: 'Part-time' },
  contract: { bn: 'চুক্তিভিত্তিক', en: 'Contract' },
  internship: { bn: 'ইন্টার্নশিপ', en: 'Internship' },
  freelance: { bn: 'ফ্রিল্যান্স', en: 'Freelance' },
};

/** Where the work happens. */
export const WORKPLACE_TYPES = ['onsite', 'remote', 'hybrid'] as const;
export type WorkplaceType = (typeof WORKPLACE_TYPES)[number];

export const WORKPLACE_TYPE_LABELS: Readonly<Record<WorkplaceType, BilingualLabel>> = {
  onsite: { bn: 'অফিসে', en: 'On-site' },
  remote: { bn: 'রিমোট', en: 'Remote' },
  hybrid: { bn: 'হাইব্রিড', en: 'Hybrid' },
};

/** Experience band a job asks for. */
export const EXPERIENCE_LEVELS = ['intern', 'junior', 'mid', 'senior', 'lead'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const EXPERIENCE_LEVEL_LABELS: Readonly<Record<ExperienceLevel, BilingualLabel>> = {
  intern: { bn: 'ইন্টার্ন', en: 'Intern' },
  junior: { bn: 'জুনিয়র', en: 'Junior' },
  mid: { bn: 'মিড-লেভেল', en: 'Mid-level' },
  senior: { bn: 'সিনিয়র', en: 'Senior' },
  lead: { bn: 'লিড', en: 'Lead' },
};

/** Period a salary figure covers. */
export const SALARY_PERIODS = ['hourly', 'daily', 'weekly', 'monthly', 'yearly'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export const SALARY_PERIOD_LABELS: Readonly<Record<SalaryPeriod, BilingualLabel>> = {
  hourly: { bn: 'ঘণ্টা', en: 'per hour' },
  daily: { bn: 'দিন', en: 'per day' },
  weekly: { bn: 'সপ্তাহ', en: 'per week' },
  monthly: { bn: 'মাস', en: 'per month' },
  yearly: { bn: 'বছর', en: 'per year' },
};

/** Lifecycle of a job posting. */
export const JOB_STATUSES = ['draft', 'open', 'closed', 'filled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABELS: Readonly<Record<JobStatus, BilingualLabel>> = {
  draft: { bn: 'খসড়া', en: 'Draft' },
  open: { bn: 'খোলা', en: 'Open' },
  closed: { bn: 'বন্ধ', en: 'Closed' },
  filled: { bn: 'পূরণ হয়েছে', en: 'Filled' },
};

/** Lifecycle of one application. */
export const APPLICATION_STATUSES = [
  'submitted',
  'reviewing',
  'shortlisted',
  'interview',
  'offered',
  'hired',
  'rejected',
  'withdrawn',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Readonly<Record<ApplicationStatus, BilingualLabel>> = {
  submitted: { bn: 'জমা হয়েছে', en: 'Submitted' },
  reviewing: { bn: 'দেখা হচ্ছে', en: 'In review' },
  shortlisted: { bn: 'শর্টলিস্টেড', en: 'Shortlisted' },
  interview: { bn: 'ইন্টারভিউ', en: 'Interview' },
  offered: { bn: 'অফার পেয়েছেন', en: 'Offered' },
  hired: { bn: 'নিয়োগ পেয়েছেন', en: 'Hired' },
  rejected: { bn: 'গ্রহণযোগ্য নয়', en: 'Not selected' },
  withdrawn: { bn: 'প্রত্যাহার', en: 'Withdrawn' },
};

/** Statuses in which a candidate may still withdraw. */
export const WITHDRAWABLE_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'submitted',
  'reviewing',
  'shortlisted',
];

/** Lifecycle of a community project. */
export const PROJECT_STATUSES = ['planning', 'active', 'paused', 'shipped', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Readonly<Record<ProjectStatus, BilingualLabel>> = {
  planning: { bn: 'পরিকল্পনায়', en: 'Planning' },
  active: { bn: 'চলমান', en: 'Active' },
  paused: { bn: 'থামানো', en: 'Paused' },
  shipped: { bn: 'প্রকাশিত', en: 'Shipped' },
  archived: { bn: 'আর্কাইভ', en: 'Archived' },
};

/** Categories offered in the freelancer hub. */
export const GIG_CATEGORIES = [
  'web',
  'mobile',
  'design',
  'data',
  'devops',
  'writing',
  'qa',
  'consulting',
] as const;
export type GigCategory = (typeof GIG_CATEGORIES)[number];

export const GIG_CATEGORY_LABELS: Readonly<Record<GigCategory, BilingualLabel>> = {
  web: { bn: 'ওয়েব ডেভেলপমেন্ট', en: 'Web development' },
  mobile: { bn: 'মোবাইল অ্যাপ', en: 'Mobile apps' },
  design: { bn: 'ডিজাইন', en: 'Design' },
  data: { bn: 'ডেটা ও এআই', en: 'Data and AI' },
  devops: { bn: 'ডেভঅপস', en: 'DevOps' },
  writing: { bn: 'লেখালেখি', en: 'Writing' },
  qa: { bn: 'কোয়ালিটি অ্যাসিওরেন্স', en: 'Quality assurance' },
  consulting: { bn: 'পরামর্শ', en: 'Consulting' },
};

/** Lifecycle of a gig listing. */
export const GIG_STATUSES = ['draft', 'active', 'paused'] as const;
export type GigStatus = (typeof GIG_STATUSES)[number];

export const GIG_STATUS_LABELS: Readonly<Record<GigStatus, BilingualLabel>> = {
  draft: { bn: 'খসড়া', en: 'Draft' },
  active: { bn: 'সক্রিয়', en: 'Active' },
  paused: { bn: 'থামানো', en: 'Paused' },
};

/** Lifecycle of a freelancer order. */
export const ORDER_STATUSES = [
  'pending',
  'accepted',
  'in-progress',
  'delivered',
  'completed',
  'cancelled',
  'disputed',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, BilingualLabel>> = {
  pending: { bn: 'অপেক্ষমান', en: 'Pending' },
  accepted: { bn: 'গৃহীত', en: 'Accepted' },
  'in-progress': { bn: 'কাজ চলছে', en: 'In progress' },
  delivered: { bn: 'ডেলিভারি হয়েছে', en: 'Delivered' },
  completed: { bn: 'সম্পন্ন', en: 'Completed' },
  cancelled: { bn: 'বাতিল', en: 'Cancelled' },
  disputed: { bn: 'বিবাদে', en: 'Disputed' },
};

/** Currencies the platform prices in. BDT is the default for a Bangladeshi community. */
export const CURRENCIES = ['BDT', 'USD', 'EUR', 'GBP', 'INR'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_SYMBOLS: Readonly<Record<Currency, string>> = {
  BDT: '৳',
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
};

/** The eight divisions of Bangladesh, plus the two options that cover everyone else. */
export const BANGLADESH_DIVISIONS = [
  'dhaka',
  'chattogram',
  'rajshahi',
  'khulna',
  'barishal',
  'sylhet',
  'rangpur',
  'mymensingh',
  'remote',
  'outside-bangladesh',
] as const;
export type Division = (typeof BANGLADESH_DIVISIONS)[number];

export const DIVISION_LABELS: Readonly<Record<Division, BilingualLabel>> = {
  dhaka: { bn: 'ঢাকা', en: 'Dhaka' },
  chattogram: { bn: 'চট্টগ্রাম', en: 'Chattogram' },
  rajshahi: { bn: 'রাজশাহী', en: 'Rajshahi' },
  khulna: { bn: 'খুলনা', en: 'Khulna' },
  barishal: { bn: 'বরিশাল', en: 'Barishal' },
  sylhet: { bn: 'সিলেট', en: 'Sylhet' },
  rangpur: { bn: 'রংপুর', en: 'Rangpur' },
  mymensingh: { bn: 'ময়মনসিংহ', en: 'Mymensingh' },
  remote: { bn: 'রিমোট', en: 'Remote' },
  'outside-bangladesh': { bn: 'বাংলাদেশের বাইরে', en: 'Outside Bangladesh' },
};
