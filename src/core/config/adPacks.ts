/**
 * BSDC — src/core/config/adPacks.ts
 * Purpose : Ads Engine amount tiers, placements and formats (PART 21.1, PART 21.3).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Money flows through the append-only amount-score ledger; these constants describe
 *           the purchasable credit tiers and the inventory that can be bought with them.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Purchasable credit tiers in BDT (admin-editable in the token console). */
export const AD_AMOUNT_TIERS: readonly number[] = [
  500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000,
];

/** Currency. BDT only at launch (PART 21.8 documents the multi-currency decision). */
export const AD_CURRENCY = 'BDT' as const;

/** Format of an issued ads access key (PART 21.1 step 5). */
export const AD_ACCESS_KEY_PATTERN = /^BSDC-ADS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** Invoice numbering rule: BSDC-ADS-YYYY-NNNNN. */
export const AD_INVOICE_PREFIX = 'BSDC-ADS';

/** The twelve supported ad formats (PART 21.3). */
export const AD_FORMATS = [
  'feed-native-card',
  'feed-image-card',
  'sidebar-rectangle-300x250',
  'sidebar-skyscraper-160x600',
  'sidebar-halfpage-300x600',
  'leaderboard-728x90',
  'leaderboard-970x90',
  'in-feed-inline-banner',
  'story-slot-card',
  'chat-list-top-card',
  'search-promoted-item',
  'promoted-listing',
] as const;
export type AdFormat = (typeof AD_FORMATS)[number];

/** The fourteen placements (PART 21.3). */
export const AD_PLACEMENTS = [
  'home-feed',
  'following-feed',
  'local-feed',
  'post-detail-inline',
  'profile-sidebar',
  'groups-sidebar',
  'group-feed',
  'events-listing',
  'jobs-listing',
  'marketplace-listing',
  'messages-list',
  'search-results',
  'notifications-page',
  'footer-band',
] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];

/** Delivery guardrails that keep the feed honest (PART 21.3 RULES). */
export const AD_DELIVERY_RULES = {
  maxAdsPerOrganic: 5,
  firstAdMinimumPosition: 1,
  neverAdjacent: true,
  frequencyCapPerUserPerDay: 2,
  viewableMs: 1_000,
  viewableRatio: 0.5,
  invalidClickMs: 500,
} as const;

/** Sensitive categories that may never be targeted (PART 21.4 fairness rules). */
export const AD_FORBIDDEN_TARGETING = [
  'health',
  'religion',
  'politics',
  'ethnicity',
  'sexual-orientation',
  'financial-hardship',
] as const;
