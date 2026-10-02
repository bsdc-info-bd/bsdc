import { useCallback, useState, type ReactElement } from 'react';
import {
  ACTIONS,
  AppShell,
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
  decisionProblems,
  isOverdue,
  listRpc,
  messageOf,
  queueOrder,
  reasonLabel,
  severityOf,
  subjectLabel,
  subjectPath,
  targetHours,
  useAsync,
  useCorporateEnv,
  waitingLabel,
  type CorporateEnv,
  type ReportRow,
} from '@kit';
import {
  EMPTY_DECISION,
  STATUSES,
  byReason,
  corroboration,
  decisionArgs,
  repeatReporters,
  reportTitle,
  shiftSummary,
  statusLabel,
  statusTone,
  type Decision,
} from './model';

/**
 * The moderation panel.
 *
 * A queue, in the order the work should be done, with the decision and the
 * reason taken together — because the reason is published to the member and
 * a decision without one is indistinguishable from malice.
 */
export function App(): ReactElement {
  return (
    <AppShell
      minRole="moderator"
      note="Every decision here is recorded against your account, with its reason."
      tabs={[
        { id: 'queue', label: 'Queue', render: () => <Queue /> },
        { id: 'patterns', label: 'Patterns', render: () => <Patterns /> },
      ]}
    />
  );
}

async function loadQueue(env: CorporateEnv, status: string): Promise<readonly ReportRow[]> {
  return listRpc<ReportRow>(env, 'moderation_queue', { p_status: status, p_limit: 100 });
}

