import { useCallback, useState, type ReactElement } from 'react';
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Empty,
  Field,
  Loading,
  callRpc,
  listRpc,
  useAsync,
  useCorporateEnv,
  useProfile,
  useToast,
  type Column,
} from '@kit';
import {
  countryNote,
  endAction,
  flagSummary,
  idleNote,
  orderSessions,
  type StaffSessionRow,
} from './authority';

/**
 * The sessions screen: who is signed in, from where, and does anything look wrong.
 *
 * The flags this screen shows are deliberately narrow, and the wording is chosen
 * to match. Two origins for one account inside ninety minutes is *reported as a
 * pair*, never as an accusation — a phone switching from wi-fi to mobile data and
 * a person actually travelling look identical from here, and a security screen
 * that accuses the wrong colleague is worse than no screen.
 *
 * Ending your own session is a sign-out. Ending somebody else's is a revocation,
 * and the button says which.
 */
export function Sessions(): ReactElement {
  const env = useCorporateEnv();
  const profile = useProfile();
  const { success, error: toastError, note } = useToast();
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [pending, setPending] = useState<StaffSessionRow | null>(null);
  const [targetUid, setTargetUid] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(
    () =>
      listRpc<StaffSessionRow>(env, 'admin_staff_sessions', {
        p_limit: 200,
        p_only_flagged: flaggedOnly,
      }),
    [env, flaggedOnly],
  );
  const { state, reload } = useAsync(load, [env, flaggedOnly]);

  const endOne = useCallback(
    async (session: StaffSessionRow) => {
      try {
        await callRpc(env, 'end_staff_session', {
          p_session_id: session.id,
          p_reason: endAction(session, profile?.uid ?? '') === 'sign-out' ? 'sign-out' : 'revoked',
        });
        success(
          endAction(session, profile?.uid ?? '') === 'sign-out'
            ? 'Signed out of that device.'
            : `Ended ${session.display_name}'s session on ${session.device_label ?? 'that device'}.`,
        );
        setPending(null);
        reload();
      } catch (cause) {
        toastError(cause instanceof Error ? cause.message : 'The session was not ended.');
      }
    },
    [env, profile, success, toastError, reload],
  );

  const revokeAll = useCallback(async () => {
    const uid = targetUid.trim();
    if (!uid) {
      toastError('Enter the account whose sessions you want to end.');
      return;
    }
    try {
      const ended = await callRpc<number>(env, 'end_all_staff_sessions', { p_uid: uid });
      success(`Ended ${String(ended)} session${ended === 1 ? '' : 's'}.`);
      setTargetUid('');
      setReason('');
      reload();
    } catch (cause) {
      toastError(cause instanceof Error ? cause.message : 'The sessions were not ended.');
    }
  }, [env, targetUid, success, toastError, reload]);

  return (
    <div className="kit-stack">
      <Banner tone="neutral" title="Every live console session">
        <p className="kit-small">
          A flag here is a question, not a verdict. Two origins for one account inside ninety minutes
          looks exactly like a phone switching from wi-fi to mobile data, so the screen reports the
          pair and leaves the judgement to a person who knows the account.
        </p>
        <div className="kit-row">
          <Button size="small" variant="quiet" onClick={reload}>
            Read again
          </Button>
          <Button
            size="small"
            variant="quiet"
            onClick={() => {
              setFlaggedOnly(!flaggedOnly);
              note(flaggedOnly ? 'Showing every session.' : 'Showing only flagged sessions.');
            }}
          >
            {flaggedOnly ? 'Show all sessions' : 'Show only flagged'}
          </Button>
        </div>
      </Banner>

      {state.status === 'loading' && <Loading label="Reading live sessions." />}
      {state.status === 'error' && (
        <Banner tone="bad" title="Sessions could not be read">
          <p className="kit-small">{state.message}</p>
          <p className="kit-small">
            This screen needs <code>people.read</code>. A refusal is the database explaining itself,
            not a fault in the console.
          </p>
        </Banner>
      )}
      {state.status === 'ready' && state.data.length === 0 && (
        <Empty>
          <strong>{flaggedOnly ? 'Nothing is flagged.' : 'Nobody is signed in to a console.'}</strong>{' '}
          {flaggedOnly
            ? 'That is the state this screen wants to be in.'
            : 'Sessions appear here the moment somebody opens a console.'}
        </Empty>
      )}

      {state.status === 'ready' && state.data.length > 0 && (
        <Card
          title={`${String(state.data.length)} live session${state.data.length === 1 ? '' : 's'}`}
          description="Flagged first, then the idlest — an abandoned console is more interesting than a busy one."
        >
          <DataTable<StaffSessionRow>
            caption="Live console sessions"
            columns={columnsFor(profile?.uid ?? '', (session) => {
              setPending(session);
            })}
            rows={orderSessions(state.data)}
            rowKey={(session) => session.id}
            state={{ status: 'ready' }}
          />
        </Card>
      )}

      <Card
        title="Sign an account out everywhere"
        description="For a lost laptop or a colleague leaving. This cannot be undone from here; the person signs in again."
      >
        <div className="kit-row">
          <Field label="Account uid" hint="Every live session for this account is ended.">
            <input
              className="kit-input"
              value={targetUid}
              placeholder="00000000-0000-4000-8000-000000000000"
              onChange={(event) => setTargetUid(event.target.value)}
            />
          </Field>
          <Field label="Reason" hint="Recorded in the audit trail against each session.">
            <input
              className="kit-input"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <Button
            size="small"
            onClick={() => {
              if (reason.trim().length < 12) {
                toastError(
                  'A reason of at least twelve characters is required. This is a change to somebody else’s access.',
                );
                return;
              }
              void revokeAll();
            }}
          >
            End every session
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={pending !== null}
        level="confirm"
        tone={pending && endAction(pending, profile?.uid ?? '') === 'revoke' ? 'danger' : 'primary'}
        title={
          pending === null
            ? ''
            : endAction(pending, profile?.uid ?? '') === 'sign-out'
              ? 'Sign out of this device?'
              : `End ${pending.display_name}'s session?`
        }
        summary={
          pending === null
            ? ''
            : endAction(pending, profile?.uid ?? '') === 'sign-out'
              ? 'This ends the session on that device. You stay signed in here.'
              : 'The person is signed out of that device. They can sign in again; nothing about their account changes.'
        }
        confirmLabel={
          pending && endAction(pending, profile?.uid ?? '') === 'revoke' ? 'End session' : 'Sign out'
        }
        onCancel={() => {
          setPending(null);
        }}
        onConfirm={() => {
          if (pending) void endOne(pending);
        }}
      />
    </div>
  );
}

