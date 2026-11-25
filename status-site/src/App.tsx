import { useCallback, useState, type ReactElement } from 'react';
import {
  Badge,
  Banner,
  Button,
  Card,
  Empty,
  Field,
  Loading,
  PublicShell,
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
  actionState,
  boardSentence,
  buildTimelines,
  byCategory,
  declareProblems,
  drillLabel,
  impactTone,
  openFor,
  postmortemProblem,
  publicTitle,
  resolutionProblems,
  sortIncidents,
  uptimeOf,
  type CheckRow,
  type IncidentAction,
  type IncidentRow,
  type IncidentRowV2,
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
    <PublicShell
      appId="bsdc-status"
      title="BSDC Service Status"
      footerText={`Uptime is computed from recorded checks over the last ${WINDOW_DAYS} days.`}
    >
      <Status />
    </PublicShell>
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
  // `status_incidents` predates the public/internal split, so the console reads
  // the function that carries both. A screen using the old one could not show a
  // public title, and would silently fall back to the internal one.
  const incidents = await listRpc<IncidentRowV2>(env, 'incidents_with_updates', { p_limit: 25 });
  return {
    services,
    timelines: buildTimelines(services, (data ?? []) as CheckRow[], WINDOW_DAYS),
    incidents,
  };
}

/** §13.2 — declaring: two titles, two bodies, and a drill that tells nobody. */
function Declare({ services, onDeclared }: { services: readonly UptimeRow[]; onDeclared: () => void }): ReactElement {
  const env = useCorporateEnv();
  const [serviceKey, setServiceKey] = useState(services[0]?.service_key ?? '');
  const [title, setTitle] = useState('');
  const [publicTitle, setPublicTitle] = useState('');
  const [impact, setImpact] = useState('major');
  const [publicBody, setPublicBody] = useState('');
  const [internal, setInternal] = useState('');
  const [drill, setDrill] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const problems = declareProblems({ title, publicTitle, publicBody });

  const declare = (): void => {
    if (problems.length > 0) return;
    setBusy(true);
    setError('');
    callRpc(env, 'declare_incident', {
      p_service_key: serviceKey,
      p_title: title.trim(),
      p_public_title: publicTitle.trim(),
      p_impact: impact,
      p_public_body: publicBody.trim(),
      p_internal: internal.trim(),
      p_drill: drill,
    })
      .then(() => {
        setTitle('');
        setPublicTitle('');
        setPublicBody('');
        setInternal('');
        onDeclared();
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
      title="Declare an incident"
      description="Two boxes, never one: the sentence a customer reads is a different field from the note for staff. Declaring also opens a private staff channel and notifies whoever may write incidents."
    >
      {error !== '' && (
        <Banner tone="bad" title="The incident was not declared">
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
          options={services.map((row) => ({ value: row.service_key, label: row.service_key }))}
        />
        <Select
          label="Impact"
          value={impact}
          onChange={(event) => {
            setImpact(event.target.value);
          }}
          options={[
            { value: 'none', label: 'None' },
            { value: 'minor', label: 'Minor' },
            { value: 'major', label: 'Major' },
            { value: 'critical', label: 'Critical' },
          ]}
        />
        <Select
          label="Rehearsal?"
          hint="A drill runs the whole flow and notifies nobody."
          value={drill ? 'drill' : 'real'}
          onChange={(event) => {
            setDrill(event.target.value === 'drill');
          }}
          options={[
            { value: 'real', label: 'A real incident' },
            { value: 'drill', label: 'A drill' },
          ]}
        />
        <Field
          label="Internal title"
          hint="For staff. Names the system, not the customer experience."
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
        <Field
          label="Public title"
          hint="Shown on the status board without context, so it has to stand alone."
          value={publicTitle}
          onChange={(event) => {
            setPublicTitle(event.target.value);
          }}
        />
      </div>
      <TextArea
        label="What customers should read"
        hint="At least a sentence. This is the only thing the public board shows."
        value={publicBody}
        onChange={(event) => {
          setPublicBody(event.target.value);
        }}
      />
      <TextArea
        label="Internal note"
        hint="Staff only. Speculation belongs here, and is never copied to the public body automatically."
        value={internal}
        onChange={(event) => {
          setInternal(event.target.value);
        }}
      />
      <div className="kit-row" style={{ marginTop: 'var(--sp-3)' }}>
        <Button variant={drill ? 'quiet' : 'danger'} disabled={busy || problems.length > 0} onClick={declare}>
          {busy ? 'Declaring' : drill ? 'Run the drill' : 'Declare incident'}
        </Button>
        {problems.length > 0 && <span className="kit-hint">{problems[0]}</span>}
      </div>
    </Card>
  );
}

/** §13.2 — the action list, tracked to closure, with who and when. */
function Actions({ incidentId, onChanged }: { incidentId: string; onChanged: () => void }): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(
    () => listRpc<IncidentAction>(env, 'incident_actions_for', { p_incident_id: incidentId }),
    [env, incidentId],
  );
  const { state, reload } = useAsync(load, [env, incidentId]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  if (state.status === 'loading') return <Loading label="Loading actions." />;
  if (state.status === 'error') {
    return (
      <Banner tone="bad" title="Actions did not load">
        {state.message}
      </Banner>
    );
  }
  if (state.data.length === 0) {
    return (
      <p className="kit-small kit-muted">
        No action was opened. An incident that closes with nothing to do next is either trivial or
        was not understood.
      </p>
    );
  }

  return (
    <div className="kit-stack">
      {error !== '' && (
        <Banner tone="bad" title="The action was not closed">
          {error}
        </Banner>
      )}
      {state.data.map((action) => {
        const state = actionStateLabel(action);
        return (
          <div key={action.id}>
            <p className="kit-small" style={{ margin: 0 }}>
              <Badge tone={state === 'late' ? 'bad' : state === 'done' ? 'ok' : 'warn'}>{state}</Badge>{' '}
              {action.body}{' '}
              <span className="kit-muted">
                due {action.due_on}
                {action.done_at === null ? '' : ` — ${action.done_note}`}
              </span>
            </p>
            {action.done_at === null && (
              <div className="kit-row" style={{ marginTop: 'var(--sp-1)' }}>
                <Field
                  label="What closing it delivered"
                  value={busyId === action.id ? note : note}
                  onChange={(event) => {
                    setBusyId(action.id);
                    setNote(event.target.value);
                  }}
                />
                <Button
                  size="small"
                  disabled={note.trim().length < 5 || busyId !== action.id}
                  onClick={() => {
                    callRpc(env, 'complete_incident_action', { p_id: action.id, p_note: note.trim() })
                      .then(() => {
                        setNote('');
                        setBusyId('');
                        reload();
                        onChanged();
                      })
                      .catch((cause: unknown) => {
                        setError(messageOf(cause));
                      });
                  }}
                >
                  Close it
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function actionStateLabel(action: IncidentAction): string {
  const state = actionState(action);
  return state === 'done' ? 'done' : state === 'late' ? 'late' : state === 'due' ? 'due today' : 'open';
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

  const canResolve = meetsRole(profile, 'admin');
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
              <Incident
                key={incident.id}
                incident={incident}
                onChanged={reload}
                canResolve={canResolve}
              />
            ))}
          </div>
        )}
      </Card>

      {canResolve && (
        <Declare services={state.data.services} onDeclared={reload} />
      )}

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

/**
 * One incident, with the decision that closes it.
 *
 * `resolve_incident()` has existed and been called by nothing: an incident could
 * be opened from this board and never closed from it, so a resolved outage stayed
 * on the public status page until somebody used a SQL console. It also appends the
 * closing note as the last public update, which is why an empty note is refused
 * here as well as in the routine.
 *
 * Resolution needs the admin role because `resolve_incident()` requires the
 * `settings.write` permission, and a control that leads to a 403 is worse than no
 * control.
 */
function Incident({
  incident,
  onChanged,
  canResolve,
}: {
  incident: IncidentRowV2;
  onChanged: () => void;
  canResolve: boolean;
}): ReactElement {
  const env = useCorporateEnv();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const problems = resolutionProblems(note);

  const resolve = (): void => {
    if (problems.length > 0) {
      setError(problems[0] ?? '');
      return;
    }
    setBusy(true);
    setError('');
    callRpc(env, 'resolve_with_summary', { p_incident_id: incident.id, p_summary: note.trim(), p_actions: [] })
      .then(() => {
        setNote('');
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
    <article
      id={incident.public_slug ? `incident-${encodeURIComponent(incident.public_slug)}` : undefined}
      className="kit-card"
    >
      <div className="kit-row" style={{ justifyContent: 'space-between' }}>
        <strong>{publicTitle(incident)}</strong>
        <span className="kit-row">
          {incident.is_drill === true && <Badge tone="warn">{drillLabel(incident)}</Badge>}
          <Badge tone={impactTone(incident.impact)}>{incident.impact}</Badge>
          <Badge tone={incident.resolved_at === null ? 'bad' : 'ok'}>
            {incident.resolved_at === null ? 'open' : 'resolved'}
          </Badge>
        </span>
      </div>
      <p className="kit-small" style={{ marginBlock: 'var(--sp-1)' }}>
        {boardSentence(incident)}
      </p>
      {incident.summary !== undefined && incident.summary !== '' && (
        <p className="kit-small" style={{ marginBlock: 'var(--sp-1)' }}>
          <strong>Resolution: </strong>
          {incident.summary}
        </p>
      )}
      <p className="kit-small kit-muted">
        {new Date(incident.started_at).toLocaleString('en-GB')} —{' '}
        {incident.resolved_at === null
          ? `open for ${openFor(incident)}`
          : `lasted ${formatDuration(incident.started_at, incident.resolved_at)}`}
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

      <details className="kit-small" style={{ marginTop: 'var(--sp-2)' }}>
        <summary>Action list</summary>
        <Actions incidentId={incident.id} onChanged={onChanged} />
      </details>

      {canResolve && (
        <Postmortem incident={incident} onChanged={onChanged} />
      )}

      {incident.resolved_at === null && canResolve ? (
        <div className="kit-stack" style={{ marginTop: 'var(--sp-3)' }}>
          {error !== '' ? (
            <Banner tone="bad" title="The incident was not resolved">
              <p className="kit-small">{error}</p>
            </Banner>
          ) : null}
          <TextArea
            label="Closing update"
            hint="Published on the public board as the last update. Say what happened and what was done."
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
          <div className="kit-row">
            <Button variant="danger" disabled={busy || problems.length > 0} onClick={resolve}>
              {busy ? 'Resolving' : 'Resolve incident'}
            </Button>
            {problems.length > 0 ? <span className="kit-hint">{problems[0]}</span> : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

/** §13.2 — a post-mortem after the fact, and a sentence about what would have caught it. */
function Postmortem({ incident, onChanged }: { incident: IncidentRowV2; onChanged: () => void }): ReactElement {
  const env = useCorporateEnv();
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const problem = postmortemProblem(body, incident.resolved_at ?? null);
  const written = (incident.postmortem ?? '') !== '';

  return (
    <details className="kit-small" style={{ marginTop: 'var(--sp-2)' }}>
      <summary>{written ? 'Post-incident review' : 'Write a post-incident review'}</summary>
      {written ? (
        <p className="kit-small" style={{ whiteSpace: 'pre-wrap' }}>{incident.postmortem}</p>
      ) : (
        <div className="kit-stack" style={{ marginTop: 'var(--sp-2)' }}>
          {error !== '' && (
            <Banner tone="bad" title="The review was not saved">
              {error}
            </Banner>
          )}
          <TextArea
            label="What happened, why, and what would have caught it"
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
            }}
          />
          <div className="kit-row">
            <Button
              size="small"
              disabled={busy || problem !== ''}
              onClick={() => {
                setBusy(true);
                setError('');
                callRpc(env, 'record_postmortem', { p_incident_id: incident.id, p_body: body.trim() })
                  .then(onChanged)
                  .catch((cause: unknown) => {
                    setError(messageOf(cause));
                  })
                  .finally(() => {
                    setBusy(false);
                  });
              }}
            >
              {busy ? 'Saving' : 'Save the review'}
            </Button>
            {problem !== '' && <span className="kit-hint">{problem}</span>}
          </div>
        </div>
      )}
    </details>
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
