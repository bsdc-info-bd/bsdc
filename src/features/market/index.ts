/**
 * BSDC — src/features/market/index.ts
 * Purpose : Public surface of the marketplace feature.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The marketplace reads gigs through src/entities/gig and reuses the freelancer hub's card
 *   and order dialog rather than growing a second copy of them: one card, one order flow, one set
 *   of words for money.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
export { MarketGrid, PRICE_CEILINGS, type MarketGridProps } from './MarketGrid';
export { GigDetailSheet, type GigDetailSheetProps } from './GigDetailSheet';
export { MARKET_SORTS, useMarket, type MarketSort, type UseMarketResult } from './useMarket';
