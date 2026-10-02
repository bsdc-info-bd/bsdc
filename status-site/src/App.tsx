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
  dayBand,
  formatDuration,
  getDb,
  listRpc,
  meetsRole,
  messageOf,
  overallState,
  stateLabel,
  toDataError,
  uptimePercent,
  useAsync,
  useCorporateEnv,
  useProfile,
  useSession,
  type CorporateEnv,
  type ServiceSummary,
} from '@kit';
import {
  buildTimelines,
  byCategory,
  impactTone,
  sortIncidents,
  uptimeOf,
  type CheckRow,
  type IncidentRow,
  type UptimeRow,
} from './model';

const WINDOW_DAYS = 90;

/**
 * The status page is public on purpose. During an outage the one page that
 * must still answer is the page that says there is an outage, so nothing
 * here waits for a sign-in; the operations panel appears for staff on top of
 * a page that already rendered.
 */
export function App(): ReactElement {
  return (
    <div className="kit-shell">
      <header className="kit-header">
        <div className="kit-brand">
          <strong>BSDC service status</strong>
          <span>Bangladesh Software Development Community</span>
        </div>
        <SessionBadge />
      </header>
      <main className="kit-main">
        <Status />
      </main>
      <footer className="kit-footer">
        Uptime is computed from recorded checks over the last {WINDOW_DAYS} days.
      </footer>
    </div>
  );
}

function SessionBadge(): ReactElement | null {
  const { state, signOut } = useSession();
  if (state.status !== 'authenticated') return null;
  return (
    <div className="kit-who">
      <span>{state.profile.displayName}</span>
      <Button
        size="small"
        variant="quiet"
        onClick={() => {
          void signOut();
        }}
      >
        Sign out
      </Button>
    </div>
  );
}

type Board = {
  readonly services: readonly UptimeRow[];
  readonly timelines: readonly ServiceSummary[];
  readonly incidents: readonly IncidentRow[];
};

const emptyBoard: Board = { services: [], timelines: [], incidents: [] };

async function loadBoard(env: CorporateEnv): Promise<Board> {
  const services = await listRpc<UptimeRow>(env, 'service_uptime', { p_days: WINDOW_DAYS });
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (WINDOW_DAYS - 1));
  const { data, error } = await getDb(env)
    .from('service_checks')
    .select('service_key, day, ok_count, fail_count')
    .gte('day', since.toISOString().slice(0, 10));
  if (error) throw toDataError(error);
  const incidents = await listRpc<IncidentRow>(env, 'status_incidents', { p_limit: 25 });
  return {
    services,
    timelines: buildTimelines(services, (data ?? []) as CheckRow[], WINDOW_DAYS),
    incidents,
  };
}

function Status(): ReactElement {
  const env = useCorporateEnv();
  const { state: session } = useSession();
  const configuring = session.status === 'configuring';
  const load = useCallback(
    async () => (configuring ? emptyBoard : loadBoard(env)),
    [env, configuring],
  );
  const { state, reload } = useAsync(load, [env, configuring]);
  const profile = useProfile();

  if (session.status === 'configuring') {
    return (
      <Banner tone="bad" title="This deployment is not configured">
        <p className="kit-small">
          The status page needs <span className="kit-mono">{session.missing.join(', ')}</span>{' '}
          before it can report anything. Add them to the Cloudflare Pages project and redeploy.
        </p>
      </Banner>
    );
  }

  if (state.status === 'loading') return <Loading label="Checking every service." />;
  if (state.status === 'error') {
    return (
      <Banner tone="bad" title="The status board could not be loaded">
        <p className="kit-small">{state.message}</p>
      </Banner>
    );
  }

  const overall = overallState(state.data.timelines);
  const incidents = sortIncidents(state.data.incidents);
  const open = incidents.filter((incident) => incident.resolved_at === null);

  return (
    <div className="kit-stack">
      <Banner
        tone={
          overall === 'operational'
            ? 'ok'
            : overall === 'degraded' || overall === 'maintenance'
              ? 'warn'
              : 'bad'
        }
        title={stateLabel(overall)}
      >
        <p className="kit-small">
          {open.length === 0
            ? 'No incident is open.'
            : `${open.length} incident${open.length === 1 ? ' is' : 's are'} open.`}
        </p>
      </Banner>

      {byCategory(state.data.services).map((group) => (
        <Card key={group.category} title={group.category}>
          <div className="kit-stack">
            {group.rows.map((row) => {
              const timeline = state.data.timelines.find((item) => item.slug === row.service_key);
              return <ServiceRow key={row.service_key} row={row} timeline={timeline} />;
            })}
          </div>
        </Card>
      ))}

      <Card title="Incidents" description="Open incidents first, then the most recent.">
        {incidents.length === 0 ? (
          <Empty>No incident has been recorded.</Empty>
        ) : (
          <div className="kit-stack">
            {incidents.map((incident) => (
              <Incident key={incident.id} incident={incident} />
            ))}
          </div>
        )}
      </Card>

      {meetsRole(profile, 'moderator') && (
        <Operations services={state.data.services} onChanged={reload} />
      )}
    </div>
  );
}

