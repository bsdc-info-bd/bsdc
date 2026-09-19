/**
 * BSDC — src/features/auth/SessionProvider.tsx
 * Purpose : The one React context that owns identity, claims and the profile in view.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   :
 *   Firebase Authentication is subscribed lazily: the SDK is imported only when a person actually
 *   tries to sign in, so the shell pays nothing for auth until it is used.
 *   Claims are read from the ID token on every sign-in and refreshed on demand, because a role
 *   grant must take effect without a full reload. The on-screen role is a rendering hint; the
 *   server decides what the account may actually do (LAW-03).
 *   A device session is created explicitly and only through the sign-in surface, never silently.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppError } from '@/core/errors/AppError';
import { DEFAULT_LOCALE, type Locale } from '@/core/config/app';
import type { BsdcClaims } from '@/core/config/permissions';
import { firebaseAuth } from '@/services/firebase/app';
import { subscribeBackend } from '@/services/backend/gateway';
import { readJson, writeJson } from '@/shared/lib/storage';
import { emptyProfile, type Profile } from '@/entities/profile/model';
import { loadProfile, peekProfile, saveProfile } from '@/entities/profile/repository';
import {
  SESSION_UNKNOWN,
  SIGNED_OUT,
  canPublish,
  newDeviceIdentity,
  sessionFromAuth,
  sessionFromDevice,
  type DeviceIdentity,
  type Session,
} from './session';

/** Key under which a device identity is stored. */
const DEVICE_KEY = 'device-identity';

/** Actions and state exposed to the tree. */
export interface SessionContextValue {
  readonly session: Session;
  readonly profile: Profile | null;
  readonly locale: Locale;
  /** Sends a sign-in link. Returns the email it was sent to. */
  readonly sendSignInLink: (email: string) => Promise<void>;
  /** Completes an email-link sign-in. */
  readonly completeSignInLink: (email: string, link: string) => Promise<void>;
  /** Signs in with an email and password. */
  readonly signInWithPassword: (email: string, password: string) => Promise<void>;
  /** Creates an account with an email and password. */
  readonly createAccount: (email: string, password: string, displayName: string) => Promise<void>;
  /** Starts a device-local session. */
  readonly startDeviceSession: (displayName: string) => Promise<void>;
  /** Signs out and clears the local profile mirror entry. */
  readonly signOut: () => Promise<void>;
  /** Re-reads custom claims from the ID token. */
  readonly refreshClaims: () => Promise<BsdcClaims | null>;
  /** Updates the profile in view. */
  readonly updateProfile: (patch: Partial<Profile>) => Promise<void>;
  readonly canPublishNow: boolean;
  readonly lastError: AppError | null;
  readonly clearError: () => void;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

/** Props for the provider. */
export interface SessionProviderProps {
  readonly children: ReactNode;
  /** Locale used for the default profile record. */
  readonly locale?: Locale | undefined;
}

/**
 * Translates an SDK failure into a BSDC AppError with a stable code.
 * @param error thrown value
 * @param fallback code to use when the SDK gives nothing useful
 * @returns an AppError
 */
function authError(error: unknown, fallback = 'BSDC-AUTH-001'): AppError {
  if (error instanceof AppError) return error;
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code.includes('auth/invalid-email')) return new AppError('BSDC-AUTH-008', {}, error);
  if (code.includes('auth/email-already-in-use')) return new AppError('BSDC-AUTH-007', {}, error);
  if (code.includes('auth/weak-password')) return new AppError('BSDC-AUTH-004', {}, error);
  if (code.includes('auth/invalid-action-code')) return new AppError('BSDC-AUTH-006', {}, error);
  if (code.includes('auth/user-disabled')) return new AppError('BSDC-AUTH-005', {}, error);
  if (code.includes('auth/wrong-password') || code.includes('auth/user-not-found')) {
    return new AppError('BSDC-AUTH-001', {}, error);
  }
  if (code.includes('permission-denied') || code.includes('unavailable')) {
    return new AppError('BSDC-NET-005', {}, error);
  }
  return new AppError(fallback, {}, error);
}

/**
 * Owns identity, claims and the profile in view for the whole application.
 * @param props children and optional locale
 * @returns the provider
 */
