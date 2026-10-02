import { useCallback, useMemo, useState, type ReactElement } from 'react';
import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  Empty,
  Field,
  Loading,
  Select,
  Table,
  formatCardCode,
  listRpc,
  useAsync,
  useCorporateEnv,
} from '@kit';
import {
  matches,
  needsAttention,
  roster,
  sortRows,
  tenureLabel,
  tenureMonths,
  type SortKey,
  type StaffRow,
} from './model';

/**
 * People operations. This console reads the staff directory and no more:
 * writing a record or issuing a card needs the administrators' console,
 * because those two actions are the ones worth making deliberate.
 */
export function App(): ReactElement {
  return (
    <AppShell
      minRole="moderator"
      note="Directory access is logged."
      tabs={[
        { id: 'directory', label: 'Directory', render: () => <Directory /> },
        { id: 'roster', label: 'Shift roster', render: () => <Roster /> },
      ]}
    />
  );
}

function useDirectory(): ReturnType<typeof useAsync<readonly StaffRow[]>> {
  const env = useCorporateEnv();
  const load = useCallback(
    () => listRpc<StaffRow>(env, 'staff_directory', { p_role: 'all' }),
    [env],
  );
  return useAsync(load, [env]);
}

function Directory(): ReactElement {
  const { state } = useDirectory();
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState<SortKey>('staff_no');

  const rows = useMemo(() => {
    if (state.status !== 'ready') return [] as readonly StaffRow[];
    return sortRows(
      state.data.filter((row) => matches(row, term)),
      sort,
    );
  }, [state, term, sort]);

  if (state.status === 'loading') return <Loading label="Loading the directory." />;
  if (state.status === 'error')
    return (
      <Banner tone="bad" title="The directory did not load">
        {state.message}
      </Banner>
    );

  const attention = needsAttention(state.data);

  return (
    <div className="kit-stack">
      {attention.length > 0 && (
        <Banner
          tone="warn"
          title={`${attention.length} record${attention.length === 1 ? '' : 's'} incomplete`}
        >
          <p className="kit-small">
            Missing a department or an identity card:{' '}
            {attention.map((row) => row.display_name).join(', ')}.
          </p>
        </Banner>
      )}

      <Card
        title="Find somebody"
        description="Search a name, username, staff number, department or role."
      >
        <div className="kit-grid">
          <Field
            label="Search"
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
            }}
          />
          <Select
            label="Order by"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as SortKey);
            }}
            options={[
              { value: 'staff_no', label: 'Staff number' },
              { value: 'name', label: 'Name' },
              { value: 'role', label: 'Role, highest first' },
              { value: 'department', label: 'Department' },
              { value: 'joined', label: 'Longest serving' },
            ]}
          />
        </div>
        {term !== '' && (
          <p className="kit-hint" style={{ marginTop: 'var(--sp-2)' }}>
            {rows.length} of {state.data.length} records match.
          </p>
        )}
      </Card>

      {rows.length === 0 ? (
        <Empty>Nobody matches that search.</Empty>
      ) : (
        <Table
          caption="Read-only. Records are written in the administrators' console."
          head={['Staff number', 'Name', 'Role', 'Department', 'Shift', 'Service', 'Card']}
        >
          {rows.map((row) => (
            <tr key={row.uid}>
              <td className="kit-mono kit-small">{row.staff_no}</td>
              <td>
                {row.display_name}
                {row.username === null ? '' : ` (${row.username})`}
              </td>
              <td>
                <Badge>{row.role}</Badge>
              </td>
              <td className="kit-small">{row.department === '' ? 'Unassigned' : row.department}</td>
              <td className="kit-small">{row.shift}</td>
              <td className="kit-small">{tenureLabel(tenureMonths(row))}</td>
              <td className="kit-small kit-mono">
                {row.card_code === null || row.card_code === '' ? (
                  <span className="kit-muted">not issued</span>
                ) : (
                  formatCardCode(row.card_code)
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function Roster(): ReactElement {
  const { state, reload } = useDirectory();

  if (state.status === 'loading') return <Loading label="Loading the roster." />;
  if (state.status === 'error')
    return (
      <Banner tone="bad" title="The roster did not load">
        {state.message}
      </Banner>
    );

  const groups = roster(state.data);

  return (
    <div className="kit-stack">
      <Card
        title="Shift roster"
        description="Who is assigned to each shift, taken from the staff records."
        actions={
          <Button size="small" variant="quiet" onClick={reload}>
            Refresh
          </Button>
        }
      >
        {groups.length === 0 ? (
          <Empty>No active staff are assigned to a shift.</Empty>
        ) : (
          <div className="kit-grid">
            {groups.map((group) => (
              <div key={group.shift}>
                <h3>
                  {group.shift} <span className="kit-muted kit-small">({group.people.length})</span>
                </h3>
                <ul className="kit-small" style={{ margin: 0, paddingInlineStart: '1.1rem' }}>
                  {group.people.map((person) => (
                    <li key={person.uid}>
                      {person.display_name}
                      {person.designation === '' ? '' : ` — ${person.designation}`}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
