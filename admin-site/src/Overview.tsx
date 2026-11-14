import { useCallback, useState, type ReactElement } from 'react';
import {
  Banner,
  Button,
  Card,
  Drawer,
  Empty,
  Field,
  KpiTile,
  Loading,
  PortalFederationStrip,
  Table,
  buildTelemetrySignals,
  listRpc,
  relativeTimeLabel,
  rowsToCsv,
  useAsync,
  useCorporateEnv,
  useSession,
  type TelemetrySnapshot,
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

export function Overview(): ReactElement {
  const env = useCorporateEnv();
  const { state: session } = useSession();
  const userRole = session.status === 'authenticated' ? session.profile.role : null;

  const load = useCallback(async () => {
    const [ovRows, snapRows] = await Promise.all([
      listRpc<OverviewRow>(env, 'admin_overview'),
      listRpc<TelemetrySnapshot>(env, 'admin_telemetry_snapshot').catch(() => []),
    ]);
    return { overview: ovRows[0] ?? null, snapshot: snapRows[0] ?? null };
  }, [env]);
  const { state, reload } = useAsync(load, [env]);
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);

  if (state.status === 'loading')
    return <Loading label="Synchronizing community & corporate telemetry." />;
  if (state.status === 'error') {
    return (
      <Banner tone="bad" title="The overview did not load">
        <p className="kit-small">{state.message}</p>
      </Banner>
    );
  }
  if (state.data.overview === null) {
    return (
      <Banner tone="warn" title="The overview returned no numbers">
        <p className="kit-small">
          The function answered with no rows. Verify active moderation/admin clearance.
        </p>
      </Banner>
    );
  }

  const { overview, snapshot } = state.data;
  const waiting = outstandingWork(overview);
  const signals = snapshot ? buildTelemetrySignals(snapshot) : [];

  return (
    <div className="kit-stack">
      <Banner
        tone={waiting === 0 ? 'ok' : waiting > 20 ? 'bad' : 'warn'}
        title={
          waiting === 0
            ? 'All community queues clear'
            : `${formatCount(waiting)} pending decision${waiting === 1 ? '' : 's'} waiting`
        }
      >
        <p className="kit-small">
          {waiting === 0
            ? 'Every shop application, campaign review, and report queue is balanced. Press Refresh at any time for a live Postgres snapshot.'
            : 'Use Approvals for shops and campaigns, the CLI tab for batch operations, or switch directly via the Portal Network rail.'}
        </p>
      </Banner>

      <Card
        title="Federated Portal Launchpad"
        description="Jump straight into any specialized BSDC console with keyboard shortcut Ctrl+K or g+<key>."
        actions={
          <div className="kit-row">
            <Button size="small" variant="quiet" onClick={() => setAuditDrawerOpen(true)}>
              Open Audit Inspector
            </Button>
            <Button size="small" variant="quiet" onClick={reload}>
              Refresh Telemetry
            </Button>
          </div>
        }
      >
        <PortalFederationStrip currentAppId={env.appId} userRole={userRole} />
      </Card>

      <div className="kit-grid">
        {overviewTiles(overview).map((tile) => (
          <KpiTile
            key={tile.key}
            label={tile.label}
            value={tile.value}
            tone={tile.tone}
            badge={tile.tone === 'ok' ? 'clear' : tile.tone}
            detail={tile.note}
          />
        ))}
      </div>

      {signals.length > 0 && (
        <Card
          title="Cross-Portal Corporate Health"
          description="Live snapshot from admin_telemetry_snapshot() spanning trust documents, security rules, edge errors, and incidents."
        >
          <div className="kit-grid">
            {signals.map((sig) => (
              <KpiTile
                key={sig.id}
                label={sig.label}
                value={sig.value}
                tone={sig.tone}
                detail={sig.detail}
              />
            ))}
          </div>
        </Card>
      )}

      <AuditTrail />

      <Drawer
        open={auditDrawerOpen}
        title="Live Audit Inspector"
        subtitle="Filter immutable audit_log rows by action prefix, actor UID, or subject."
        onClose={() => setAuditDrawerOpen(false)}
      >
        <AuditInspector />
      </Drawer>
    </div>
  );
}

function AuditInspector(): ReactElement {
  const env = useCorporateEnv();
  const [actionFilter, setActionFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');

  const load = useCallback(
    () =>
      listRpc<AuditRow>(env, 'admin_cli_audit_query', {
        p_action: actionFilter.trim(),
        p_subject: subjectFilter.trim(),
        p_limit: 120,
      }),
    [env, actionFilter, subjectFilter],
  );
  const { state, reload } = useAsync(load, [env, actionFilter, subjectFilter]);

  const exportCsv = (): void => {
    if (state.status !== 'ready') return;
    const csv = rowsToCsv(
      ['created_at', 'actor_uid', 'action', 'subject', 'detail'],
      state.data.map((r) => [
        r.created_at,
        r.actor_uid,
        r.action,
        r.subject,
        describeMetadata(r.metadata),
      ]),
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bsdc-audit-export.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="kit-stack">
      <div className="kit-grid kit-grid--2">
        <Field
          label="Action filter"
          placeholder="e.g. certificate. or notice."
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        />
        <Field
          label="Subject filter"
          placeholder="UID, code, or path"
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
        />
      </div>
      <div className="kit-row">
        <Button size="small" onClick={reload}>
          Run Query
        </Button>
        {state.status === 'ready' && state.data.length > 0 && (
          <Button size="small" variant="quiet" onClick={exportCsv}>
            Export CSV ({state.data.length})
          </Button>
        )}
      </div>

      {state.status === 'loading' && <Loading label="Searching audit ledger." />}
      {state.status === 'error' && (
        <Banner tone="bad" title="Audit query failed">
          {state.message}
        </Banner>
      )}
      {state.status === 'ready' && state.data.length === 0 && (
        <Empty>No audit records match the active filter.</Empty>
      )}
      {state.status === 'ready' && state.data.length > 0 && (
        <Table caption="Filtered audit entries" head={['When', 'Actor', 'Action', 'Subject']}>
          {state.data.map((row, idx) => (
            <tr key={`${row.created_at}-${row.action}-${String(idx)}`}>
              <td className="kit-small">
                <div className="kit-mono">{row.created_at.slice(0, 19).replace('T', ' ')}</div>
                <span className="kit-muted">{relativeTimeLabel(row.created_at)}</span>
              </td>
              <td className="kit-mono kit-small">{row.actor_uid.slice(0, 12)}</td>
              <td className="kit-small">
                <strong>{describeAction(row.action)}</strong>
                <div className="kit-mono kit-muted">{row.action}</div>
              </td>
              <td className="kit-small">
                <div className="kit-mono">{row.subject || '—'}</div>
                <div className="kit-muted">{describeMetadata(row.metadata)}</div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function AuditTrail(): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(
    async () => groupByDay(await listRpc<AuditRow>(env, 'admin_audit', { p_limit: 80 })),
    [env],
  );
  const { state, reload } = useAsync(load, [env]);

  return (
    <Card
      title="Recent privileged changes"
      description="Every role change, certificate revision, notice publication, configuration edit, and approval writes in the same transaction."
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
        <Empty>Nothing has been recorded yet.</Empty>
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
