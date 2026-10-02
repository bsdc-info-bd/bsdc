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
  callRpc,
  decideIp,
  getDb,
  listRpc,
  messageOf,
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
  toRule,
  type ActivityRow,
  type RuleRow,
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
      ]}
    />
  );
}

async function loadRules(env: CorporateEnv): Promise<readonly IpRule[]> {
  const { data, error } = await getDb(env)
    .from('ip_rules')
    .select('id, range, kind, reason, expires_at, created_by, created_at')
    .order('created_at', { ascending: false });
  if (error) throw toDataError(error);
  return ((data ?? []) as RuleRow[]).map(toRule);
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

  const soon = expiringSoon(state.data);

  return (
    <div className="kit-stack">
      <NewRule onSaved={reload} />
      <Simulator rules={state.data} />
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
        <Card title="Rules in force" description="The most specific matching range decides.">
          <Table caption="Newest first." head={['Range', 'Kind', 'Reason', 'Lifetime', 'Remove']}>
            {state.data.map((rule) => (
              <tr key={rule.id}>
                <td className="kit-mono kit-small">{rule.cidr}</td>
                <td>
                  <Badge
                    tone={rule.kind === 'block' ? 'bad' : rule.kind === 'allow' ? 'ok' : 'warn'}
                  >
                    {rule.kind}
                  </Badge>
                </td>
                <td className="kit-small">
                  {rule.reason === '' ? 'No reason recorded' : rule.reason}
                </td>
                <td className="kit-small">{lifetime(rule)}</td>
                <td>
                  <RemoveRule id={rule.id} onRemoved={reload} />
                </td>
              </tr>
            ))}
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
  const [hours, setHours] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const radius = blastRadius(range);
  const hoursValue = hours.trim() === '' ? null : Number(hours);
  const hoursInvalid = hoursValue !== null && (!Number.isInteger(hoursValue) || hoursValue < 1);

  const save = (): void => {
    setBusy(true);
    setError('');
    callRpc(env, 'set_ip_rule', {
      p_range: radius.canonical,
      p_kind: kind,
      p_reason: reason.trim(),
      p_hours: hoursValue,
    })
      .then(() => {
        setRange('');
        setReason('');
        setHours('');
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
    <Card title="New rule" description="A rule without an expiry stays until somebody removes it.">
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
              ? `${radius.canonical} covers ${radius.addresses.toLocaleString('en-GB')}`
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
          label="Reason"
          hint="Recorded with the rule and shown to whoever reviews it next."
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
        <Field
          label="Expires after (hours)"
          hint="Leave empty for a permanent rule."
          inputMode="numeric"
          error={hoursInvalid ? 'Use a whole number of hours.' : undefined}
          value={hours}
          onChange={(event) => {
            setHours(event.target.value);
          }}
        />
      </div>
      {radius.valid && radius.warning !== '' && (
        <p className="kit-hint" style={{ marginTop: 'var(--sp-2)' }}>
          {radius.warning}
        </p>
      )}
      <div className="kit-row" style={{ marginTop: 'var(--sp-3)' }}>
        <Button disabled={busy || !radius.valid || hoursInvalid} onClick={save}>
          {busy ? 'Saving' : 'Save rule'}
        </Button>
      </div>
    </Card>
  );
}

function Simulator({ rules }: { rules: readonly IpRule[] }): ReactElement {
  const [ip, setIp] = useState('');
  const [allowlistOnly, setAllowlistOnly] = useState(false);
  const decision = useMemo(
    () => decideIp(ip, rules, { allowlistOnly }),
    [ip, rules, allowlistOnly],
  );
  const show = ip.trim() !== '';

  return (
    <Card
      title="Try an address"
      description="The same rule the database would apply, shown before you commit."
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
        <Select
          label="Allowlist mode"
          hint="Matches the ops.ip_allowlist_only setting."
          value={allowlistOnly ? 'on' : 'off'}
          onChange={(event) => {
            setAllowlistOnly(event.target.value === 'on');
          }}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'on', label: 'On' },
          ]}
        />
      </div>
      {show && (
        <p style={{ marginTop: 'var(--sp-3)' }}>
          <Badge tone={decision.allowed ? 'ok' : 'bad'}>
            {decision.allowed ? 'allowed' : 'refused'}
          </Badge>{' '}
          <span className="kit-small kit-muted">{decision.reason}</span>
        </p>
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
