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
  getDb,
  listRpc,
  messageOf,
  rowsToCsv,
  toDataError,
  useAsync,
  useCorporateEnv,
  type CorporateEnv,
  type IpRule,
  type IpRuleKind,
} from '@kit';
import {
  blastRadius,
  expiringSoon,
  lifetime,
  ruleHealth,
  ruleProblems,
  saveSummary,
  summariseDryRun,
  toRule,
  verdictOf,
  windowNote,
  type ActivityRow,
  type DryRunRow,
  type RuleRowV2,
  type SimulatedStep,
} from './model';

/**
 * IP intelligence. The console evaluates a candidate address against the
 * rules in the browser so an operator can see the effect of a rule before
 * saving it; the database makes the real decision for every other app.
 */
export function App(): ReactElement {
  return (
    <AppShell
      minRole="moderator"
      note="Blocking a range affects every member behind it."
      tabs={[
        { id: 'rules', label: 'Rules', render: () => <Rules /> },
        { id: 'activity', label: 'Activity', render: () => <Activity /> },
        { id: 'trace', label: 'Trace a request', render: () => <Tracer /> },
      ]}
    />
  );
}

/**
 * The rules, with the fields 0148 added.
 *
 * `label`, `review_at`, `shadow` and `match_count` are what make the list readable:
 * without them every rule looks equally permanent, equally armed and equally used.
 */
async function loadRules(env: CorporateEnv): Promise<readonly RuleRowV2[]> {
  const { data, error } = await getDb(env)
    .from('ip_rules')
    .select(
      'id, range, kind, reason, expires_at, created_by, created_at, label, review_at, shadow, match_count, last_matched_at, disabled_at, disabled_reason',
    )
    .is('disabled_at', null)
    .order('created_at', { ascending: false });
  if (error) throw toDataError(error);
  return (data ?? []) as RuleRowV2[];
}