function Queue(): ReactElement {
  const env = useCorporateEnv();
  const [status, setStatus] = useState('open');
  const load = useCallback(() => loadQueue(env, status), [env, status]);
  const { state, reload } = useAsync(load, [env, status]);
  const [openId, setOpenId] = useState('');
  const [decision, setDecision] = useState<Decision>(EMPTY_DECISION);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const claim = (id: string): void => {
    setBusy(true);
    setError('');
    void (async () => {
      try {
        await callRpc<string>(env, 'claim_report', { p_report_id: id });
        setOpenId(id);
        setDecision(EMPTY_DECISION);
        reload();
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(false);
      }
    })();
  };

  const decide = (id: string): void => {
    setBusy(true);
    setError('');
    void (async () => {
      try {
        await callRpc<string>(env, 'resolve_report', decisionArgs(id, decision));
        setOpenId('');
        setDecision(EMPTY_DECISION);
        reload();
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(false);
      }
    })();
  };

  if (state.status === 'loading') return <Loading label="Loading the queue." />;
  if (state.status === 'error')
    return (
      <Banner tone="bad" title="The queue did not load">
        {state.message}
      </Banner>
    );

  const rows = queueOrder(state.data);
  const summary = shiftSummary(state.data);
  const problems = decisionProblems(decision.action, decision.reason);

  return (
    <div className="kit-stack">
      {error !== '' && (
        <Banner tone="bad" title="That decision was refused">
          {error}
        </Banner>
      )}

      <Banner
        tone={summary.severe > 0 ? 'bad' : summary.overdue > 0 ? 'warn' : 'ok'}
        title={summary.sentence}
      >
        <p className="kit-small" style={{ margin: 0 }}>
          Severe reports are promised an answer within the hour; the rest within a day or two. The
          queue is ordered by severity first and age last, so nothing serious waits behind a pile of
          spam.
        </p>
      </Banner>

      <Card
        title="Queue"
        description="Worst first, then overdue, then how many people reported it."
      >
        <Select
          label="Showing"
          value={status}
          options={STATUSES.map((option) => ({ value: option.value, label: option.label }))}
          onChange={(event) => setStatus(event.target.value)}
        />
        {rows.length === 0 ? (
          <Empty>Nothing is waiting. That is allowed to happen.</Empty>
        ) : (
          <Table
            caption="Reports"
            head={['Report', 'Waiting', 'Corroboration', 'State', 'Decision']}
          >
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{reportTitle(row)}</strong>
                  <br />
                  <span className="kit-small kit-muted">
                    {row.details === '' ? 'No further detail was given.' : row.details}
                  </span>
                  {subjectPath(row) !== '' && (
                    <>
                      <br />
                      <a
                        className="kit-mono kit-small"
                        href={`${env.siteUrl}${subjectPath(row)}`}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {subjectPath(row)}
                      </a>
                    </>
                  )}
                </td>
                <td>
                  <Badge tone={isOverdue(row) ? 'bad' : 'neutral'}>{waitingLabel(row)}</Badge>
                  <br />
                  <span className="kit-small kit-muted">
                    Target {targetHours(row)}h, severity {severityOf(row.reason)}
                  </span>
                </td>
                <td className="kit-small">{corroboration(row)}</td>
                <td>
                  <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                </td>
                <td>
                  {row.status !== 'open' && row.status !== 'claimed' ? (
                    <span className="kit-small kit-muted">
                      {row.resolution === '' ? 'Decided.' : row.resolution}
                    </span>
                  ) : openId === row.id ? (
                    <div className="kit-stack">
                      <Select
                        label="Decision"
                        value={decision.action}
                        options={ACTIONS.map((action) => ({
                          value: action.id,
                          label: action.label,
                        }))}
                        onChange={(event) =>
                          setDecision({ ...decision, action: event.target.value })
                        }
                      />
                      <TextArea
                        label="Reason"
                        rows={3}
                        value={decision.reason}
                        hint="The member is shown this, so write it to them."
                        error={problems[0] ?? ''}
                        onChange={(event) =>
                          setDecision({ ...decision, reason: event.target.value })
                        }
                      />
                      <div className="kit-row">
                        <Button
                          size="small"
                          disabled={busy || problems.length > 0}
                          onClick={() => decide(row.id)}
                        >
                          Record decision
                        </Button>
                        <Button size="small" variant="quiet" onClick={() => setOpenId('')}>
                          Not now
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="small" disabled={busy} onClick={() => claim(row.id)}>
                      {row.assigned_to === null ? 'Take it' : 'Open'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function Patterns(): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(() => loadQueue(env, 'open'), [env]);
  const { state } = useAsync(load, [env]);

  if (state.status === 'loading') return <Loading label="Reading the queue." />;
  if (state.status === 'error')
    return (
      <Banner tone="bad" title="The queue did not load">
        {state.message}
      </Banner>
    );

  const reasons = byReason(state.data);
  const repeats = repeatReporters(state.data);

  return (
    <div className="kit-stack">
      <Card
        title="What is being reported"
        description="A shift spent on one reason is a product problem, not a moderation problem."
      >
        {reasons.length === 0 ? (
          <Empty>Nothing is waiting.</Empty>
        ) : (
          <Table caption="Open reports by reason" head={['Reason', 'Waiting']}>
            {reasons.map((row) => (
              <tr key={row.reason}>
                <td>{row.reason}</td>
                <td>{row.count}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card
        title="Frequent reporters"
        description="Five or more open reports from one member. Sometimes diligence, sometimes a campaign — worth a human look either way."
      >
        {repeats.length === 0 ? (
          <Empty>No member has filed five or more of the reports now waiting.</Empty>
        ) : (
          <Table caption="Members with five or more open reports" head={['Member', 'Reports']}>
            {repeats.map((row) => (
              <tr key={row.uid}>
                <td className="kit-mono kit-small">{row.uid}</td>
                <td>{row.count}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Severity scale" description="The order the queue is worked in.">
        <Table caption="Reasons and their severity" head={['Reason', 'Severity', 'Answer within']}>
          {[
            'self_harm',
            'child_safety',
            'violence',
            'harassment',
            'malware',
            'scam',
            'spam',
            'off_topic',
          ].map((reason) => (
            <tr key={reason}>
              <td>{reasonLabel(reason)}</td>
              <td>{severityOf(reason)}</td>
              <td>
                {targetHours({
                  id: '',
                  subject_type: 'post',
                  subject_id: '',
                  reason,
                  details: '',
                  status: 'open',
                  reporter_uid: null,
                  assigned_to: null,
                  resolution: '',
                  report_count: 1,
                  created_at: new Date().toISOString(),
                })}
                h
              </td>
            </tr>
          ))}
        </Table>
        <p className="kit-small kit-muted">
          {subjectLabel('post')}, {subjectLabel('comment')}, {subjectLabel('profile')} and{' '}
          {subjectLabel('message')} reports share the same scale; what differs is where the subject
          is read.
        </p>
      </Card>
    </div>
  );
}