export function SessionProvider({ children, locale }: SessionProviderProps): React.ReactElement {
  const [session, setSession] = useState<Session>(SESSION_UNKNOWN);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [lastError, setLastError] = useState<AppError | null>(null);
  const activeLocale = locale ?? DEFAULT_LOCALE;
  const subscribed = useRef<boolean>(false);

  /** Applies a session and loads the matching profile. */
  const adoptSession = useCallback(async (next: Session): Promise<void> => {
    setSession(next);
    if (next.uid === null) {
      setProfile(null);
      return;
    }
    const mirrored = await peekProfile(next.uid);
    setProfile(mirrored ?? emptyProfile(next.uid, { displayName: next.displayName }));
    const loaded = await loadProfile(next.uid);
    const first = loaded.items[0];
    if (first !== undefined) setProfile(first);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const stored = readJson<DeviceIdentity | null>(DEVICE_KEY, null);
    if (stored !== null && stored.uid.length > 0) {
      void adoptSession(sessionFromDevice(stored));
      return;
    }

    let unsubscribeRemote: (() => void) | null = null;
    void firebaseAuth()
      .then(async (auth) => {
        const { onAuthStateChanged } = await import('firebase/auth');
        if (cancelled) return;
        unsubscribeRemote = onAuthStateChanged(auth, (user) => {
          if (cancelled) return;
          if (user === null) {
            setSession(SIGNED_OUT);
            setProfile(null);
            return;
          }
          void (async () => {
            let claims: Partial<BsdcClaims> = {};
            try {
              const result = await user.getIdTokenResult(true);
              claims = result.claims as Partial<BsdcClaims>;
            } catch {
              claims = {};
            }
            await adoptSession(
              sessionFromAuth(
                user.uid,
                user.email,
                user.displayName ?? '',
                user.emailVerified,
                claims,
              ),
            );
          })();
        });
      })
      .catch(() => {
        if (!cancelled) setSession(SIGNED_OUT);
      });

    return () => {
      cancelled = true;
      unsubscribeRemote?.();
    };
  }, [adoptSession]);

  useEffect(() => {
    if (subscribed.current) return;
    subscribed.current = true;
    subscribeBackend(() => undefined);
  }, []);

  const sendSignInLink = useCallback(async (email: string): Promise<void> => {
    setLastError(null);
    try {
      const { sendSignInLinkToEmail } = await import('firebase/auth');
      const auth = await firebaseAuth();
      await sendSignInLinkToEmail(auth, email, {
        url: `${window.location.origin}/signin`,
        handleCodeInApp: true,
      });
      writeJson('signin-email', email);
    } catch (error) {
      const wrapped = authError(error);
      setLastError(wrapped);
      throw wrapped;
    }
  }, []);

  const completeSignInLink = useCallback(async (email: string, link: string): Promise<void> => {
    setLastError(null);
    try {
      const { signInWithEmailLink } = await import('firebase/auth');
      const auth = await firebaseAuth();
      await signInWithEmailLink(auth, email, link);
    } catch (error) {
      const wrapped = authError(error, 'BSDC-AUTH-006');
      setLastError(wrapped);
      throw wrapped;
    }
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string): Promise<void> => {
    setLastError(null);
    try {
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      const auth = await firebaseAuth();
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      const wrapped = authError(error);
      setLastError(wrapped);
      throw wrapped;
    }
  }, []);

  const createAccount = useCallback(
    async (email: string, password: string, displayName: string): Promise<void> => {
      setLastError(null);
      try {
        const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
        const auth = await firebaseAuth();
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName.trim().length > 0) {
          await updateProfile(credential.user, { displayName: displayName.trim() });
        }
      } catch (error) {
        const wrapped = authError(error);
        setLastError(wrapped);
        throw wrapped;
      }
    },
    [],
  );

  const startDeviceSession = useCallback(
    async (displayName: string): Promise<void> => {
      setLastError(null);
      const identity = newDeviceIdentity(displayName);
      writeJson(DEVICE_KEY, identity);
      await adoptSession(sessionFromDevice(identity));
      if (identity.uid.length > 0) {
        await saveProfile(identity.uid, {
          displayName: identity.displayName,
          locale: activeLocale,
        });
      }
    },
    [activeLocale, adoptSession],
  );

  const signOut = useCallback(async (): Promise<void> => {
    const stored = readJson<DeviceIdentity | null>(DEVICE_KEY, null);
    if (stored !== null) {
      writeJson(DEVICE_KEY, null);
      setSession(SIGNED_OUT);
      setProfile(null);
      return;
    }
    try {
      const { signOut: firebaseSignOut } = await import('firebase/auth');
      const auth = await firebaseAuth();
      await firebaseSignOut(auth);
    } catch (error) {
      const wrapped = authError(error);
      setLastError(wrapped);
    }
    setSession(SIGNED_OUT);
    setProfile(null);
  }, []);

  const refreshClaims = useCallback(async (): Promise<BsdcClaims | null> => {
    try {
      const auth = await firebaseAuth();
      const user = auth.currentUser;
      if (user === null) return null;
      const result = await user.getIdTokenResult(true);
      const claims = result.claims as Partial<BsdcClaims>;
      setSession((current) =>
        current.uid === null
          ? current
          : sessionFromAuth(
              current.uid,
              current.email,
              current.displayName,
              current.emailVerified,
              claims,
            ),
      );
      return {
        role: claims.role ?? 'member',
        root: claims.root === true,
        suspended: claims.suspended === true,
        verifiedCreator: claims.verifiedCreator === true,
      };
    } catch (error) {
      setLastError(authError(error));
      return null;
    }
  }, []);

  const updateProfilePatch = useCallback(
    async (patch: Partial<Profile>): Promise<void> => {
      if (session.uid === null) return;
      setProfile((current) =>
        current === null ? current : { ...current, ...patch, updatedAt: new Date().toISOString() },
      );
      await saveProfile(session.uid, patch);
    },
    [session.uid],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      profile,
      locale: activeLocale,
      sendSignInLink,
      completeSignInLink,
      signInWithPassword,
      createAccount,
      startDeviceSession,
      signOut,
      refreshClaims,
      updateProfile: updateProfilePatch,
      canPublishNow: canPublish(session),
      lastError,
      clearError: () => setLastError(null),
    }),
    [
      session,
      profile,
      activeLocale,
      sendSignInLink,
      completeSignInLink,
      signInWithPassword,
      createAccount,
      startDeviceSession,
      signOut,
      refreshClaims,
      updateProfilePatch,
      lastError,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
