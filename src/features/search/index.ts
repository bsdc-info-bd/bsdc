/**
 * BSDC — src/features/search/index.ts
 * Purpose : Public surface of the search feature.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : SearchDialog is not re-exported here: it is reached through the shell, which owns the
 *   global shortcut, so the palette cannot be opened twice by two hosts.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
export { useSearch, type SearchState } from './useSearch';
export { SearchResults, type SearchResultsProps } from './SearchResults';
export { CommandPalette, type CommandPaletteProps } from './CommandPalette';
export { useCommandPalette, type CommandPaletteState } from './useCommandPalette';
export { clearRecentSearches, readRecentSearches, rememberSearch } from './recentSearches';
