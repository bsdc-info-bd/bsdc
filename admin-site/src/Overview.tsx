import { useCallback } from 'react';
import type { ReactElement } from 'react';
import {
  Badge,
  Banner,
  Button,
  Card,
  Empty,
  Loading,
  Table,
  listRpc,
  useAsync,
  useCorporateEnv,
} from '@kit';
import {
  describeAction,
  describeMetadata,
  formatCount,
  groupByDay,
  outstandingWork,
  overviewTiles,
  type AuditRow,
  type Overview as OverviewRow,
} from './overview';

/**
 * What this console is for, in one screen.
 *
 * Two things live here that existed in the database and in no console:
 *
 *   1. `admin_overview()` — written in 0024, counted members, posts, open
 *      reports, pending shops, pending campaigns and enabled plugins, and was
 *      called by nothing. An owner had no page that told them what needed them.
 *   2. `admin_audit()` — the audit trail. Every privileged change in the platform
 *      writes to it, and until now the only way to read it was a SQL console. That
 *      is the wrong answer for the one record that exists to answer "who did this,
 *      and when" during an incident.
 */
export function Overview(): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(async () => {
    const rows = await listRpc<OverviewRow>(env, 'admin_overview');
    return rows[0] ?? null;
  }, [env]);
  const { state, reload } = useAsync(load, [env]);

  if (state.status === 'loading') return <Loading label="Counting the community." />;
  if (state.status === 'error') {
    return (
      <Banner tone="bad" title="The overview did not load">
        <p className="kit-small">{state.message}</p>
      </Banner>
    );
  }
  if (state.data === null) {
    return (
      <Banner tone="warn" title="The overview returned no numbers">
        <p className="kit-small">
          The function answered with no rows. That usually means the caller holds no moderation
          permission, which is itself worth knowing.
        </p>
      </Banner>
    );
  }

  const overview = state.data;
  const waiting = outstandingWork(overview);

  return (
    <div className="kit-stack">
      <Banner
        tone={waiting === 0 ? 'ok' : waiting > 20 ? 'bad' : 'warn'}
        title={
          waiting === 0
            ? 'Nothing is waiting on you'
            : `${formatCount(waiting)} item${waiting === 1 ? '' : 's'} waiting on a person`
        }
      >
        <p className="kit-small">
          {waiting === 0
            ? 'Every report, shop and campaign has been answered. This screen refreshes when you press it, not on a timer, so it cannot show you a stale queue as if it were live.'
            : 'Reports are worked on the moderator console. Shops and campaigns are worked on the Approvals tab. Nothing here clears itself.'}
        </p>
      </Banner>

      <div className="kit-row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>The community right now</h2>
        <Button variant="quiet" size="small" onClick={reload}>
          Refresh
        </Button>
      </div>

      <div className="kit-grid">
        {overviewTiles(overview).map((tile) => (
          <div key={tile.key} className="kit-card" style={{ padding: 'var(--sp-3)' }}>
            <div className="kit-row" style={{ justifyContent: 'space-between' }}>
              <span className="kit-small kit-muted">{tile.label}</span>
              <Badge tone={tile.tone}>{tile.tone === 'ok' ? 'clear' : tile.tone}</Badge>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1.1 }}>{tile.value}</div>
            <p className="kit-small kit-muted" style={{ margin: 0 }}>
              {tile.note}
            </p>
          </div>
        ))}
      </div>

      <AuditTrail />
    </div>
  );
}

function AuditTrail(): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(
    async () => groupByDay(await listRpc<AuditRow>(env, 'admin_audit', { p_limit: 100 })),
    [env],
  );
  const { state, reload } = useAsync(load, [env]);

  return (
    <Card
      title="Recent privileged changes"
      description="Every role change, suspension, configuration edit and approval writes here in the same transaction as the change."
      actions={
        <Button variant="quiet" size="small" onClick={reload}>
          Refresh
        </Button>
      }
    >
      {state.status === 'loading' ? <Loading label="Reading the audit trail." /> : null}
      {state.status === 'error' ? (
        <Banner tone="bad" title="The audit trail did not load">
          <p className="kit-small">{state.message}</p>
        </Banner>
      ) : null}
      {state.status === 'ready' && state.data.length === 0 ? (
        <Empty>
          Nothing has been recorded yet. That is plausible on a new deployment and suspicious on an
          old one — the audit log is written by the same transaction as the change.
        </Empty>
      ) : null}
      {state.status === 'ready'
        ? state.data.map((group) => (
            <div key={group.day} className="kit-stack">
              <h3 className="kit-small kit-muted" style={{ margin: 0 }}>
                {group.day === 'unknown' ? 'Undated' : group.day}
              </h3>
              <Table caption="" head={['When', 'Who', 'What', 'Detail']}>
                {group.rows.map((row, index) => (
                  <tr key={`${row.created_at}-${row.action}-${String(index)}`}>
                    <td className="kit-mono kit-small">{row.created_at.slice(11, 19)}</td>
                    <td className="kit-mono kit-small">{row.actor_uid.slice(0, 12)}</td>
                    <td>
                      {describeAction(row.action)}
                      <div className="kit-small kit-muted kit-mono">{row.action}</div>
                    </td>
                    <td className="kit-small">
                      {row.subject.length > 0 ? (
                        <div className="kit-mono">{row.subject}</div>
                      ) : null}
                      {describeMetadata(row.metadata)}
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          ))
        : null}
    </Card>
  );
}
