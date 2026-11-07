import { useCallback, useState, type ReactElement } from 'react';
import {
  Badge,
  Banner,
  Button,
  Card,
  Empty,
  Field,
  Loading,
  Select,
  Table,
  callRpc,
  listRpc,
  messageOf,
  useAsync,
  useCorporateEnv,
  useProfile,
} from '@kit';
import { roleRank } from '@kit';
import {
  ROLES,
  STATUSES,
  afterRoleChange,
  canActOn,
  canChangeStatus,
  rankPeople,
  searchTerm,
  statusProblems,
  type PersonRow,
  type PersonRole,
  type PersonStatus,
} from './people';

/**
 * Roles and account standing, for every member and not only staff.
 *
 * `set_user_role()` and `set_account_status()` have existed since 0024 and were
 * reachable only from the community site's own admin page — so an owner working
 * in the corporate consoles, which is where every other staff action lives, could
 * not promote a moderator or suspend an abusive account without going back to the
 * member site and finding a different page.
 *
 * The rules are shown, not assumed: a control that the database would refuse is
 * disabled with the reason beside it, because an operator who is offered an action
 * and then refused it stops trusting the screen. The database still refuses:
 * a disabled button is not a permission check.
 */
export function People(): ReactElement {
  const env = useCorporateEnv();
  const profile = useProfile();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');

  const load = useCallback(
    () => listRpc<PersonRow>(env, 'admin_people', { p_search: term, p_limit: 100 }),
    [env, term],
  );
  const { state, reload } = useAsync(load, [env, term]);

  const people = state.status === 'ready' ? rankPeople(state.data, term) : [];

  return (
    <div className="kit-stack">
      <Banner tone="warn" title="A role takes effect on the next sign-in">
        <p className="kit-small">
          Changing a role writes the database row immediately. The token that every permission check
          reads is minted from that row when somebody signs in, so a promotion is not visible to
          them until they do. Nothing here is reversible by accident: every change is in the audit
          log with your name on it.
        </p>
      </Banner>

      <Card
        title="Find somebody"
        description="A handle, part of a name, or nothing for recent accounts."
      >
        <form
          className="kit-row"
          style={{ gap: 'var(--sp-2)', alignItems: 'flex-end' }}
          onSubmit={(event) => {
            event.preventDefault();
            setTerm(searchTerm(search));
          }}
        >
          <div style={{ flex: 1 }}>
            <Field
              label="Search"
              type="search"
              value={search}
              maxLength={60}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </div>
          <Button type="submit">Search</Button>
          {term !== '' ? (
            <Button
              variant="quiet"
              onClick={() => {
                setSearch('');
                setTerm('');
              }}
            >
              Clear
            </Button>
          ) : null}
        </form>
      </Card>

      {state.status === 'loading' ? <Loading label="Loading people." /> : null}
      {state.status === 'error' ? (
        <Banner tone="bad" title="That list did not load">
          <p className="kit-small">{state.message}</p>
        </Banner>
      ) : null}
      {state.status === 'ready' && people.length === 0 ? (
        <Empty>
          {term === ''
            ? 'There are no accounts to show. On a new deployment this means no member has signed in yet.'
            : `No account matches “${term}”.`}
        </Empty>
      ) : null}

      {state.status === 'ready' && people.length > 0 ? (
        <Card
          title={`${String(people.length)} account${people.length === 1 ? '' : 's'}`}
          description="Every row says what you may do to it, and why not when you may not."
        >
          <Table caption="" head={['Person', 'Role', 'Standing', 'Change role', 'Standing change']}>
            {people.map((person) => (
              <PersonTableRow
                key={person.uid}
                person={person}
                actorRole={profile?.role ?? 'member'}
                actorUid={profile?.uid ?? ''}
                onChanged={reload}
              />
            ))}
          </Table>
        </Card>
      ) : null}
    </div>
  );
}

function PersonTableRow({
  person,
  actorRole,
  actorUid,
  onChanged,
}: {
  person: PersonRow;
  actorRole: string;
  actorUid: string;
  onChanged: () => void;
}): ReactElement {
  const env = useCorporateEnv();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<PersonStatus>((person.status as PersonStatus) ?? 'active');
  const [reason, setReason] = useState('');

  const roleCheck = canActOn(actorRole, actorUid, person);
  const statusCheck = canChangeStatus(actorRole, actorUid, person);
  // Strictly below the actor: the rule `set_user_role()` enforces, drawn rather
  // than assumed.
  const assignable = ROLES.filter(
    (role) => roleCheck.allowed && role !== person.role && roleRank(role) < roleRank(actorRole),
  );

  const changeRole = (role: PersonRole): void => {
    setBusy(true);
    setError('');
    callRpc(env, 'set_user_role', { p_uid: person.uid, p_role: role })
      .then(() => {
        setNote(afterRoleChange(person, role));
        onChanged();
      })
      .catch((cause: unknown) => {
        setError(messageOf(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const changeStatus = (): void => {
    const problems = statusProblems(status, reason);
    if (problems.length > 0) {
      setError(problems[0] ?? '');
      return;
    }
    setBusy(true);
    setError('');
    callRpc(env, 'set_account_status', {
      p_uid: person.uid,
      p_status: status,
      p_reason: reason.trim(),
    })
      .then(() => {
        setNote(`${person.display_name} is now ${status}.`);
        setReason('');
        onChanged();
      })
      .catch((cause: unknown) => {
        setError(messageOf(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>{person.display_name}</div>
        <div className="kit-small kit-muted kit-mono">
          {person.username === null ? person.uid.slice(0, 12) : `@${person.username}`}
        </div>
        {error !== '' ? <div className="kit-error kit-small">{error}</div> : null}
        {note !== '' ? <div className="kit-small kit-muted">{note}</div> : null}
      </td>
      <td>
        <Badge>{person.role}</Badge>
      </td>
      <td>
        <Badge
          tone={person.status === 'active' ? 'ok' : person.status === 'suspended' ? 'bad' : 'warn'}
        >
          {person.status}
        </Badge>
      </td>
      <td>
        {!roleCheck.allowed ? (
          <span className="kit-small kit-muted">{roleCheck.reason}</span>
        ) : assignable.length === 0 ? (
          <span className="kit-small kit-muted">No role below yours is left to give.</span>
        ) : (
          <Select
            label=""
            value={person.role}
            disabled={busy}
            onChange={(event) => {
              const role = event.target.value as PersonRole;
              if (role !== person.role) changeRole(role);
            }}
            options={[
              { value: person.role, label: `Keep ${person.role}` },
              ...assignable.map((role) => ({ value: role, label: `Make ${role}` })),
            ]}
          />
        )}
      </td>
      <td>
        {!statusCheck.allowed ? (
          <span className="kit-small kit-muted">{statusCheck.reason}</span>
        ) : (
          <div className="kit-stack">
            <Select
              label=""
              value={status}
              disabled={busy}
              onChange={(event) => {
                setStatus(event.target.value as PersonStatus);
              }}
              options={STATUSES.map((value) => ({ value, label: value }))}
            />
            {status !== person.status ? (
              <>
                {status !== 'active' ? (
                  <Field
                    label="Why"
                    value={reason}
                    maxLength={500}
                    onChange={(event) => {
                      setReason(event.target.value);
                    }}
                  />
                ) : null}
                <Button
                  size="small"
                  variant={status === 'suspended' ? 'danger' : 'primary'}
                  disabled={busy}
                  onClick={changeStatus}
                >
                  {busy ? 'Saving' : `Set ${status}`}
                </Button>
              </>
            ) : null}
          </div>
        )}
      </td>
    </tr>
  );
}
