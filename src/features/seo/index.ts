/**
 * BSDC — src/features/seo/index.ts
 * Purpose : Public surface of the search-and-sharing feature.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : One component owns the document head. It is mounted once by the shell rather than by
 *   every page, because a head that eleven screens each write to is a head nobody can reason about.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
export { PageHead } from './PageHead';
