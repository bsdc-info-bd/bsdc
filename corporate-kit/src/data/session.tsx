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
  /** Their picture, when they have one. A console header with initials is fine. */
  readonly avatarUrl: string;
  /** The database's own ranking, so the console and Postgres cannot disagree. */
  readonly rank: number;
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

type IdentityRow = {
  uid: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
  status: string;
  rank: number;
  onboarding_complete: boolean;
  created_at: string;
  last_seen_at: string | null;
};

/** The name a staff row should fall back to when the database has none. */
function displayNameSeed(user: User): string {
  const named = (user.displayName ?? '').trim();
  if (named.length > 0) return named;
  const email = (user.email ?? '').trim();
  if (email.length > 0) return email.split('@')[0] ?? '';
  return '';
}

/**
 * Who is signed in, in one call.
 *
 * Three things had to be true for a console to open, and they used to be checked
 * in three different places: a profile row exists, the row's role carries enough
 * rank for this console, and the account is not suspended. Two of the three were
 * checked by the page after the session said "authenticated", which is why a
 * demoted operator could see a fully rendered console for a moment before every
 * panel refused them.
 */
async function loadIdentity(env: CorporateEnv, user: User): Promise<StaffProfile> {
  const { data, error } = await getDb(env).rpc('staff_identity');
  if (error) {
    // A deployment that predates 0074 answers 404 for a routine it does not have.
    // Falling back to a table read keeps that deployment working, and the read is
    // already covered by the same row level security.
    return loadIdentityFromTable(env, user);
  }
  const rows = (Array.isArray(data) ? data : [data]) as IdentityRow[];
  const row = rows[0];
  if (!row) {
    // Signed in, no row. This is the state every console used to report as "this
    // account has no profile in the community database", with no way forward.
    return provision(env, user);
  }
  if (row.status !== 'active') {
    throw new Error(
      row.status === 'suspended'
        ? 'This account is suspended. A manager or owner has to lift it before a console will open.'
        : `This account is ${row.status.replace('_', ' ')}. A manager or owner has to restore it before a console will open.`,
    );
  }
  return {
    uid: row.uid,
    displayName: row.display_name,
    role: row.role,
    avatarUrl: row.avatar_url ?? '',
    rank: row.rank,
  };
}

/**
 * The first sign-in of an operator who has no row yet.
 *
 * `provision_staff` creates it from the role the token already carries — it
 * cannot grant more than that, which is why it is safe to call on every path.
 * A caller whose token says `member` gets a member row and is refused by the
 * console for lack of rank, which is a true answer; the old behaviour was to tell
 * a real owner that their account was empty.
 */
async function provision(env: CorporateEnv, user: User): Promise<StaffProfile> {
  const { data, error } = await getDb(env).rpc('provision_staff', {
    p_display_name: displayNameSeed(user),
  });
  if (error) {
    if (missingRoutine(error.code)) return loadIdentityFromTable(env, user);
    throw toDataError(error);
  }
  const rows = (Array.isArray(data) ? data : [data]) as IdentityRow[];
  const row = rows[0];
  if (!row) throw new Error('The database did not return the profile it just created.');
  if (row.status !== 'active') {
    throw new Error('This account is not active, so a console cannot open.');
  }
  return {
    uid: row.uid,
    displayName: row.display_name,
    role: row.role,
    avatarUrl: row.avatar_url ?? '',
    rank: row.rank,
  };
}

/** 0074 is not applied: read the table, and say something useful when it is empty. */
async function loadIdentityFromTable(env: CorporateEnv, user: User): Promise<StaffProfile> {
  const { data, error } = await getDb(env)
    .from('profiles')
    .select('uid, display_name, role, avatar_url, status')
    .eq('uid', user.uid)
    .maybeSingle();
  if (error) throw toDataError(error);
  const row = data as Omit<
    IdentityRow,
    'rank' | 'onboarding_complete' | 'created_at' | 'last_seen_at'
  > | null;
  if (!row) {
    throw new Error(
      'This account has no profile in the community database, and this deployment cannot create one. ' +
        'Apply migration 0074, or sign in at bsdc.info.bd once with this address and try again.',
    );
  }
  if (row.status !== 'active') {
    throw new Error('This account is not active, so a console cannot open.');
  }
  return {
    uid: row.uid,
    displayName: row.display_name,
    role: row.role,
    avatarUrl: row.avatar_url ?? '',
    rank: 0,
  };
}

/** True when the failure means the routine itself is absent, not that it refused. */
function missingRoutine(code: string | undefined): boolean {
  return code === 'PGRST202' || code === '42883' || code === 'PGRST301';
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
      loadIdentity(env, user)
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
