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
  Table,
  callRpc,
  listRpc,
  messageOf,
  useAsync,
  useCorporateEnv,
} from '@kit';
import {
  REPORT_KINDS,
  flattenPayload,
  kindDescription,
  newestFirst,
  periodLabel,
  snapshotProblems,
  suggestedTitle,
  type ReportKind,
  type SnapshotRow,
  type SnapshotTotal,
} from './reports';

/**
 * Reports the moderator can freeze, and the archive of frozen ones.
 *
 * Before this tab there was no way, anywhere in the platform, to answer "what did
 * the queue look like last Tuesday". The live screens are always now, so a number
 * quoted in a handover note was a number somebody had copied down by hand at the
 * time. `create_report_snapshot()` freezes the period into a payload and
 * `report_snapshot(id)` reads it back; both already existed.
 */
export function Reports(): ReactElement {
  return (
    <div className="kit-stack">
      <Banner tone="neutral" title="A snapshot is evidence, not a dashboard">
        <p className="kit-small">
          The live screens always show now. A snapshot records what the numbers were for a period,
          so a handover or an incident review can quote them months later. It costs one query and
          cannot be edited afterwards.
        </p>
      </Banner>
      <NewSnapshot />
      <Archive />
    </div>
  );
}

function NewSnapshot(): ReactElement {
  const env = useCorporateEnv();
  const [kind, setKind] = useState<ReportKind>('moderation');
  const [days, setDays] = useState(30);
  const [title, setTitle] = useState(() => suggestedTitle('moderation', 30));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [made, setMade] = useState('');

  const problems = snapshotProblems(title, days);

  const create = (): void => {
    if (problems.length > 0) {
      setError(problems[0] ?? '');
      return;
    }
    setBusy(true);
    setError('');
    setMade('');
    callRpc<string>(env, 'create_report_snapshot', {
      p_kind: kind,
      p_title: title.trim(),
      p_days: days,
    })
      .then(() => {
        setMade(
          'Saved. It is now the newest entry in the archive — open it to check the numbers before you quote them.',
        );
      })
      .catch((cause: unknown) => {
        setError(messageOf(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <Card title="Make a snapshot" description={kindDescription(kind)}>
      <div className="kit-grid">
        <Select
          label="What to freeze"
          value={kind}
          onChange={(event) => {
            const next = event.target.value as ReportKind;
            setKind(next);
            // The title names the period, so it follows the kind until somebody
            // types their own. A stale title with a new kind is a misfiled report.
            setTitle(suggestedTitle(next, days));
          }}
          options={REPORT_KINDS.map((value) => ({ value, label: value }))}
        />
        <Field
          label="Days covered"
          type="number"
          min={1}
          max={365}
          value={String(days)}
          onChange={(event) => {
            const next = Number(event.target.value);
            setDays(Number.isFinite(next) ? Math.trunc(next) : 1);
          }}
        />
        <Field
          label="Title"
          value={title}
          maxLength={120}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
      </div>
      {error !== '' ? (
        <Banner tone="bad" title="The snapshot was not made">
          <p className="kit-small">{error}</p>
        </Banner>
      ) : null}
      {made !== '' ? (
        <Banner tone="ok" title="Snapshot saved">
          <p className="kit-small">{made}</p>
        </Banner>
      ) : null}
      <Button disabled={busy || problems.length > 0} onClick={create}>
        {busy ? 'Writing' : 'Freeze this period'}
      </Button>
      {problems.length > 0 ? <p className="kit-small kit-muted">{problems[0]}</p> : null}
    </Card>
  );
}

function Archive(): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(
    async () =>
      newestFirst(await listRpc<SnapshotRow>(env, 'report_snapshots_list', { p_limit: 50 })),
    [env],
  );
  const { state, reload } = useAsync(load, [env]);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Card
      title="Archive"
      description="Newest first. Opening one reads the frozen payload, not today's numbers."
      actions={
        <Button variant="quiet" size="small" onClick={reload}>
          Refresh
        </Button>
      }
    >
      {state.status === 'loading' ? <Loading label="Reading the archive." /> : null}
      {state.status === 'error' ? (
        <Banner tone="bad" title="The archive did not load">
          <p className="kit-small">{state.message}</p>
        </Banner>
      ) : null}
      {state.status === 'ready' && state.data.length === 0 ? (
        <Empty>
          Nothing has been frozen yet. Until a snapshot is made, the only record of a past period is
          what somebody wrote down at the time.
        </Empty>
      ) : null}
      {state.status === 'ready' && state.data.length > 0 ? (
        <Table caption="" head={['Title', 'Kind', 'Period', 'Made', '']}>
          {state.data.map((row) => (
            <tr key={row.id}>
              <td>
                {row.title}
                {openId === row.id ? <SnapshotDetail id={row.id} /> : null}
              </td>
              <td>
                <Badge>{row.kind}</Badge>
              </td>
              <td className="kit-small kit-mono">{periodLabel(row)}</td>
              <td className="kit-small kit-muted">
                {row.created_at.slice(0, 10)}
                <div className="kit-mono">{row.created_by.slice(0, 10)}</div>
              </td>
              <td>
                <Button
                  size="small"
                  variant="quiet"
                  onClick={() => {
                    setOpenId(openId === row.id ? null : row.id);
                  }}
                >
                  {openId === row.id ? 'Close' : 'Open'}
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      ) : null}
    </Card>
  );
}

function SnapshotDetail({ id }: { id: string }): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(() => callRpc<unknown>(env, 'report_snapshot', { p_id: id }), [env, id]);
  const { state } = useAsync(load, [env, id]);

  if (state.status === 'loading') return <p className="kit-small kit-muted">Reading…</p>;
  if (state.status === 'error') {
    return <p className="kit-small kit-error">The payload could not be read: {state.message}</p>;
  }

  const rows: readonly SnapshotTotal[] = flattenPayload(state.data);
  if (rows.length === 0) {
    return (
      <p className="kit-small kit-muted">
        This snapshot has no numbers in it. That is a fault in the payload, not an empty period.
      </p>
    );
  }

  return (
    <table className="kit-table" style={{ marginTop: 'var(--sp-2)' }}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row" className="kit-small">
              {row.label}
            </th>
            <td className="kit-mono kit-small">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
