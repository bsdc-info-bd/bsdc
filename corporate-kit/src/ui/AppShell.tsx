import { useState, type ReactElement, type ReactNode } from 'react';
import { meetsRole, useSession } from '../data/session';
import { roleRank } from '../domain/staff';
import { Banner, Button, Card, Field, Loading } from './primitives';

/**
 * The frame every console shares: a header that says which console this is
 * and who is signed in, a tab strip, and the gate. A console refuses to show
 * anything before the database has confirmed the role, because a console
 * that renders first and checks later teaches people to ignore the check.
 */

/** Two letters for a header avatar, from whatever name the row holds. */
function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => [...part][0] ?? '')
    .join('')
    .toUpperCase();
}

export type ConsoleTab = {
  readonly id: string;
  readonly label: string;
  readonly render: () => ReactNode;
};

export function AppShell({
  tabs,
  minRole,
  note,
}: {
  tabs: readonly ConsoleTab[];
  minRole: string;
  note?: string;
}): ReactElement {
  const { env, state, signOut } = useSession();
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? '');
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  const profile = state.status === 'authenticated' ? state.profile : null;
  const allowed = meetsRole(profile, minRole);

  return (
    <div className="kit-shell">
      <header className="kit-header">
        <div className="kit-brand">
          <strong>{env.appName}</strong>
          <span>Bangladesh Software Development Community</span>
        </div>
        {profile && allowed && (
          <nav aria-label="Sections">
            <ul className="kit-nav">
              {tabs.map((tab) => (
                <li key={tab.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(tab.id)}
                    aria-current={tab.id === active?.id ? 'page' : undefined}
                  >
                    {tab.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {profile && (
          <div className="kit-who">
            {profile.avatarUrl.length > 0 ? (
              <img
                src={profile.avatarUrl}
                alt=""
                width={28}
                height={28}
                loading="lazy"
                decoding="async"
                className="kit-avatar"
              />
            ) : (
              <span className="kit-avatar kit-avatar-initials" aria-hidden="true">
                {initialsOf(profile.displayName)}
              </span>
            )}
            <span>
              {profile.displayName} ({profile.role})
            </span>
            <Button
              variant="quiet"
              size="small"
              onClick={() => {
                void signOut();
              }}
            >
              Sign out
            </Button>
          </div>
        )}
      </header>

      <main className="kit-main">
        <Gate minRole={minRole} note={note}>
          {active ? active.render() : null}
        </Gate>
      </main>

      <footer className="kit-footer">
        BSDC corporate network. Every action in this console is recorded in the audit trail.
      </footer>
    </div>
  );
}

function Gate({
  minRole,
  note,
  children,
}: {
  minRole: string;
  note: string | undefined;
  children: ReactNode;
}): ReactElement {
  const { state, signOut } = useSession();

  if (state.status === 'configuring') {
    return (
      <Banner tone="bad" title="This console is not configured">
        <p className="kit-small">
          The deployment is missing: <span className="kit-mono">{state.missing.join(', ')}</span>.
          Add the values to the Cloudflare Pages project and redeploy.
        </p>
      </Banner>
    );
  }

  if (state.status === 'loading') return <Loading label="Checking your access." />;
  if (state.status === 'anonymous') return <SignInForm note={note} />;
  if (state.status === 'error') {
    return (
      <div className="kit-stack">
        <Banner tone="bad" title="Sign in failed">
          <p className="kit-small">{state.message}</p>
        </Banner>
        <SignInForm note={note} />
      </div>
    );
  }

  if (!meetsRole(state.profile, minRole)) {
    return (
      <div className="kit-stack">
        <Banner tone="warn" title="You do not have access to this console">
          <p className="kit-small">
            This console needs the <strong>{minRole}</strong> role or higher. You are signed in as{' '}
            <strong>{state.profile.role}</strong> (rank {roleRank(state.profile.role)} of 7).
          </p>
          <p className="kit-small">
            A rank is given by somebody who already outranks you, in the People screen of the admin
            console. If you are the first person setting this deployment up, the address on this
            account has to be on the owner allowlist —{' '}
            <span className="kit-mono">BSDC2_OWNER_UIDS</span> or{' '}
            <span className="kit-mono">BSDC_BOOTSTRAP_OWNER_EMAILS</span> — and the account has to
            sign out and back in so a fresh token picks the role up.
          </p>
        </Banner>
        <div>
          <Button
            type="button"
            onClick={() => {
              void signOut();
            }}
          >
            Sign in as somebody else
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function SignInForm({ note }: { note: string | undefined }): ReactElement {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div style={{ maxWidth: '26rem', margin: '0 auto' }}>
      <Card
        title="Staff sign in"
        description={note ?? 'Use your corporate account, not your member account.'}
      >
        <form
          className="kit-stack"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            void signIn(email, password)
              .catch(() => undefined)
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          <Field
            label="Email address"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
          <Button type="submit" disabled={busy || email === '' || password === ''}>
            {busy ? 'Signing in' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