function columnsFor(
  currentUid: string,
  onEnd: (session: StaffSessionRow) => void,
): readonly Column<StaffSessionRow>[] {
  return [
    {
      key: 'who',
      header: 'Account',
      render: (row) => (
        <span>
          {row.display_name}
          {row.uid === currentUid ? <em className="kit-small"> (you)</em> : null}
        </span>
      ),
      sortValue: (row) => row.display_name,
    },
    {
      key: 'device',
      header: 'Device',
      render: (row) => row.device_label ?? 'unnamed device',
      sortValue: (row) => row.device_label ?? '',
    },
    {
      key: 'origin',
      header: 'From',
      render: (row) => countryNote(row),
      sortValue: (row) => row.country ?? '',
    },
    {
      key: 'idle',
      header: 'Idle',
      render: (row) => idleNote(row.idle_minutes),
      sortValue: (row) => row.idle_minutes,
      align: 'end',
    },
    {
      key: 'role',
      header: 'Role',
      render: (row) =>
        row.role_at_start === row.role_now
          ? row.role_now
          : `${row.role_at_start} → ${row.role_now}`,
      sortValue: (row) => row.role_now,
      hideBelow: 'md',
    },
    {
      key: 'flag',
      header: 'Flag',
      render: (row) => (row.is_flagged ? flagSummary(row) : '—'),
      sortValue: (row) => (row.is_flagged ? 0 : 1),
      hideBelow: 'md',
    },
    {
      key: 'end',
      header: 'End',
      render: (row) => (
        <Button
          size="small"
          variant="quiet"
          onClick={() => {
            onEnd(row);
          }}
        >
          {endAction(row, currentUid) === 'sign-out' ? 'Sign out' : 'End'}
        </Button>
      ),
    },
  ];
}
