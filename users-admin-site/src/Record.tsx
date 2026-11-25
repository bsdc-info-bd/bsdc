import { useCallback, useMemo, useState, type ReactElement } from 'react';
import {
  Badge,
  Banner,
  Button,
  Card,
  Empty,
  Loading,
  Select,
  Table,
  TextArea,
  callRpc,
  describeKind,
  families,
  familyLabel,
  familyOf,
  filterTimeline,
  ladderBlocker,
  listRpc,
  messageOf,
  needsAttention,
  openItemsSummary,
  orderLadder,
  orderTimeline,
  previewMessage,
  reliabilityIsMeaningful,
  reliabilityLabel,
  rungEffect,
  rungFor,
  signalSentence,
  signalWorthShowing,
  useAsync,
  useCorporateEnv,
  useProfile,
  type LadderRung,
  type OpenItems,
  type PersonSignal,
  type Reliability,
  type TimelineEvent,
} from '@kit';

/**
 * The person record.
 *
 * The question an escalation asks is never "who is this person". It is "what did
 * they do, what was done about it, and what is open right now" — so the record is
 * in that order: the open strip, then the timeline, then the ladder, then the
 * signals. Identity is the last thing anybody escalates about and the first thing
 * the old screen showed.
 *
 * Every read here is one RPC. The screen does not join, because a console that joins
 * is a console that can disagree with the database about what counts as open.
 */
export function Record({ uid }: { uid: string }): ReactElement {
  return (
    <div className="kit-stack">
      <OpenStrip uid={uid} />
      <Timeline uid={uid} />
      <Ladder uid={uid} />
      <Signals uid={uid} />
      <Reliability uid={uid} />
    </div>
  );
}

function OpenStrip({ uid }: { uid: string }): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(
    async () => (await listRpc<OpenItems>(env, 'person_open_items', { p_uid: uid }))[0] ?? null,
    [env, uid],
  );
  const { state } = useAsync(load, [env, uid]);

  if (state.status === 'loading') return <Loading label="Reading what is open." />;
  if (state.status === 'error') {
    return (
      <Banner tone="bad" title="The open items did not load">
        {state.message}
      </Banner>
    );
  }
  if (state.data === null) return <Empty>This account has no record.</Empty>;

  return (
    <Card
      title="What is open right now"
      description={openItemsSummary(state.data)}
      actions={
        <Badge tone={needsAttention(state.data) ? 'warn' : 'ok'}>
          {needsAttention(state.data) ? 'needs attention' : 'nothing outstanding'}
        </Badge>
      }
    >
      <div className="kit-grid">
        <Stat label="Open reports" value={state.data.open_reports} />
        <Stat label="Open cases" value={state.data.open_cases} />
        <Stat label="Open appeals" value={state.data.open_appeals} />
        <Stat
          label="Live standing"
          value={state.data.active_standing}
          note="The sum of unexpired ledger rows. Not a score the console keeps."
        />
        <Stat
          label="Account"
          value={state.data.is_suspended ? 'suspended' : 'active'}
          note={
            state.data.last_action_at === null
              ? 'Nothing has ever been done to this account.'
              : `Last action ${new Date(state.data.last_action_at).toLocaleString()}`
          }
        />
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note?: string;
}): ReactElement {
  return (
    <div>
      <p className="kit-small kit-muted" style={{ margin: 0 }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: '1.25rem' }}>{value}</p>
      {note !== undefined && (
        <p className="kit-small kit-muted" style={{ margin: 0 }}>
          {note}
        </p>
      )}
    </div>
  );
}