function Rules(): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(() => loadRules(env), [env]);
  const { state, reload } = useAsync(load, [env]);

  if (state.status === 'loading') return <Loading label="Loading rules." />;
  if (state.status === 'error')
    return (
      <Banner tone="bad" title="Rules did not load">
        {state.message}
      </Banner>
    );

  const soon = expiringSoon(state.data.map(toRule));
  const reviews = state.data
    .map((row) => ({ row, health: ruleHealth(row) }))
    .filter((entry) => entry.health.reviewOverdue || entry.health.idle || entry.health.shadow);

  return (
    <div className="kit-stack">
      <NewRule onSaved={reload} />
      <Simulator />
      {reviews.length > 0 && (
        <Banner tone="warn" title={`${String(reviews.length)} rule(s) want attention`}>
          <ul className="kit-small">
            {reviews.map((entry) => (
              <li key={entry.row.id}>
                <span className="kit-mono">{entry.row.range}</span>
                {entry.row.label === undefined || entry.row.label === '' ? '' : ` (${entry.row.label})`}
                {' — '}
                {entry.health.summary}
              </li>
            ))}
          </ul>
        </Banner>
      )}
      {soon.length > 0 && (
        <Banner
          tone="warn"
          title={`${soon.length} rule${soon.length === 1 ? '' : 's'} will expire`}
        >
          <p className="kit-small">
            Next: <span className="kit-mono">{soon[0]?.cidr}</span>, {lifetime(soon[0] as IpRule)}.
          </p>
        </Banner>
      )}
      {state.data.length === 0 ? (
        <Empty>No rules are in force. Every address is allowed.</Empty>
      ) : (
        <Card
          title={`Rules in force (${state.data.length})`}
          description="The most specific matching range decides."
          actions={
            <Button
              size="small"
              variant="quiet"
              onClick={() => {
                const csv = rowsToCsv(
                  ['range', 'kind', 'label', 'reason', 'shadow', 'review_at', 'expires_at', 'match_count'],
                  state.data.map((r) => [
                    r.range,
                    r.kind,
                    r.label ?? '',
                    r.reason,
                    r.shadow === true ? 'shadow' : 'armed',
                    r.review_at ?? '',
                    r.expires_at ?? '',
                    String(r.match_count ?? 0),
                  ]),
                );
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'bsdc-ip-rules.csv';
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
              }}
            >
              Export CSV
            </Button>
          }
        >
          <Table
            caption="Newest first. A rule in shadow mode blocks nobody; a rule past its review needs a decision."
            head={['Range', 'Kind', 'Label', 'Reason', 'State', 'Lifetime', 'Remove']}
          >
            {state.data.map((row) => {
              const rule = toRule(row);
              const health = ruleHealth(row);
              return (
                <tr key={row.id}>
                  <td className="kit-mono kit-small">{row.range}</td>
                  <td>
                    <Badge
                      tone={row.kind === 'block' ? 'bad' : row.kind === 'allow' ? 'ok' : 'warn'}
                    >
                      {row.kind}
                    </Badge>
                  </td>
                  <td className="kit-small">{row.label ?? ''}</td>
                  <td className="kit-small">
                    {row.reason === '' ? 'No reason recorded' : row.reason}
                  </td>
                  <td className="kit-small">
                    {health.reviewOverdue && <Badge tone="bad">review overdue</Badge>}
                    {health.shadow && <Badge tone="warn">shadow</Badge>}
                    {health.idle && !health.shadow && <Badge tone="warn">never matched</Badge>}
                    {!health.reviewOverdue && !health.shadow && !health.idle && (
                      <span className="kit-muted">
                        {row.match_count ?? 0} matched
                      </span>
                    )}
                  </td>
                  <td className="kit-small">{lifetime(rule)}</td>
                  <td>
                    <RemoveRule id={row.id} onRemoved={reload} />
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}
    </div>
  );
}

function RemoveRule({ id, onRemoved }: { id: string; onRemoved: () => void }): ReactElement {
  const env = useCorporateEnv();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="small"
      variant="quiet"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        callRpc(env, 'drop_ip_rule', { p_id: id })
          .then(onRemoved)
          .catch(() => undefined)
          .finally(() => {
            setBusy(false);
          });
      }}
    >
      Remove
    </Button>
  );
}

function NewRule({ onSaved }: { onSaved: () => void }): ReactElement {
  const env = useCorporateEnv();
  const [range, setRange] = useState('');
  const [kind, setKind] = useState<IpRuleKind>('block');
  const [reason, setReason] = useState('');
  const [label, setLabel] = useState('');
  const [reviewAt, setReviewAt] = useState('');
  const [shadow, setShadow] = useState(true);
  const [days, setDays] = useState('7');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const radius = blastRadius(range);
  const problems = ruleProblems(
    { cidr: radius.canonical, reason, label, kind, reviewAt },
    new Date(),
  );

  // §12.3's dry run: what would this rule have changed. Read only when the range is
  // valid, because a dry run against nothing is a round trip that answers a question
  // nobody asked.
  const dryState = useAsync(
    useCallback(async () => {
      if (!radius.valid) return [] as readonly DryRunRow[];
      return listRpc<DryRunRow>(env, 'ip_dry_run', {
        p_range: radius.canonical,
        p_kind: kind,
        p_days: Number(days) || 7,
        p_limit: 20,
      });
    }, [env, radius.valid, radius.canonical, kind, days]),
    [env, radius.valid, radius.canonical, kind, days],
  );
  const dry = dryState.state.status === 'ready' ? summariseDryRun(dryState.state.data) : null;

  const save = (): void => {
    if (problems.length > 0) {
      setError(problems[0] ?? 'Complete the rule first.');
      return;
    }
    setBusy(true);
    setError('');
    callRpc(env, 'save_ip_rule', {
      p_range: radius.canonical,
      p_kind: kind,
      p_reason: reason.trim(),
      p_label: label.trim(),
      p_review_at: reviewAt === '' ? null : new Date(reviewAt).toISOString(),
      p_hours: null,
      p_shadow: shadow,
    })
      .then(() => {
        setRange('');
        setReason('');
        setLabel('');
        setReviewAt('');
        onSaved();
      })
      .catch((cause: unknown) => {
        setError(messageOf(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <Card
      title="New rule"
      description="A block needs a reason, a label and a review date. A rule that proves itself in shadow mode first is a rule that does not take out a payment callback."
    >
      {error !== '' && (
        <Banner tone="bad" title="The rule was not saved">
          {error}
        </Banner>
      )}
      <div className="kit-grid">
        <Field
          label="Address or range"
          hint={
            radius.valid
              ? `${radius.canonical} covers ${radius.addresses.toLocaleString('en-GB')} address${radius.addresses === 1 ? '' : 'es'}`
              : ''
          }
          error={range !== '' && !radius.valid ? radius.warning : undefined}
          placeholder="203.0.113.7 or 203.0.113.0/24"
          value={range}
          onChange={(event) => {
            setRange(event.target.value);
          }}
        />
        <Select
          label="Kind"
          hint="Allow beats block at the same specificity."
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as IpRuleKind);
          }}
          options={[
            { value: 'block', label: 'Block' },
            { value: 'allow', label: 'Allow' },
            { value: 'watch', label: 'Watch only' },
          ]}
        />
        <Field
          label="Label"
          hint="Two words, so a list of rules is readable at a glance."
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
          }}
        />
        <Field
          label="Reason"
          hint="At least ten characters. An unexplained block is a block nobody dares remove."
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
        <Field
          label="Review on"
          type="date"
          hint="Mandatory for a block. Left empty, it defaults to thirty days."
          value={reviewAt}
          onChange={(event) => {
            setReviewAt(event.target.value);
          }}
        />
        <Select
          label="Arm it now, or watch first?"
          hint="Shadow mode blocks nobody and records what it would have done."
          value={shadow ? 'shadow' : 'armed'}
          onChange={(event) => {
            setShadow(event.target.value === 'shadow');
          }}
          options={[
            { value: 'shadow', label: 'Shadow — report only' },
            { value: 'armed', label: 'Arm immediately' },
          ]}
        />
      </div>
      {radius.valid && radius.warning !== '' && (
        <p className="kit-hint" style={{ marginTop: 'var(--sp-2)' }}>
          {radius.warning}
        </p>
      )}

      {radius.valid && (
        <div className="kit-stack" style={{ marginTop: 'var(--sp-3)' }}>
          <div className="kit-row">
            <Field
              label="Evidence window (days)"
              inputMode="numeric"
              value={days}
              onChange={(event) => {
                setDays(event.target.value);
              }}
            />
          </div>
          {dryState.state.status === 'loading' && <Loading label="Reading the last week of edge decisions." />}
          {dryState.state.status === 'error' && (
            <Banner tone="bad" title="The dry run failed">
              {dryState.state.message}
            </Banner>
          )}
          {dry !== null && (
            <Banner tone={dry.affected === 0 ? 'neutral' : 'warn'} title="Dry run against recorded history">
              <p className="kit-small">{dry.sentence}</p>
              {dry.actions.length > 0 && (
                <p className="kit-small kit-mono">Actions affected: {dry.actions.join(', ')}</p>
              )}
              <p className="kit-small kit-muted">{windowNote(Number(days) || 7, dryState.state.status === 'ready' ? dryState.state.data : [])}</p>
            </Banner>
          )}
          <p className="kit-small kit-muted">{saveSummary(shadow, reviewAt, dry)}</p>
        </div>
      )}

      <div className="kit-row" style={{ marginTop: 'var(--sp-3)' }}>
        <Button disabled={busy || !radius.valid || problems.length > 0} onClick={save}>
          {busy ? 'Saving' : shadow ? 'Create in shadow mode' : 'Arm the rule'}
        </Button>
        {problems.length > 0 && <span className="kit-hint">{problems[0]}</span>}
      </div>
    </Card>
  );
}

