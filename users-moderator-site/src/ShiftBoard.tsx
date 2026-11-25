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
  TextArea,
  callRpc,
  handoverDue,
  handoverFor,
  listRpc,
  messageOf,
  orderShifts,
  shiftSentence,
  uncoveredShifts,
  useAsync,
  useCorporateEnv,
  type ShiftBoardRow,
} from '@kit';

/**
 * The shift board.
 *
 * A shift console answers three questions when somebody sits down at 04:00: who is
 * on with me, what is open, and what did the shift before this one leave for me. The
 * third is the one that costs money when it is missing — the plan calls context lost
 * at a changeover the single most expensive failure in a 24-hour operation — so the
 * handover is at the top of the screen rather than at the bottom of a note field.
 */
export function ShiftBoard(): ReactElement {
  const env = useCorporateEnv();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const load = useCallback(
    async () => orderShifts(await listRpc<ShiftBoardRow>(env, 'shift_board', { p_date: date })),
    [env, date],
  );
  const { state, reload } = useAsync(load, [env, date]);

  const uncovered = state.status === 'ready' ? uncoveredShifts(state.data) : [];
  const due = state.status === 'ready' ? state.data.filter((row) => handoverDue(row, new Date())) : [];

  return (
    <div className="kit-stack">
      <Card
        title="Which day are you looking at"
        description="A shift belongs to a local calendar day, not to a moment, because the roster does not move when a server is in another time zone."
        actions={
          <Button size="small" variant="quiet" onClick={reload}>
            Refresh
          </Button>
        }
      >
        <div className="kit-row">
          <Field
            label="Date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
      </Card>

      {state.status === 'loading' ? <Loading label="Loading the board." /> : null}
      {state.status === 'error' ? (
        <Banner tone="bad" title="The board did not load">
          {state.message}
        </Banner>
      ) : null}

      {uncovered.length > 0 ? (
        <Banner tone="bad" title="A shift has nobody on it">
          {uncovered.map((row) => row.shift_name).join(', ')} {uncovered.length === 1 ? 'has' : 'have'}{' '}
          no assignment. A roster exists to make this visible before the shift starts rather than
          after.
        </Banner>
      ) : null}

      {due.length > 0 ? (
        <Banner tone="warn" title="A handover is due">
          {due.map((row) => row.shift_name).join(', ')} {due.length === 1 ? 'has' : 'have'} started and
          nobody has written a handover. The next shift reads that note first.
        </Banner>
      ) : null}

      {state.status === 'ready' && state.data.length === 0 ? (
        <Empty>
          Nothing is rostered for {date}. Assign somebody below, or move to a day that has a board.
        </Empty>
      ) : null}

      {state.status === 'ready' && state.data.length > 0 ? (
        <div className="kit-grid">
          {state.data.map((row) => (
            <ShiftCard key={row.shift_id} row={row} onChanged={reload} />
          ))}
        </div>
      ) : null}

      <AssignShift date={date} onAssigned={reload} />
    </div>
  );
}

function ShiftCard({ row, onChanged }: { row: ShiftBoardRow; onChanged: () => void }): ReactElement {
  const env = useCorporateEnv();
  const [note, setNote] = useState(row.handover);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const handover = handoverFor(row);
  const blocker = note.trim().length < 10 ? 'A handover needs at least ten characters.' : null;

  const write = (): void => {
    setBusy(true);
    setError('');
    setDone('');
    void (async () => {
      try {
        await callRpc(env, 'write_handover', { p_shift_id: row.shift_id, p_note: note.trim() });
        setDone('The handover is saved. The next shift will read it first.');
        onChanged();
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <Card
      title={row.shift_name}
      description={shiftSentence(row)}
      actions={
        <Badge tone={row.headcount === 0 ? 'bad' : row.breached > 0 ? 'warn' : 'ok'}>
          {row.headcount === 0 ? 'uncovered' : row.breached > 0 ? `${row.breached} late` : 'covered'}
        </Badge>
      }
    >
      <div className="kit-stack">
        {handover.note !== null ? (
          <Banner tone="neutral" title="Handover">
            <p className="kit-small" style={{ margin: 0 }}>
              {handover.note}
            </p>
            <p className="kit-small kit-muted" style={{ margin: 0 }}>
              {handover.reason}
            </p>
          </Banner>
        ) : (
          <p className="kit-small kit-muted" style={{ margin: 0 }}>
            {handover.reason}
          </p>
        )}

        <TextArea
          label="Handover note"
          rows={3}
          value={note}
          hint="What is open, and what the next shift needs to know. They read this first."
          onChange={(event) => setNote(event.target.value)}
        />

        {error !== '' ? <div className="kit-error kit-small">{error}</div> : null}
        {done !== '' ? (
          <Banner tone="ok" title="Saved">
            {done}
          </Banner>
        ) : null}

        <div className="kit-row">
          <Button size="small" onClick={write} disabled={busy || blocker !== null}>
            {busy ? 'Saving' : 'Save handover'}
          </Button>
        </div>
        {blocker !== null && note !== '' ? (
          <p className="kit-small kit-muted" style={{ margin: 0 }}>
            {blocker}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function AssignShift({ date, onAssigned }: { date: string; onAssigned: () => void }): ReactElement {
  const env = useCorporateEnv();
  const [shiftName, setShiftName] = useState('general');
  const [uid, setUid] = useState('');
  const [role, setRole] = useState('cover');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const assign = (): void => {
    setBusy(true);
    setError('');
    setDone('');
    void (async () => {
      try {
        await callRpc(env, 'assign_shift', {
          p_shift_name: shiftName,
          p_on_date: date,
          p_uid: uid.trim(),
          p_role: role,
        });
        setDone('Assigned.');
        setUid('');
        onAssigned();
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <Card
      title="Assign somebody"
      description="One person on a night shift is a real situation at 04:00 and stays expressible; the board shows it rather than refusing it."
    >
      <div className="kit-grid">
        <Select
          label="Shift"
          value={shiftName}
          options={[
            { value: 'general', label: 'General' },
            { value: 'morning', label: 'Morning' },
            { value: 'evening', label: 'Evening' },
            { value: 'night', label: 'Night' },
          ]}
          onChange={(event) => setShiftName(event.target.value)}
        />
        <Field
          label="Account uid"
          value={uid}
          hint="The person's uid, from the directory above."
          onChange={(event) => setUid(event.target.value)}
        />
        <Select
          label="Role on the shift"
          value={role}
          options={[
            { value: 'lead', label: 'Lead' },
            { value: 'cover', label: 'Cover' },
            { value: 'on_call', label: 'On call' },
          ]}
          onChange={(event) => setRole(event.target.value)}
        />
      </div>
      {error !== '' ? <div className="kit-error kit-small">{error}</div> : null}
      {done !== '' ? <p className="kit-small">{done}</p> : null}
      <Button onClick={assign} disabled={busy || uid.trim() === ''}>
        {busy ? 'Assigning' : 'Assign'}
      </Button>
    </Card>
  );
}