function ServiceRow({
  row,
  timeline,
}: {
  row: UptimeRow;
  timeline: ServiceSummary | undefined;
}): ReactElement {
  const measured = timeline ? uptimePercent(timeline.days) : null;
  return (
    <div>
      <div className="kit-row" style={{ justifyContent: 'space-between' }}>
        <strong>{row.name}</strong>
        <span className="kit-row">
          <Badge tone={row.state === 'operational' ? 'ok' : row.state === 'down' ? 'bad' : 'warn'}>
            {stateLabel(row.state)}
          </Badge>
          <span className="kit-small kit-muted">{uptimeOf(row).toFixed(2)}% uptime</span>
        </span>
      </div>
      {timeline && (
        <div
          className="kit-bars"
          role="img"
          aria-label={`${row.name}: ${
            measured === null
              ? 'no checks recorded'
              : `${measured.toFixed(2)} percent of checks succeeded`
          } over ${WINDOW_DAYS} days`}
        >
          {timeline.days.map((day) => (
            <span key={day.day} className={`kit-bar kit-bar--${dayBand(day)}`} />
          ))}
        </div>
      )}
      <p className="kit-hint">
        {row.avg_latency > 0 ? `${row.avg_latency} ms average response. ` : ''}
        {row.open_incident ? 'An incident is open against this service.' : 'No open incident.'}
      </p>
    </div>
  );
}

function Incident({ incident }: { incident: IncidentRow }): ReactElement {
  return (
    <article className="kit-card">
      <div className="kit-row" style={{ justifyContent: 'space-between' }}>
        <strong>{incident.title}</strong>
        <span className="kit-row">
          <Badge tone={impactTone(incident.impact)}>{incident.impact}</Badge>
          <Badge tone={incident.resolved_at === null ? 'bad' : 'ok'}>
            {incident.resolved_at === null ? 'open' : 'resolved'}
          </Badge>
        </span>
      </div>
      <p className="kit-small kit-muted">
        {new Date(incident.started_at).toLocaleString('en-GB')} — lasted{' '}
        {formatDuration(incident.started_at, incident.resolved_at)}
        {incident.service_key === null ? '' : ` — ${incident.service_key}`}
      </p>
      <ol className="kit-small" style={{ margin: 0, paddingInlineStart: '1.1rem' }}>
        {incident.updates.map((update) => (
          <li key={update.created_at}>
            <span className="kit-muted">
              {new Date(update.created_at).toLocaleString('en-GB')}:{' '}
            </span>
            {update.body}
          </li>
        ))}
      </ol>
    </article>
  );
}

function Operations({
  services,
  onChanged,
}: {
  services: readonly UptimeRow[];
  onChanged: () => void;
}): ReactElement {
  const env = useCorporateEnv();
  const [serviceKey, setServiceKey] = useState(services[0]?.service_key ?? '');
  const [title, setTitle] = useState('');
  const [impact, setImpact] = useState<IncidentRow['impact']>('minor');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (): void => {
    setBusy(true);
    setError('');
    callRpc(env, 'open_incident', {
      p_service_key: serviceKey,
      p_title: title.trim(),
      p_impact: impact,
      p_body: body.trim(),
    })
      .then(() => {
        setTitle('');
        setBody('');
        onChanged();
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
      title="Operations"
      description="Opening an incident changes the service state and the public banner straight away."
    >
      {error !== '' && (
        <Banner tone="bad" title="The incident was not opened">
          {error}
        </Banner>
      )}
      <div className="kit-grid">
        <Select
          label="Service"
          value={serviceKey}
          onChange={(event) => {
            setServiceKey(event.target.value);
          }}
          options={services.map((service) => ({ value: service.service_key, label: service.name }))}
        />
        <Select
          label="Impact"
          value={impact}
          onChange={(event) => {
            setImpact(event.target.value as IncidentRow['impact']);
          }}
          options={[
            { value: 'minor', label: 'Minor' },
            { value: 'major', label: 'Major' },
            { value: 'critical', label: 'Critical' },
          ]}
        />
      </div>
      <div className="kit-stack" style={{ marginTop: 'var(--sp-3)' }}>
        <Field
          label="Title"
          hint="What a member would recognise, not an internal code."
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
        <TextArea
          label="First update"
          hint="What is known now, and when the next update will come."
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
          }}
        />
        <div className="kit-row">
          <Button
            disabled={busy || title.trim().length < 4 || body.trim() === '' || serviceKey === ''}
            onClick={open}
          >
            {busy ? 'Opening' : 'Open incident'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
