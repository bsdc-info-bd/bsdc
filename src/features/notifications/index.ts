/**
 * BSDC — src/features/notifications/index.ts
 * Purpose : Public surface of the notifications feature.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : BroadcastComposer is exported but must stay behind the admin route: it is an admin
 *   tool, and admin tools do not belong in the shell bundle.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
export { NotificationList, type NotificationListProps } from './NotificationList';
export { useUnreadNotificationCount } from './useUnreadCount';
export { PushOptIn, type PushOptInProps } from './PushOptIn';
export { BroadcastComposer, type BroadcastComposerProps } from './BroadcastComposer';
