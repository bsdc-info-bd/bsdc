/**
 * BSDC — src/features/auth/index.ts
 * Purpose : Public surface of the identity feature.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Everything else imports from here, never from a file inside the feature, so the
 *   internals can be rearranged without touching a single call site.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
export { SessionProvider, SessionContext } from './SessionProvider';
export type { SessionContextValue, SessionProviderProps } from './SessionProvider';
export {
  useSession,
  useSessionState,
  useRole,
  useCan,
  useCanAll,
  useProfile,
  useIsSignedIn,
  useIsDeviceSession,
} from './useSession';
export { RequireAuth, type RequireAuthProps } from './RequireAuth';
export { SignInCard, type SignInCardProps, type SignInReason } from './SignInCard';
export {
  SIGNED_OUT,
  SESSION_UNKNOWN,
  canPublish,
  isActiveSession,
  newDeviceIdentity,
  sessionFromAuth,
  sessionFromDevice,
  sessionRole,
  type DeviceIdentity,
  type Session,
  type SessionSource,
  type SessionStatus,
} from './session';
