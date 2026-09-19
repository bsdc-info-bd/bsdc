/**
 * BSDC — src/features/admin/index.ts
 * Purpose : Public surface of the administration feature.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The admin console is assembled from four independent panels, the shared entitlement
 *   scope and the passkey gate. They are exported separately rather than as one screen so each can
 *   be lazy-loaded behind the route that needs it, keeping the shell inside its bundle budget.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
export { AdminScope, type AdminScopeProps } from './AdminScope';
export { AuditTrail, type AuditTrailProps } from './AuditTrail';
export { FlagMatrix, type FlagMatrixProps } from './FlagMatrix';
export { PasskeyDialog, type PasskeyDialogProps } from './PasskeyDialog';
export { RecoveryBin, type RecoveryBinProps } from './RecoveryBin';
export { RoleAssignment, type RoleAssignmentProps } from './RoleAssignment';
