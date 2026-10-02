import { useCallback, useState, type ReactElement } from 'react';
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
  callRpc,
  formatCardCode,
  isValidCardCode,
  listRpc,
  messageOf,
  useAsync,
  useCorporateEnv,
  useProfile,
} from '@kit';
import {
  EMPTY_DRAFT,
  SHIFTS,
  cardState,
  draftProblems,
  draftToArgs,
  headcount,
  mayEdit,
  rowToDraft,
  type Shift,
  type StaffDraft,
  type StaffRow,
} from './model';

/**
 * Staff records and identity cards. A record may only be written for
 * somebody who already holds a staff role and who the author outranks: a
 * records console must not be a way to quietly promote somebody.
 */
export function App(): ReactElement {
  return (
    <AppShell
      minRole="admin"
      note="Staff records carry personal data. Only open what you need."
      tabs={[
        { id: 'directory', label: 'Directory', render: () => <Directory /> },
        { id: 'verify', label: 'Verify a card', render: () => <Verify /> },
      ]}
    />
  );
}

function Directory(): ReactElement {
  const env = useCorporateEnv();
  const profile = useProfile();
  const [role, setRole] = useState('all');
  const load = useCallback(
    () => listRpc<StaffRow>(env, 'staff_directory', { p_role: role }),
    [env, role],
  );
  const { state, reload } = useAsync(load, [env, role]);
  const [draft, setDraft] = useState<StaffDraft>(EMPTY_DRAFT);

  return (
    <div className="kit-stack">
      <RecordForm draft={draft} onDraft={setDraft} onSaved={reload} />

      <Card title="Directory" description="Active staff, by staff number.">
        <Select
          label="Role"
          value={role}
          onChange={(event) => {
            setRole(event.target.value);
          }}
          options={[
            { value: 'all', label: 'Every staff role' },
            { value: 'moderator', label: 'Moderators' },
            { value: 'manager', label: 'Managers' },
            { value: 'admin', label: 'Administrators' },
            { value: 'owner', label: 'Owners' },
          ]}
        />
      </Card>

      {state.status === 'loading' ? (
        <Loading label="Loading the directory." />
      ) : state.status === 'error' ? (
        <Banner tone="bad" title="The directory did not load">
          {state.message}
        </Banner>
      ) : state.data.length === 0 ? (
        <Empty>No staff records match this filter.</Empty>
      ) : (
        <>
          <Card title="Headcount">
            <div className="kit-row">
              {headcount(state.data).map((entry) => (
                <Badge key={entry.department}>
                  {entry.department}: {entry.count}
                </Badge>
              ))}
            </div>
          </Card>
          <Table
            caption="A card can be reissued at any time; the previous code stops working."
            head={['Staff number', 'Name', 'Role', 'Department', 'Card', 'Actions']}
          >
            {state.data.map((row) => (
              <tr key={row.uid}>
                <td className="kit-mono kit-small">{row.staff_no}</td>
                <td>{row.display_name}</td>
                <td>{row.role}</td>
                <td className="kit-small">
                  {row.department === '' ? 'Unassigned' : row.department}
                </td>
                <td className="kit-small kit-mono">
                  {cardState(row) === 'none' ? (
                    <span className="kit-muted">not issued</span>
                  ) : cardState(row) === 'corrupt' ? (
                    <Badge tone="bad">check digit does not match</Badge>
                  ) : (
                    formatCardCode(row.card_code ?? '')
                  )}
                </td>
                <td>
                  <div className="kit-row">
                    <Button
                      size="small"
                      variant="quiet"
                      disabled={!mayEdit(profile?.role ?? 'member', row)}
                      onClick={() => {
                        setDraft(rowToDraft(row));
                      }}
                    >
                      Edit
                    </Button>
                    <IssueCard uid={row.uid} onIssued={reload} />
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </div>
  );
}

function IssueCard({ uid, onIssued }: { uid: string; onIssued: () => void }): ReactElement {
  const env = useCorporateEnv();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <>
      <Button
        size="small"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError('');
          callRpc<string>(env, 'issue_staff_card', { p_uid: uid })
            .then(() => {
              onIssued();
            })
            .catch((cause: unknown) => {
              setError(messageOf(cause));
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      >
        {busy ? 'Issuing' : 'Issue card'}
      </Button>
      {error !== '' && <span className="kit-error">{error}</span>}
    </>
  );
}

function RecordForm({
  draft,
  onDraft,
  onSaved,
}: {
  draft: StaffDraft;
  onDraft: (next: StaffDraft) => void;
  onSaved: () => void;
}): ReactElement {
  const env = useCorporateEnv();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const problems = draftProblems(draft);

  const save = (): void => {
    setBusy(true);
    setError('');
    callRpc(env, 'upsert_staff_record', draftToArgs(draft))
      .then(() => {
        onDraft(EMPTY_DRAFT);
        onSaved();
      })
      .catch((cause: unknown) => {
        setError(messageOf(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const set = (patch: Partial<StaffDraft>): void => {
    onDraft({ ...draft, ...patch });
  };

  return (
    <Card
      title="Staff record"
      description="A record can only be written for a member who already holds a staff role."
    >
      {error !== '' && (
        <Banner tone="bad" title="The record was not saved">
          {error}
        </Banner>
      )}
      <div className="kit-grid">
        <Field
          label="Member identifier"
          hint="The uid of the member this record belongs to."
          value={draft.uid}
          onChange={(event) => {
            set({ uid: event.target.value });
          }}
        />
        <Field
          label="Staff number"
          hint="Letters, a hyphen, then digits, such as ENG-014."
          value={draft.staffNo}
          onChange={(event) => {
            set({ staffNo: event.target.value });
          }}
        />
        <Field
          label="Department"
          value={draft.department}
          onChange={(event) => {
            set({ department: event.target.value });
          }}
        />
        <Field
          label="Designation"
          value={draft.designation}
          onChange={(event) => {
            set({ designation: event.target.value });
          }}
        />
        <Field
          label="Work email"
          type="email"
          value={draft.workEmail}
          onChange={(event) => {
            set({ workEmail: event.target.value });
          }}
        />
        <Field
          label="Phone"
          value={draft.phone}
          onChange={(event) => {
            set({ phone: event.target.value });
          }}
        />
        <Select
          label="Shift"
          value={draft.shift}
          onChange={(event) => {
            set({ shift: event.target.value as Shift });
          }}
          options={SHIFTS.map((shift) => ({ value: shift, label: shift }))}
        />
        <Field
          label="Document link"
          hint="An https address for the signed contract or curriculum vitae."
          value={draft.cvUrl}
          onChange={(event) => {
            set({ cvUrl: event.target.value });
          }}
        />
      </div>

      {problems.length > 0 && draft.uid !== '' && (
        <ul className="kit-error" style={{ marginTop: 'var(--sp-3)' }}>
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <div className="kit-row" style={{ marginTop: 'var(--sp-3)' }}>
        <Button disabled={busy || problems.length > 0} onClick={save}>
          {busy ? 'Saving' : 'Save record'}
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            onDraft(EMPTY_DRAFT);
          }}
        >
          Clear
        </Button>
      </div>
    </Card>
  );
}

function Verify(): ReactElement {
  const [code, setCode] = useState('');
  const typed = code.trim() !== '';
  const valid = isValidCardCode(code);

  return (
    <Card
      title="Verify a card code"
      description="The check digit is recomputed here, so a mistyped code is caught without a database lookup."
    >
      <Field
        label="Card code"
        placeholder="BSDC-ID-4A7C21B9-3"
        value={code}
        onChange={(event) => {
          setCode(event.target.value);
        }}
      />
      {typed && (
        <p style={{ marginTop: 'var(--sp-3)' }}>
          <Badge tone={valid ? 'ok' : 'bad'}>{valid ? 'well formed' : 'not a valid code'}</Badge>{' '}
          <span className="kit-small kit-muted">
            {valid
              ? `Reads as ${formatCardCode(code)}. The public portal confirms it belongs to an active record.`
              : 'The code is incomplete, mistyped, or its check digit does not match.'}
          </span>
        </p>
      )}
    </Card>
  );
}