/**
 * §12.3's simulator, backed by the function that makes the real decision.
 *
 * The previous version evaluated the rules in the browser. That is a second
 * implementation of the ordering, and a simulator that disagrees with production is
 * worse than no simulator: it turns a five-minute investigation into a wrong answer
 * delivered quickly. `ip_simulate` uses the same order as `ip_decision`, and this
 * screen shows its working.
 */
function Simulator(): ReactElement {
  const env = useCorporateEnv();
  const [ip, setIp] = useState('');
  const trimmed = ip.trim();

  const state = useAsync(
    useCallback(async () => {
      if (trimmed === '') return [] as readonly SimulatedStep[];
      return listRpc<SimulatedStep>(env, 'ip_simulate', { p_ip: trimmed });
    }, [env, trimmed]),
    [env, trimmed],
  );

  const steps = state.state.status === 'ready' ? state.state.data : [];
  const verdict = steps.length > 0 ? verdictOf(steps) : null;

  return (
    <Card
      title="Why did this address match?"
      description="Evaluated by the same function that decides for every app, in the same order, naming the rule that decided."
    >
      <div className="kit-grid">
        <Field
          label="Address"
          placeholder="203.0.113.7"
          value={ip}
          onChange={(event) => {
            setIp(event.target.value);
          }}
        />
      </div>

      {trimmed !== '' && state.state.status === 'loading' && (
        <Loading label="Evaluating the rule list." />
      )}
      {state.state.status === 'error' && (
        <Banner tone="bad" title="The simulation failed">
          {state.state.message}
        </Banner>
      )}

      {verdict !== null && (
        <div className="kit-stack" style={{ marginTop: 'var(--sp-3)' }}>
          <p>
            <Badge tone={verdict.decision === 'block' ? 'bad' : verdict.decision === 'allow' ? 'ok' : 'warn'}>
              {verdict.decision}
            </Badge>{' '}
            <span className="kit-small">{verdict.sentence}</span>
          </p>
          {verdict.shadowDiffers && (
            <Banner tone="warn" title="A shadow rule would decide differently">
              This is what the address would get once that rule is armed. It blocks nobody today.
            </Banner>
          )}
          <Table
            caption="Every rule the engine considered, in order"
            head={['#', 'Range', 'Kind', 'Label', 'Outcome']}
          >
            {steps.map((step) => (
              <tr key={`${String(step.step)}-${String(step.matched ?? 'default')}-${String(step.decision ?? 'skip')}`}>
                <td className="kit-mono kit-small">{step.step}</td>
                <td className="kit-mono kit-small">{step.matched ?? '—'}</td>
                <td className="kit-small">{step.matched_kind ?? '—'}</td>
                <td className="kit-small">{step.matched_label ?? '—'}</td>
                <td className="kit-small">
                  {step.decision === null ? (
                    <span className="kit-muted">{step.skipped_why ?? 'passed over'}</span>
                  ) : (
                    <Badge tone={step.decision === 'block' ? 'bad' : step.decision === 'allow' ? 'ok' : 'warn'}>
                      {step.decision}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Card>
  );
}

/** §12.3's tracer: one request id, every rule the engine evaluated for it. */
type TraceRow = {
  readonly at: string;
  readonly ip: string;
  readonly action: string;
  readonly decision: string;
  readonly rule_range: string | null;
  readonly rule_kind: string | null;
  readonly rule_reason: string | null;
};

function Tracer(): ReactElement {
  const env = useCorporateEnv();
  const [id, setId] = useState('');
  const trimmed = id.trim();

  const state = useAsync(
    useCallback(async () => {
      if (trimmed === '') return [] as readonly TraceRow[];
      return listRpc<TraceRow>(env, 'ip_trace', { p_request_id: trimmed });
    }, [env, trimmed]),
    [env, trimmed],
  );

  return (
    <Card
      title="Trace a request"
      description="Paste the request id from a refusal. You get the decision, the rule that made it and the reason recorded with that rule."
    >
      <Field
        label="Request id"
        placeholder="req_01J8…"
        hint="Found in the refusal body the member saw, and in the edge log."
        value={id}
        onChange={(event) => {
          setId(event.target.value);
        }}
      />
      {trimmed !== '' && state.state.status === 'loading' && (
        <Loading label="Looking for that request." />
      )}
      {state.state.status === 'error' && (
        <Banner tone="bad" title="The trace failed">
          {state.state.message}
        </Banner>
      )}
      {state.state.status === 'ready' && trimmed !== '' && state.state.data.length === 0 && (
        <p className="kit-small kit-muted" style={{ marginTop: 'var(--sp-2)' }}>
          No decision was recorded for that id. A request that never reached the edge has no trace,
          and a trace that expires is not evidence — copy what you need now.
        </p>
      )}
      {state.state.status === 'ready' && state.state.data.length > 0 && (
        <Table
          caption="Oldest first. Every row is a decision this request id was given."
          head={['At', 'Address', 'Action', 'Decision', 'Rule', 'Reason']}
        >
          {state.state.data.map((row, index) => (
            <tr key={`${row.at}-${String(index)}`}>
              <td className="kit-small">{new Date(row.at).toLocaleString('en-GB')}</td>
              <td className="kit-mono kit-small">{row.ip}</td>
              <td className="kit-small">{row.action}</td>
              <td>
                <Badge tone={row.decision === 'block' ? 'bad' : 'ok'}>
                  {row.decision}
                </Badge>
              </td>
              <td className="kit-mono kit-small">
                {row.rule_range === null ? <span className="kit-muted">no rule</span> : row.rule_range}
                {row.rule_kind === null ? '' : ` (${row.rule_kind})`}
              </td>
              <td className="kit-small">{row.rule_reason ?? '—'}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

function Activity(): ReactElement {
  const env = useCorporateEnv();
  const [hours, setHours] = useState(24);
  const load = useCallback(
    () => listRpc<ActivityRow>(env, 'ip_activity', { p_hours: hours, p_limit: 100 }),
    [env, hours],
  );
  const { state } = useAsync(load, [env, hours]);

  return (
    <div className="kit-stack">
      <Card title="Recent activity" description="Addresses seen by the edge, busiest first.">
        <Select
          label="Window"
          value={String(hours)}
          onChange={(event) => {
            setHours(Number(event.target.value));
          }}
          options={[
            { value: '1', label: 'Last hour' },
            { value: '24', label: 'Last day' },
            { value: '168', label: 'Last week' },
          ]}
        />
      </Card>
      {state.status === 'loading' ? (
        <Loading label="Loading activity." />
      ) : state.status === 'error' ? (
        <Banner tone="bad" title="Activity did not load">
          {state.message}
        </Banner>
      ) : state.data.length === 0 ? (
        <Empty>Nothing was recorded in this window.</Empty>
      ) : (
        <Table
          caption="Busiest addresses first."
          head={['Address', 'Requests', 'Accounts', 'Last seen', 'Decision']}
        >
          {state.data.map((row) => (
            <tr key={row.ip}>
              <td className="kit-mono kit-small">{row.ip}</td>
              <td>{row.hits.toLocaleString('en-GB')}</td>
              <td>{row.accounts}</td>
              <td className="kit-small">{new Date(row.last_seen).toLocaleString('en-GB')}</td>
              <td>
                <Badge
                  tone={
                    row.decision === 'block' ? 'bad' : row.decision === 'allow' ? 'ok' : 'neutral'
                  }
                >
                  {row.decision ?? 'none'}
                </Badge>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
