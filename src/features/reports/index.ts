/**
 * BSDC — src/features/reports/index.ts
 * Purpose : Public surface of the reports feature.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Two panels: one issues a report, one checks one. They are exported separately so the
 *   public verification route never loads jsPDF — the whole point of the dynamic import inside the
 *   composer is that the verifier's visitors do not pay for it.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
export { ReportComposer, type ReportComposerProps } from './ReportComposer';
export { VerificationCard, type VerificationCardProps } from './VerificationCard';