function Timeline({ uid }: { uid: string }): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(
    () => listRpc<TimelineEvent>(env, 'person_timeline_full', { p_uid: uid, p_limit: 300 }),
    [env, uid],
  );
  const { state } = useAsync(load, [env, uid]);
  const [chosen, setChosen] = useState<string[]>([]);

  const events = state.status === 'ready' ? orderTimeline(state.data) : [];
  const available = useMemo(() => families(events), [events]);
  const shown = filterTimeline(events, chosen);

  return (
    <Card
      title="Everything that has happened"
      description="Reports, actions, standing, appeals, cases, certificates and role changes, merged into one list in the order they happened."
    >
      {state.status === 'loading' ? <Loading label="Reading the history." /> : null}
      {state.status === 'error' ? (
        <Banner tone="bad" title="The history did not load">
          {state.message}
        </Banner>
      ) : null}
      {state.status === 'ready' && events.length === 0 ? (
        <Empty>Nothing has happened to this account yet.</Empty>
      ) : null}
      {events.length > 0 && (
        <div className="kit-stack">
          <div className="kit-row" role="group" aria-label="Filter by kind">
            <Button
              size="small"
              variant={chosen.length === 0 ? 'primary' : 'quiet'}
              onClick={() => setChosen([])}
            >
              Everything ({events.length})
            </Button>
            {available.map((family) => {
              const active = chosen.includes(family.key);
              const count = events.filter((event) => familyOf(event.kind) === family.key).length;
              return (
                <Button
                  key={family.key}
                  size="small"
                  variant={active ? 'primary' : 'quiet'}
                  title={family.explanation}
                  onClick={() =>
                    setChosen(active ? chosen.filter((key) => key !== family.key) : [...chosen, family.key])
                  }
                >
                  {familyLabel(family.key)} ({count})
                </Button>
              );
            })}
          </div>

          <Table caption={`${shown.length} events, newest first`} head={['When', 'What', 'Detail', '']}>
            {shown.map((event) => (
              <tr key={`${event.occurred_at}-${event.reference}-${event.kind}`}>
                <td className="kit-small kit-muted">{new Date(event.occurred_at).toLocaleString()}</td>
                <td>{describeKind(event.kind)}</td>
                <td className="kit-small">
                  {event.summary}
                  {event.detail !== '' && event.detail !== event.summary && (
                    <span className="kit-muted"> — {event.detail}</span>
                  )}
                </td>
                <td className="kit-mono kit-small kit-muted">{event.reference.slice(0, 8)}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Card>
  );
}

function Ladder({ uid }: { uid: string }): ReactElement {
  const env = useCorporateEnv();
  const profile = useProfile();
  const ladderLoad = useCallback(() => listRpc<LadderRung>(env, 'warning_ladder', {}), [env]);
  const { state } = useAsync(ladderLoad, [env]);

  const [severity, setSeverity] = useState('normal');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const rungs = state.status === 'ready' ? orderLadder(state.data) : [];
  const rung = rungFor(rungs, severity);
  const blocker = ladderBlocker(rung, reason, profile?.uid ?? '', uid);

  const take = (): void => {
    if (rung === null) return;
    setBusy(true);
    setError('');
    setDone('');
    void (async () => {
      try {
        await callRpc(env, 'apply_warning_ladder', {
          p_uid: uid,
          p_severity: severity,
          p_reason: reason.trim(),
        });
        setDone(`The ${rung.rung} was taken and the member was told.`);
        setReason('');
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <Card
      title="The warning ladder"
      description="Each severity reaches a different rung. Taking a step records the action, moves the standing ledger, and tells the member what the next step would be — in one call, so none of the three can happen without the others."
    >
      {state.status === 'loading' ? <Loading label="Reading the ladder." /> : null}
      {state.status === 'error' ? (
        <Banner tone="bad" title="The ladder did not load">
          {state.message}
        </Banner>
      ) : null}
      {rungs.length > 0 && (
        <div className="kit-stack">
          <Table
            caption="What each severity does, and what comes after it"
            head={['Severity', 'Rung', 'Effect', 'Next step']}
          >
            {rungs.map((row) => (
              <tr key={row.severity}>
                <td>
                  <Badge
                    tone={
                      row.severity === 'critical'
                        ? 'bad'
                        : row.severity === 'high'
                          ? 'warn'
                          : row.severity === 'normal'
                            ? 'neutral'
                            : 'ok'
                    }
                  >
                    {row.severity}
                  </Badge>
                </td>
                <td>{row.rung}</td>
                <td className="kit-small">{rungEffect(row)}</td>
                <td className="kit-small kit-muted">{row.next_rung ?? 'nothing further'}</td>
              </tr>
            ))}
          </Table>

          <div className="kit-grid">
            <Select
              label="Take which step"
              value={severity}
              options={rungs.map((row) => ({
                value: row.severity,
                label: `${row.severity} — ${row.rung}`,
              }))}
              onChange={(event) => setSeverity(event.target.value)}
            />
            <TextArea
              label="Why"
              rows={3}
              value={reason}
              hint="The member reads this. Twelve characters at least."
              onChange={(event) => setReason(event.target.value)}
            />
          </div>

          {rung !== null && (
            <Banner tone="neutral" title="This is what the member will be told">
              {previewMessage(rung)}
            </Banner>
          )}

          {error !== '' && (
            <Banner tone="bad" title="That step was refused">
              {error}
            </Banner>
          )}
          {done !== '' && (
            <Banner tone="ok" title="Step taken">
              {done}
            </Banner>
          )}

          {blocker !== null && reason !== '' && (
            <p className="kit-small kit-muted" style={{ margin: 0 }}>
              {blocker}
            </p>
          )}

          <Button onClick={take} disabled={busy || blocker !== null}>
            {busy ? 'Taking the step' : 'Take this step'}
          </Button>
        </div>
      )}
    </Card>
  );
}

function Signals({ uid }: { uid: string }): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(() => listRpc<PersonSignal>(env, 'person_signals', { p_uid: uid }), [env, uid]);
  const { state } = useAsync(load, [env, uid]);

  const shown = state.status === 'ready' ? state.data.filter(signalWorthShowing) : [];

  return (
    <Card
      title="Accounts that might be the same operator"
      description="Linked by a device they signed in from or a payment instrument they used — never by a display name, because a name is not identity."
    >
      {state.status === 'loading' ? <Loading label="Reading the signals." /> : null}
      {state.status === 'error' ? (
        <Banner tone="bad" title="The signals did not load">
          {state.message}
        </Banner>
      ) : null}
      {state.status === 'ready' && shown.length === 0 ? (
        <Empty>
          Nothing connects this account to another. A device nobody else used and an instrument
          nobody else paid with are not signals, so they are not shown.
        </Empty>
      ) : null}
      {shown.length > 0 && (
        <ul className="kit-list">
          {shown.map((signal) => (
            <li key={`${signal.signal}-${signal.value_hash}`}>
              {signalSentence(signal)}{' '}
              <span className="kit-small kit-muted">
                seen {new Date(signal.first_seen).toLocaleDateString()} –{' '}
                {new Date(signal.last_seen).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Reliability({ uid }: { uid: string }): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(
    async () => (await listRpc<Reliability>(env, 'reporter_reliability', { p_uid: uid }))[0] ?? null,
    [env, uid],
  );
  const { state } = useAsync(load, [env, uid]);

  if (state.status === 'loading') return <Loading label="Reading their reporting history." />;
  if (state.status === 'error') return <></>;
  if (state.data === null) return <></>;

  return (
    <Card
      title="How reliable a reporter they are"
      description="Derived from how often their reports were upheld. Never stored, because a stored score is one somebody will argue with and nobody can explain."
    >
      <p style={{ margin: 0 }}>{reliabilityLabel(state.data)}</p>
      {!reliabilityIsMeaningful(state.data) && (
        <p className="kit-small kit-muted" style={{ margin: 0 }}>
          Too few decisions to read anything into this yet.
        </p>
      )}
    </Card>
  );
}
