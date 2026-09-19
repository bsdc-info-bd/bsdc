/**
 * BSDC — src/features/saved/index.ts
 * Purpose : Public surface of the saved-items feature.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Narrow public API (ADR-004): the store, the subscription and the mirror writes stay
 *   private, so the only way a screen touches bookmarks is the hook, the button and the list.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
export { SaveButton, type SaveButtonProps } from './SaveButton';
export { SavedList, type SavedListProps } from './SavedList';
export { useSavedItems, type UseSavedItemsResult } from './useSavedItems';
