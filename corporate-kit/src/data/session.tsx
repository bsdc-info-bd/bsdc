import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { getDb, signIn, signOut, watchUser, type User } from './client';
import { missingConfig, type CorporateEnv } from './env';
import { messageOf, toDataError } from './rpc';
import { roleRank } from '../domain/staff';

/**
 * A corporate session is a Firebase identity plus the role Postgres holds
 * for it. The role is read from the database rather than from a token claim,
 * so revoking a role takes effect on the next page load instead of whenever
 * a token happens to refresh.
 */
export type StaffProfile = {
  readonly uid: string;
  readonly displayName: string;
  readonly role: string;
};

export type SessionState =
  | { readonly status: 'configuring'; readonly missing: readonly string[] }
  | { readonly status: 'loading' }
  | { readonly status: 'anonymous' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'authenticated'; readonly profile: StaffProfile };

type SessionValue = {
  readonly env: CorporateEnv;
  readonly state: SessionState;
  readonly signIn: (email: string, password: string) => Promise<void>;
  readonly signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

type ProfileRow = { uid: string; display_name: string; role: string };

async function loadProfile(env: CorporateEnv, user: User): Promise<StaffProfile> {
  const { data, error } = await getDb(env)
    .from('profiles')
    .select('uid, display_name, role')
    .eq('uid', user.uid)
    .maybeSingle();
  if (error) throw toDataError(error);
  const row = data as ProfileRow | null;
  if (!row) {
    throw new Error('This account has no profile in the community database.');
  }
  return { uid: row.uid, displayName: row.display_name, role: row.role };
}

export function SessionProvider({
  env,
  children,
}: {
  env: CorporateEnv;
  children: ReactNode;
}): ReactElement {
  const missing = useMemo(() => missingConfig(env), [env]);
  const [state, setState] = useState<SessionState>(
    missing.length > 0 ? { status: 'configuring', missing } : { status: 'loading' },
  );

  useEffect(() => {
    if (missing.length > 0) return undefined;
    let active = true;
    const stop = watchUser(env, (user) => {
      if (!user) {
        if (active) setState({ status: 'anonymous' });
        return;
      }
      setState({ status: 'loading' });
      loadProfile(env, user)
        .then((profile) => {
          if (active) setState({ status: 'authenticated', profile });
        })
        .catch((error: unknown) => {
          if (active) setState({ status: 'error', message: messageOf(error) });
        });
    });
    return () => {
      active = false;
      stop();
    };
  }, [env, missing.length]);

  const value = useMemo<SessionValue>(
    () => ({
      env,
      state,
      signIn: async (email, password) => {
        setState({ status: 'loading' });
        try {
          await signIn(env, email, password);
        } catch (error: unknown) {
          setState({ status: 'error', message: signInMessage(error) });
          throw error;
        }
      },
      signOut: async () => {
        await signOut(env);
        setState({ status: 'anonymous' });
      },
    }),
    [env, state],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function signInMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (
    code.includes('invalid-credential') ||
    code.includes('wrong-password') ||
    code.includes('user-not-found')
  ) {
    return 'That email address and password do not match a staff account.';
  }
  if (code.includes('too-many-requests')) {
    return 'Too many attempts. Wait a few minutes before trying again.';
  }
  if (code.includes('network'))
    return 'The network did not answer. Check the connection and try again.';
  return messageOf(error);
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside a SessionProvider.');
  return value;
}

/** The signed-in profile, or null when nobody is signed in yet. */
export function useProfile(): StaffProfile | null {
  const { state } = useSession();
  return state.status === 'authenticated' ? state.profile : null;
}

/** True when the signed-in role meets the minimum this console requires. */
export function meetsRole(profile: StaffProfile | null, minRole: string): boolean {
  return profile !== null && roleRank(profile.role) >= roleRank(minRole);
}

export function useCorporateEnv(): CorporateEnv {
  return useSession().env;
}
