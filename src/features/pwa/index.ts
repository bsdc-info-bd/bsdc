/**
 * BSDC — src/features/pwa/index.ts
 * Purpose : Public surface of the progressive-web-app feature.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Two components, both behind their own flag, both additive: the shell works exactly the
 *   same without them, which is what makes them safe to switch off from the administration panel.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
export { InstallPrompt, type InstallPromptProps } from './InstallPrompt';
export { OfflineBanner, type OfflineBannerProps } from './OfflineBanner';
export { useInstallPrompt, type UseInstallPromptResult } from './useInstallPrompt';
export { OfflineBoundary, type OfflineBoundaryProps } from './OfflineBoundary';
