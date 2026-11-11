import { useCallback, useState, type ReactElement } from 'react';
import {
  Badge,
  Banner,
  BulkBar,
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
  roleRank,
  rowsToCsv,
  useAsync,
  useCorporateEnv,
  useProfile,
} from '@kit';
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
 * Roles, standing, and batch user governance across all BSDC members and staff.
 */
export function People(): ReactElement {
  const env = useCorporateEnv();
  const profile = useProfile();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkRole, setBulkRole] = useState<PersonRole>('member');
  const [bulkStatus, setBulkStatus] = useState<PersonStatus>('active');
  const [bulkReason, setBulkReason] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');

  const load = useCallback(
    () => listRpc<PersonRow>(env, 'admin_people', { p_search: term, p_limit: 120 }),
    [env, term],
  );
  const { state, reload } = useAsync(load, [env, term]);

  const allPeople = state.status === 'ready' ? rankPeople(state.data, term) : [];
  const people = roleFilter === 'all' ? allPeople : allPeople.filter((p) => p.role === roleFilter);

  const toggle = (uid: string): void => {
    setSelected((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  };

  const applyBulkRole = async (): Promise<void> => {
    if (selected.length === 0) return;
    setBulkBusy(true);
    setBulkMsg('');
    try {
      const count = await callRpc<number>(env, 'bulk_people_role', {
        p_uids: selected,
        p_role: bulkRole,
      });
      setBulkMsg(`Updated role to "${bulkRole}" on ${count} account(s).`);
      setSelected([]);
      reload();
    } catch (cause) {
      setBulkMsg(messageOf(cause));
    } finally {
      setBulkBusy(false);
    }
  };

  const applyBulkStatus = async (): Promise<void> => {
    if (selected.length === 0) return;
    setBulkBusy(true);
    setBulkMsg('');
    try {
      const count = await callRpc<number>(env, 'bulk_people_status', {
        p_uids: selected,
        p_status: bulkStatus,
        p_reason: bulkReason.trim(),
      });
      setBulkMsg(`Updated standing to "${bulkStatus}" on ${count} account(s).`);
      setSelected([]);
      setBulkReason('');
      reload();
    } catch (cause) {
      setBulkMsg(messageOf(cause));
    } finally {
      setBulkBusy(false);
    }
  };

  const exportCsv = (): void => {
    const csv = rowsToCsv(
      ['uid', 'display_name', 'username', 'role', 'status'],
      people.map((p) => [p.uid, p.display_name, p.username ?? '', p.role, p.status]),
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bsdc-people-governance.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="kit-stack">
      <Banner tone="warn" title="A role takes effect on the next sign-in">
        <p className="kit-small">
          Changing a role writes the database row immediately. The token that every permission check
          reads is minted on sign-in, and every change is recorded in the immutable audit log.
        </p>
      </Banner>

      <Card
        title="Find and Filter Accounts"
        description="Search a handle, display name, or filter by role clearance."
        actions={
          people.length > 0 ? (
            <Button size="small" variant="quiet" onClick={exportCsv}>
              Export CSV ({people.length})
            </Button>
          ) : undefined
        }
      >
        <form
          className="kit-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setTerm(searchTerm(search));
          }}
        >
          <Field
            label="Search"
            type="search"
            value={search}
            maxLength={60}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            label="Filter by role"
            value={roleFilter}
            options={[
              { value: 'all', label: 'All roles' },
              ...ROLES.map((r) => ({ value: r, label: r })),
            ]}
            onChange={(e) => setRoleFilter(e.target.value)}
          />
          <div className="kit-row" style={{ alignItems: 'flex-end' }}>
            <Button type="submit">Search</Button>
            {term !== '' && (
              <Button
                variant="quiet"
                onClick={() => {
                  setSearch('');
                  setTerm('');
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </form>
      </Card>

      {bulkMsg !== '' && (
        <Banner tone="neutral" title="Bulk Update">
          <p className="kit-small">{bulkMsg}</p>
        </Banner>
      )}

      {state.status === 'loading' ? <Loading label="Loading people." /> : null}
      {state.status === 'error' ? (
        <Banner tone="bad" title="That list did not load">
          <p className="kit-small">{state.message}</p>
        </Banner>
      ) : null}
      {state.status === 'ready' && people.length === 0 ? (
        <Empty>
          {term === '' ? 'No accounts match the active filter.' : `No account matches “${term}”.`}
        </Empty>
      ) : null}

      {state.status === 'ready' && people.length > 0 ? (
        <Card
          title={`${String(people.length)} account${people.length === 1 ? '' : 's'}`}
          description="Select multiple accounts for batch role/standing changes or edit rows individually."
        >
          <Table
            caption=""
            head={['', 'Person', 'Role', 'Standing', 'Change role', 'Standing change']}
          >
            {people.map((person) => (
              <PersonTableRow
                key={person.uid}
                person={person}
                actorRole={profile?.role ?? 'member'}
                actorUid={profile?.uid ?? ''}
                selected={selected.includes(person.uid)}
                canSelect={canActOn(profile?.role ?? 'member', profile?.uid ?? '', person).allowed}
                onToggleSelect={() => toggle(person.uid)}
                onChanged={reload}
              />
            ))}
          </Table>
        </Card>
      ) : null}

      <BulkBar selectedCount={selected.length} onClear={() => setSelected([])}>
        <Select
          label="Role"
          value={bulkRole}
          options={ROLES.filter((r) => roleRank(r) < roleRank(profile?.role ?? 'member')).map(
            (r) => ({ value: r, label: r }),
          )}
          onChange={(e) => setBulkRole(e.target.value as PersonRole)}
        />
        <Button
          size="small"
          disabled={bulkBusy}
          onClick={() => {
            void applyBulkRole();
          }}
        >
          Set Role
        </Button>
        <Select
          label="Standing"
          value={bulkStatus}
          options={STATUSES.map((s) => ({ value: s, label: s }))}
          onChange={(e) => setBulkStatus(e.target.value as PersonStatus)}
        />
        <Field
          label="Reason (for suspend)"
          value={bulkReason}
          onChange={(e) => setBulkReason(e.target.value)}
        />
        <Button
          size="small"
          variant={bulkStatus === 'suspended' ? 'danger' : 'quiet'}
          disabled={bulkBusy || (bulkStatus !== 'active' && bulkReason.trim().length < 4)}
          onClick={() => {
            void applyBulkStatus();
          }}
        >
          Apply Standing
        </Button>
      </BulkBar>
    </div>
  );
}

function PersonTableRow({
  person,
  actorRole,
  actorUid,
  selected,
  canSelect,
  onToggleSelect,
  onChanged,
}: {
  person: PersonRow;
  actorRole: string;
  actorUid: string;
  selected: boolean;
  canSelect: boolean;
  onToggleSelect: () => void;
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
        <input
          type="checkbox"
          disabled={!canSelect}
          aria-label={`Select ${person.display_name}`}
          checked={selected}
          onChange={onToggleSelect}
        />
      </td>
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
