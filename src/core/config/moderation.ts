/**
 * BSDC — src/core/config/moderation.ts
 * Purpose : The moderation vocabulary: report categories, severities, queue states, SLAs.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   :
 *   Moderation is a state machine, not a delete button. A report moves open -> triaged ->
 *   actioned|dismissed, may be escalated, and every terminal decision is appealable once. The
 *   legal transitions live in src/entities/moderation/state.ts and are enforced in Cloud
 *   Functions; this file holds only the vocabulary, the severity ranking and the response targets
 *   the community is entitled to expect.
 *   Nothing here is automated punishment. Auto-flagging surfaces candidates; a person decides.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** What a person may be reported for. */
export const REPORT_CATEGORIES = [
  'spam',
  'harassment',
  'hate',
  'sexual',
  'violence',
  'misinformation',
  'ip',
  'self-harm',
  'scam',
  'other',
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export interface CategoryDefinition {
  readonly id: ReportCategory;
  readonly labelBn: string;
  readonly labelEn: string;
  readonly hintBn: string;
  readonly hintEn: string;
  /** 1 = low, 4 = immediate. Drives queue ordering and the response target. */
  readonly severity: 1 | 2 | 3 | 4;
  /** Categories that require a human reviewer inside the shortest window. */
  readonly urgent: boolean;
}

/** The category catalogue, ordered most to least severe in presentation. */
/**
 * The definition used when a category id is not in the catalogue. It is declared on its own so the
 * lookup below can return a known value without asserting that the array is non-empty.
 */
export const OTHER_CATEGORY: CategoryDefinition = {
  id: 'other',
  labelBn: 'অন্য কারণ',
  labelEn: 'Something else',
  hintBn: 'উপরের কোনোটিতে না পড়লে বিস্তারিত লিখুন।',
  hintEn: 'Describe the problem when nothing above fits.',
  severity: 1,
  urgent: false,
};

export const REPORT_CATEGORY_DEFINITIONS: readonly CategoryDefinition[] = [
  {
    id: 'self-harm',
    labelBn: 'আত্ম-ক্ষতির ঝুঁকি',
    labelEn: 'Self-harm or suicide',
    hintBn: 'কারো জীবন ঝুঁকিতে থাকলে এখানে জানান। আমরা দ্রুত মানুষ পাঠাই।',
    hintEn: 'Use this when someone may be in danger. We reach a human reviewer first.',
    severity: 4,
    urgent: true,
  },
  {
    id: 'violence',
    labelBn: 'হিংসা বা হুমকি',
    labelEn: 'Violence or threats',
    hintBn: 'হিংসার প্রচার, হুমকি বা সংগঠিত ক্ষতির আয়োজন।',
    hintEn: 'Glorifying violence, threatening someone, or organising harm.',
    severity: 4,
    urgent: true,
  },
  {
    id: 'hate',
    labelBn: 'বিদ্বেষমূলক কনটেন্ট',
    labelEn: 'Hate speech',
    hintBn: 'ধর্ম, জাতি, লিঙ্গ বা পরিচয়কে লক্ষ্য করে বিদ্বেষ।',
    hintEn: 'Attacking a group by religion, ethnicity, gender or identity.',
    severity: 3,
    urgent: false,
  },
  {
    id: 'harassment',
    labelBn: 'হয়রানি',
    labelEn: 'Harassment or bullying',
    hintBn: 'ব্যক্তিগতভাবে কাউকে টার্গেট করে হয়রানি।',
    hintEn: 'Targeted abuse or bullying of a specific person.',
    severity: 3,
    urgent: false,
  },
  {
    id: 'sexual',
    labelBn: 'অশালীন কনটেন্ট',
    labelEn: 'Sexual content',
    hintBn: 'প্রাপ্তবয়স্ক বা অনভিপ্রেত যৌন কনটেন্ট।',
    hintEn: 'Adult or unwanted sexual content.',
    severity: 3,
    urgent: false,
  },
  {
    id: 'scam',
    labelBn: 'প্রতারণা',
    labelEn: 'Scam or fraud',
    hintBn: 'প্রতারণামূলক চাকরি, বিনিয়োগ বা পেমেন্টের দাবি।',
    hintEn: 'Fraudulent jobs, investments or payment requests.',
    severity: 3,
    urgent: false,
  },
  {
    id: 'misinformation',
    labelBn: 'ভুল তথ্য',
    labelEn: 'Misinformation',
    hintBn: 'প্রমাণযোগ্যভাবে মিথ্যা এবং ক্ষতিকর তথ্য।',
    hintEn: 'Demonstrably false information that can cause harm.',
    severity: 2,
    urgent: false,
  },
  {
    id: 'ip',
    labelBn: 'কপিরাইট',
    labelEn: 'Copyright or trademark',
    hintBn: 'আপনার কাজ বা ট্রেডমার্ক অননুমোদিতভাবে ব্যবহার।',
    hintEn: 'Your work or trademark used without permission.',
    severity: 2,
    urgent: false,
  },
  {
    id: 'spam',
    labelBn: 'স্প্যাম',
    labelEn: 'Spam',
    hintBn: 'পুনরাবৃত্ত, বিজ্ঞাপনমূলক বা অপ্রাসঙ্গিক কনটেন্ট।',
    hintEn: 'Repetitive, promotional or off-topic content.',
    severity: 1,
    urgent: false,
  },
  OTHER_CATEGORY,
];

const CATEGORY_INDEX: ReadonlyMap<ReportCategory, CategoryDefinition> = new Map(
  REPORT_CATEGORY_DEFINITIONS.map((definition) => [definition.id, definition]),
);

/**
 * Looks up a report category.
 * @param category category id
 * @returns the definition, or the `other` definition when the id is unknown
 */
export function categoryDefinition(category: ReportCategory): CategoryDefinition {
  const found = CATEGORY_INDEX.get(category);
  if (found !== undefined) return found;
  for (const definition of REPORT_CATEGORY_DEFINITIONS) {
    if (definition.id === 'other') return definition;
  }
  return OTHER_CATEGORY;
}

/** States a report moves through. Terminal states are listed in REPORT_TERMINAL_STATES. */
export const REPORT_STATES = ['open', 'triaged', 'actioned', 'dismissed', 'escalated'] as const;
export type ReportState = (typeof REPORT_STATES)[number];

/** States after which the report can no longer move except by appeal. */
export const REPORT_TERMINAL_STATES: readonly ReportState[] = ['actioned', 'dismissed'];

/** Actions a reviewer may take on a report. */
export const MODERATION_ACTIONS = [
  'dismiss',
  'remove',
  'hide',
  'warn',
  'restrict',
  'suspend',
  'escalate',
] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export interface ActionDefinition {
  readonly id: ModerationAction;
  readonly labelBn: string;
  readonly labelEn: string;
  /** Minimum role permitted to take this action. Enforced in Cloud Functions too. */
  readonly minimumRole: 'support' | 'moderator' | 'admin';
  /** The action writes an audit entry and notifies the author. */
  readonly notifiesAuthor: boolean;
  /** Points revoked from the author when the action lands. */
  readonly pointPenalty: number;
}

/**
 * The action used when an action id is not in the catalogue, declared on its own so the lookup can
 * return a known value without asserting that the array is non-empty.
 */
export const DISMISS_ACTION: ActionDefinition = {
  id: 'dismiss',
  labelBn: 'খারিজ',
  labelEn: 'Dismiss',
  minimumRole: 'support',
  notifiesAuthor: false,
  pointPenalty: 0,
};

/** The action catalogue available to reviewers. */

export const MODERATION_ACTION_DEFINITIONS: readonly ActionDefinition[] = [
  {
    id: 'dismiss',
    labelBn: 'খারিজ',
    labelEn: 'Dismiss',
    minimumRole: 'support',
    notifiesAuthor: false,
    pointPenalty: 0,
  },
  {
    id: 'remove',
    labelBn: 'সরিয়ে দিন',
    labelEn: 'Remove content',
    minimumRole: 'support',
    notifiesAuthor: true,
    pointPenalty: 5,
  },
  {
    id: 'hide',
    labelBn: 'লুকান',
    labelEn: 'Hide from feeds',
    minimumRole: 'support',
    notifiesAuthor: true,
    pointPenalty: 2,
  },
  {
    id: 'warn',
    labelBn: 'সতর্ক করুন',
    labelEn: 'Send a warning',
    minimumRole: 'support',
    notifiesAuthor: true,
    pointPenalty: 0,
  },
  {
    id: 'restrict',
    labelBn: 'সীমিত করুন',
    labelEn: 'Restrict posting',
    minimumRole: 'moderator',
    notifiesAuthor: true,
    pointPenalty: 10,
  },
  {
    id: 'suspend',
    labelBn: 'সাময়িক বন্ধ',
    labelEn: 'Suspend account',
    minimumRole: 'moderator',
    notifiesAuthor: true,
    pointPenalty: 25,
  },
  {
    id: 'escalate',
    labelBn: 'উন্নীত করুন',
    labelEn: 'Escalate to admin',
    minimumRole: 'support',
    notifiesAuthor: false,
    pointPenalty: 0,
  },
];

const ACTION_INDEX: ReadonlyMap<ModerationAction, ActionDefinition> = new Map(
  MODERATION_ACTION_DEFINITIONS.map((definition) => [definition.id, definition]),
);

/**
 * Looks up a moderation action.
 * @param action action id
 * @returns the definition, or the `dismiss` definition when the id is unknown
 */
export function actionDefinition(action: ModerationAction): ActionDefinition {
  const found = ACTION_INDEX.get(action);
  if (found !== undefined) return found;
  for (const definition of MODERATION_ACTION_DEFINITIONS) {
    if (definition.id === 'dismiss') return definition;
  }
  return DISMISS_ACTION;
}

/** Response targets the community is entitled to expect, in hours. */
export const MODERATION_SLA_HOURS: Readonly<Record<number, number>> = {
  4: 1,
  3: 12,
  2: 48,
  1: 120,
};

/** How long a person has to appeal a decision, in days. */
export const APPEAL_WINDOW_DAYS = 14;

/** One appeal per decision. A second appeal of the same report is refused with a reason. */
export const MAX_APPEALS_PER_REPORT = 1;

/** Report reasons shorter than this are refused: "bad" is not a report. */
export const MIN_REASON_CHARS = 12;
