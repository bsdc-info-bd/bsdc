/**
 * BSDC — src/features/settings/index.ts
 * Purpose : Public surface of the account settings feature.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Four sections, each owning exactly one thing a person can change about their account or
 *   the device in front of them: how the platform looks, what it may tell them, who may see them,
 *   and what is stored here. Nothing in this folder decides privilege — the rules do.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
export { AppearanceSection } from './AppearanceSection';
export { NotificationSection, type NotificationSectionProps } from './NotificationSection';
export { PrivacySection, type PrivacySectionProps } from './PrivacySection';
export { DataSection, type DataSectionProps } from './DataSection';
export { AccountSection, type AccountSectionProps } from './AccountSection';
