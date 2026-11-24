/**
 * The corporate kit: everything the corporate consoles share. It is
 * compiled from source by each app through a path alias rather than
 * published as a package, so a change here is type-checked by every console
 * that depends on it in the same commit.
 */
export * from './data/env';
export * from './data/client';
export * from './data/rpc';
export * from './data/session';
export * from './data/realtime';
export * from './data/resilience';
export * from './data/chunk-recovery';
export * from './data/outbox';
export * from './data/mutations';
export * from './domain/config';
export * from './domain/pages';
export * from './domain/staff';
export * from './domain/ip';
export * from './domain/status';
export * from './domain/chat';
export * from './domain/trust';
export * from './domain/seo';
export * from './domain/brand';
export * from './domain/perf';
export * from './domain/moderation';
export * from './domain/portals';
export * from './domain/telemetry';
export * from './domain/freshness';
export * from './domain/reason';
export * from './pdf/qr';
export * from './pdf/report-integrity';
export * from './ui/icons';
export * from './ui/primitives';
export * from './ui/AppShell';
export * from './ui/PublicShell';
export * from './ui/PortalRail';
export type { CommandPaletteAction } from './ui/CommandPalette';
export * from './ui/useAsync';
export * from './ui/toast';
export * from './ui/ConfirmDialog';
export * from './ui/DataTable';
export * from './ui/FreshnessBadge';
export * from './ui/useStaleBuildRecovery';
export * from './ui/RecoveryBoundary';
export { mountConsole } from './mount';
