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
  useToast,
  type Column,
} from '@kit';
import {
  CASE_OUTCOMES,
  ageNote,
  closeBlocker,
  orderCases,
  outcomeNote,
  reopenBlocker,
  reopenNote,
  tellsTheMember,
  visibleTimeline,
  type CaseDetail,
  type CaseRow,
} from './cases';

/**
 * The cases screen: the incidents that more than one report is about.
 *
 * The queue is the left of the screen and the case is the right. Reading a case
 * happens in place rather than in a modal, because a moderator reviewing an incident
 * wants the queue beside it — "is this the third one this week" is a question you
 * answer by looking, not by remembering.
 *
 * The timeline is append-only in the database, and this screen says so rather than
 * offering an edit that would be refused. A correction is a new note that says what
 * changed.
 */
export function Cases(): ReactElement {
  const env = useCorporateEnv();
  const { success, error: toastError } = useToast();
  const [status, setStatus] = useState('open');
  const [selected, setSelected] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');
  const [reopening, setReopening] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [noteDraft, setNoteDraft] = useState('');

  const loadQueue = useCallback(
    () => listRpc<CaseRow>(env, 'case_queue', { p_status: status, p_limit: 100 }),
    [env, status],
  );
  const queue = useAsync(loadQueue, [env, status]);

  const loadCase = useCallback(
    () => listRpc<CaseDetail>(env, 'admin_case', { p_case_id: selected ?? '' }),
    [env, selected],
  );
  const detail = useAsync(loadCase, [env, selected]);

  const openCase = detail.state.status === 'ready' ? detail.state.data[0] : undefined;

  const close = useCallback(async () => {
    if (!openCase) return;
    const blocker = closeBlocker(outcome, note);
    if (blocker) {
      toastError(blocker);
      return;
    }
    try {
      await callRpc(env, 'close_case', {
        p_case_id: openCase.id,
        p_outcome: outcome,
        p_outcome_message_key: outcome === 'no_action' ? '' : outcome,
        p_note: note.trim(),
      });
      success(
        tellsTheMember(outcome)
          ? 'Case closed. The member has been told, with your note.'
          : 'Case closed. Nothing is announced, because nothing was done.',
      );
      setClosing(false);
      setOutcome('');
      setNote('');
      queue.reload();
      detail.reload();
    } catch (cause) {
      toastError(cause instanceof Error ? cause.message : 'The case was not closed.');
    }
  }, [env, openCase, outcome, note, success, toastError, queue, detail]);

  const reopen = useCallback(async () => {
    if (!openCase) return;
    const blocker = reopenBlocker(openCase.status, reopenReason);
    if (blocker) {
      toastError(blocker);
      return;
    }
    try {
      await callRpc(env, 'reopen_case', {
        p_case_id: openCase.id,
        p_reason: reopenReason.trim(),
      });
      success('Case reopened. The outcome is cleared, because there is no outcome yet.');
      setReopening(false);
      setReopenReason('');
      queue.reload();
      detail.reload();
    } catch (cause) {
      toastError(cause instanceof Error ? cause.message : 'The case was not reopened.');
    }
  }, [env, openCase, reopenReason, success, toastError, queue, detail]);

  const addNote = useCallback(async () => {
    if (!openCase) return;
    if (noteDraft.trim().length < 2) {
      toastError('A note needs something in it.');
      return;
    }
    try {
      await callRpc(env, 'add_case_note', {
        p_case_id: openCase.id,
        p_body: noteDraft.trim(),
        p_kind: 'note',
        p_metadata: {},
      });
      success('Note added. It cannot be edited, so a correction is another note.');
      setNoteDraft('');
      detail.reload();
    } catch (cause) {
      toastError(cause instanceof Error ? cause.message : 'The note was not added.');
    }
  }, [env, openCase, noteDraft, success, toastError, detail]);

  return (
    <div className="kit-stack">
      <Banner tone="neutral" title="One incident, however many reports it took">
        <p className="kit-small">
          A case collects the reports that are about the same thing. The timeline cannot be edited or
          deleted — a correction is a new note that says what changed. A reopened case sits at the top
          of the queue, because it was closed and was wrong.
        </p>
        <div className="kit-row">
          {['open', 'pending', 'closed'].map((value) => (
            <Button
              key={value}
              size="small"
              variant={status === value ? 'primary' : 'quiet'}
              onClick={() => {
                setStatus(value);
                setSelected(null);
              }}
            >
              {value === 'open' ? 'Open' : value === 'pending' ? 'Waiting' : 'Closed'}
            </Button>
          ))}
          <Button size="small" variant="quiet" onClick={queue.reload}>
            Read again
          </Button>
        </div>
      </Banner>

      {queue.state.status === 'loading' && <Loading label="Reading the case queue." />}
      {queue.state.status === 'error' && (
        <Banner tone="bad" title="The queue could not be read">
          <p className="kit-small">{queue.state.message}</p>
          <p className="kit-small">
            This screen needs <code>moderation.read</code>.
          </p>
        </Banner>
      )}
      {queue.state.status === 'ready' && queue.state.data.length === 0 && (
        <Empty>
          <strong>
            {status === 'closed' ? 'No case has been closed yet.' : 'No case is waiting.'}
          </strong>{' '}
          {status === 'closed'
            ? 'A closed case keeps its timeline forever, so this fills up slowly and never empties.'
            : 'That is the state this screen wants to be in.'}
        </Empty>
      )}

      {queue.state.status === 'ready' && queue.state.data.length > 0 && (
        <Card
          title={`${String(queue.state.data.length)} case${queue.state.data.length === 1 ? '' : 's'}`}
          description="Reopened first, then the oldest. A reopened case was closed once and was wrong."
        >
          <DataTable<CaseRow>
            caption={`${status} cases`}
            columns={queueColumns()}
            rows={orderCases(queue.state.data)}
            rowKey={(row) => row.id}
            state={{ status: 'ready' }}
            selectedKey={selected ?? undefined}
            onRowClick={(row) => {
              setSelected(row.id);
            }}
            empty="No case in this queue."
          />
        </Card>
      )}

      {selected === null && (
        <Card title="Pick a case" description="The timeline and the reports appear here.">
          <p className="kit-small">Choose a row above to read the case.</p>
        </Card>
      )}

      {selected !== null && detail.state.status === 'loading' && <Loading label="Reading the case." />}
      {selected !== null && detail.state.status === 'error' && (
        <Banner tone="bad" title="The case could not be read">
          <p className="kit-small">{detail.state.message}</p>
        </Banner>
      )}
      {selected !== null && detail.state.status === 'ready' && openCase === undefined && (
        <Empty>
          <strong>That case is not readable.</strong> It may have been closed and removed, or it may
          not be yours to read.
        </Empty>
      )}

      {openCase !== undefined && (
        <>
          <Card
            title={`${openCase.subject_name || 'No named member'} · ${openCase.status}`}
            description={[
              outcomeNote(openCase.outcome),
              reopenNote(openCase.reopened_count),
              openCase.legal_hold ? 'under legal hold: do not delete' : '',
            ]
              .filter((part) => part !== '')
              .join(' · ')}
            actions={
              <div className="kit-row">
                {openCase.status !== 'closed' && (
                  <Button
                    size="small"
                    onClick={() => {
                      setClosing(true);
                    }}
                  >
                    Close with an outcome
                  </Button>
                )}
                {openCase.status === 'closed' && (
                  <Button
                    size="small"
                    variant="quiet"
                    onClick={() => {
                      setReopening(true);
                    }}
                  >
                    Reopen
                  </Button>
                )}
              </div>
            }
          >
            <dl className="kit-row">
              <div>
                <dt className="kit-small">Opened</dt>
                <dd>{openCase.opened_at.slice(0, 16).replace('T', ' ')}</dd>
              </div>
              <div>
                <dt className="kit-small">Closed</dt>
                <dd>
                  {openCase.closed_at === null
                    ? 'still open'
                    : openCase.closed_at.slice(0, 16).replace('T', ' ')}
                </dd>
              </div>
              <div>
                <dt className="kit-small">Reports</dt>
                <dd>{String(openCase.reports.length)}</dd>
              </div>
            </dl>

            <h3 className="kit-small">Reports joined to this case</h3>
            {openCase.reports.length === 0 ? (
              <p className="kit-small">
                No reports are joined yet. A case can start as a pattern before it has a single report.
              </p>
            ) : (
              <ul>
                {openCase.reports.map((report) => (
                  <li key={report.report_id}>
                    <strong>{report.reason}</strong>{' '}
                    <span className="kit-small">
                      · reported by {report.reporter_uid.slice(0, 8)} · {report.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {openCase.status !== 'closed' && (
            <Card
              title="Add a note"
              description="Notes cannot be edited afterwards. To correct one, write another saying what changed."
            >
              <Field label="Note" hint="What you saw, what you decided, or what you are waiting for.">
                <textarea
                  className="kit-input"
                  rows={3}
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                />
              </Field>
              <Button size="small" onClick={() => void addNote()}>
                Add note
              </Button>
            </Card>
          )}

          <Card title="Timeline" description="Newest first. An entry cannot be edited or removed.">
            <ol className="kit-stack">
              {visibleTimeline(openCase.events, true).map((event) => (
                <li key={event.id}>
                  <span className="kit-small">
                    {event.created_at.slice(0, 16).replace('T', ' ')} · {event.kind}
                    {event.actor_uid === null ? ' · the system' : ''}
                  </span>
                  {event.body === '' ? null : <p>{event.body}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={closing}
        level="reason"
        tone={outcome === 'account_banned' ? 'danger' : 'primary'}
        title="Close this case with an outcome"
        summary={
          tellsTheMember(outcome)
            ? 'The member is told the outcome, with your note. That cannot be taken back from here; reopening the case does not unsend a message.'
            : 'Nothing is announced, because this outcome means nothing was done.'
        }
        confirmLabel="Close the case"
        onCancel={() => {
          setClosing(false);
        }}
        onConfirm={(reason) => {
          setNote(reason);
          void close();
        }}
      />

      <ConfirmDialog
        open={reopening}
        level="reason"
        tone="primary"
        title="Reopen this closed case"
        summary="The outcome is cleared and the reopen count goes up. A case that keeps coming back is a case that was closed too early."
        confirmLabel="Reopen"
        onCancel={() => {
          setReopening(false);
        }}
        onConfirm={(reason) => {
          setReopenReason(reason);
          void reopen();
        }}
      />
    </div>
  );
}

function queueColumns(): readonly Column<CaseRow>[] {
  return [
    {
      key: 'who',
      header: 'Member',
      render: (row) => row.subject_name || 'unnamed',
      sortValue: (row) => row.subject_name,
    },
    {
      key: 'reports',
      header: 'Reports',
      render: (row) => String(row.reports),
      sortValue: (row) => row.reports,
      align: 'end',
    },
    {
      key: 'age',
      header: 'Open for',
      render: (row) => ageNote(row.age_hours),
      sortValue: (row) => row.age_hours,
      align: 'end',
    },
    {
      key: 'reopened',
      header: 'History',
      render: (row) => reopenNote(row.reopened_count),
      sortValue: (row) => row.reopened_count,
      hideBelow: 'md',
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => row.status,
      sortValue: (row) => row.status,
      hideBelow: 'md',
    },
  ];
}

export { CASE_OUTCOMES };
