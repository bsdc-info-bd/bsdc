import { useCallback, useState, type ReactElement } from 'react';
import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  Empty,
  Loading,
  Select,
  Table,
  VITAL_SPECS,
  bundleVerdict,
  callRpc,
  forecastSentence,
  formatVital,
  isTrustworthy,
  listRpc,
  messageOf,
  overallVerdicts,
  ratingTone,
  sortErrors,
  sparkline,
  trendDirection,
  useAsync,
  useCorporateEnv,
  worstRoutes,
  type BundlePoint,
  type CorporateEnv,
  type ErrorRow,
  type Forecast,
  type TrendPoint,
  type VitalRow,
} from '@kit';
import {
  APPS,
  WINDOWS,
  budgetShare,
  coverageSentence,
  edgeNote,
  errorRate,
  metricFromValue,
  metricOptions,
  routesByTraffic,
  shortMessage,
  summaryCsv,
  targetLabel,
  trendBounds,
  windowLabel,
  type EdgeRow,
} from './model';

/**
 * The performance suite.
 *
 * Everything on these screens is a field measurement from somebody's actual
 * phone. There is no synthetic score anywhere in it, and no user column
 * behind it: the tables record what a route was like, never who was using
 * it.
 */
export function App(): ReactElement {
  return (
    <AppShell
      minRole="moderator"
      note="Field measurements from real devices. Nothing here identifies a visitor."
      tabs={[
        { id: 'vitals', label: 'Experience', render: () => <Vitals /> },
        { id: 'edge', label: 'Edge', render: () => <Edge /> },
        { id: 'errors', label: 'Errors', render: () => <Errors /> },
        { id: 'weight', label: 'Weight', render: () => <Weight /> },
      ]}
    />
  );
}

function download(filename: string, body: string, type: string): void {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

interface VitalsData {
  readonly summary: readonly VitalRow[];
  readonly trend: readonly TrendPoint[];
  readonly forecast: Forecast | null;
}

async function loadVitals(
  env: CorporateEnv,
  days: number,
  app: string,
  metric: string,
): Promise<VitalsData> {
  const [summary, trend, forecast] = await Promise.all([
    listRpc<VitalRow>(env, 'vitals_summary', { p_days: days, p_app: app }),
    listRpc<TrendPoint>(env, 'vitals_trend', { p_metric: metric, p_days: days, p_app: app }),
    listRpc<Forecast>(env, 'capacity_forecast', { p_days: days }),
  ]);
  return { summary, trend, forecast: forecast[0] ?? null };
}

function Vitals(): ReactElement {
  const env = useCorporateEnv();
  const [days, setDays] = useState('28');
  const [app, setApp] = useState('main-site');
  const [metric, setMetric] = useState('LCP');
  const [route, setRoute] = useState('');

  const load = useCallback(
    () => loadVitals(env, Number(days), app, metric),
    [env, days, app, metric],
  );
  const { state } = useAsync(load, [env, days, app, metric]);

  const chosen = metricFromValue(metric);
  const spec = VITAL_SPECS[chosen];

  if (state.status === 'loading') return <Loading label="Reading field measurements." />;
  if (state.status === 'error')
    return (
      <Banner tone="bad" title="Measurements did not load">
        {state.message}
      </Banner>
    );

  const { summary, trend, forecast } = state.data;
  const verdicts = overallVerdicts(summary);
  const routes = routesByTraffic(summary);
  const filtered = route === '' ? summary : summary.filter((row) => row.route === route);
  const bounds = trendBounds(trend);
  const direction = trendDirection(trend);
  const line = sparkline(trend, 640, 64);

  return (
    <div className="kit-stack">
      <Card title="Window" description={coverageSentence(summary)}>
        <div className="kit-grid">
          <Select
            label="Period"
            value={days}
            options={WINDOWS.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(event) => setDays(event.target.value)}
          />
          <Select
            label="Application"
            value={app}
            options={APPS.map((option) => ({ value: option.id, label: option.label }))}
            onChange={(event) => setApp(event.target.value)}
          />
          <Select
            label="Metric shown over time"
            value={metric}
            hint={spec.meaning}
            options={[...metricOptions()]}
            onChange={(event) => setMetric(event.target.value)}
          />
          <Select
            label="Route"
            value={route}
            options={[
              { value: '', label: 'Every route' },
              ...routes.map((value) => ({ value, label: value })),
            ]}
            onChange={(event) => setRoute(event.target.value)}
          />
        </div>
      </Card>

      <Card title={`How the site feels, ${windowLabel(Number(days))}`}>
        <div className="kit-grid">
          {verdicts.map((verdict) => (
            <div key={verdict.metric} className="kit-card">
              <div className="kit-row" style={{ justifyContent: 'space-between' }}>
                <strong>{VITAL_SPECS[verdict.metric].label}</strong>
                <Badge tone={ratingTone(verdict.rating)}>{verdict.rating}</Badge>
              </div>
              <p style={{ fontSize: '1.4rem', margin: 'var(--sp-2) 0' }}>
                {formatVital(verdict.metric, verdict.p75)}
              </p>
              <p className="kit-small kit-muted" style={{ margin: 0 }}>
                {verdict.sentence}
              </p>
              <p className="kit-small kit-muted" style={{ margin: 0 }}>
                Target: {targetLabel(verdict.metric)}. {verdict.samples.toLocaleString('en-GB')}{' '}
                measurements.
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card title={`${spec.label} over time`} description={direction.sentence}>
        {line === '' ? (
          <Empty>Not enough days with measurements to draw a line.</Empty>
        ) : (
          <>
            <svg
              viewBox="0 0 640 64"
              width="100%"
              height="64"
              role="img"
              aria-label={`${spec.label} at the 75th percentile, ${windowLabel(Number(days))}`}
              preserveAspectRatio="none"
            >
              <path d={line} fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            <p className="kit-small kit-muted">
              {bounds.from} to {bounds.to}. Worst day — {bounds.peak}. A break in the line is a day
              nobody was measured.
            </p>
          </>
        )}
      </Card>

      <Card
        title="Slowest routes"
        description={`By ${spec.metric}, among routes with enough measurements to judge.`}
        actions={
          <Button
            variant="quiet"
            onClick={() => download(`vitals-${app}-${days}d.csv`, summaryCsv(summary), 'text/csv')}
          >
            Export CSV
          </Button>
        }
      >
        {worstRoutes(summary, chosen).length === 0 ? (
          <Empty>No route has twenty measurements of {spec.metric} yet.</Empty>
        ) : (
          <Table
            caption={`Worst ${spec.metric} by route`}
            head={['Route', 'p75', 'p95', 'Samples']}
          >
            {worstRoutes(summary, chosen).map((row) => (
              <tr key={`${row.route}-${row.metric}`}>
                <td className="kit-mono">{row.route}</td>
                <td>
                  <Badge tone={ratingTone(row.rating as 'good' | 'fair' | 'poor')}>
                    {formatVital(row.metric, row.p75)}
                  </Badge>
                </td>
                <td>{formatVital(row.metric, row.p95)}</td>
                <td>{row.samples}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card
        title="Every measurement"
        description="A route with fewer than twenty samples is marked."
      >
        {filtered.length === 0 ? (
          <Empty>Nothing has been measured in this window.</Empty>
        ) : (
          <Table
            caption="Field measurements"
            head={['Route', 'Metric', 'p75', 'p95', 'Samples', '']}
          >
            {filtered.map((row) => (
              <tr key={`${row.route}-${row.metric}`}>
                <td className="kit-mono">{row.route}</td>
                <td>{row.metric}</td>
                <td>{formatVital(row.metric, row.p75)}</td>
                <td>{formatVital(row.metric, row.p95)}</td>
                <td>{row.samples}</td>
                <td>
                  {isTrustworthy(row) ? (
                    <Badge tone={ratingTone(row.rating as 'good' | 'fair' | 'poor')}>
                      {row.rating}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">too few to judge</Badge>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Capacity">
        <p>{forecastSentence(forecast)}</p>
      </Card>
    </div>
  );
}

function Edge(): ReactElement {
  const env = useCorporateEnv();
  const [days, setDays] = useState('7');
  const load = useCallback(
    () => listRpc<EdgeRow>(env, 'edge_latency', { p_days: Number(days) }),
    [env, days],
  );
  const { state } = useAsync(load, [env, days]);

  if (state.status === 'loading') return <Loading label="Reading edge timings." />;
  if (state.status === 'error')
    return (
      <Banner tone="bad" title="Timings did not load">
        {state.message}
      </Banner>
    );

  return (
    <div className="kit-stack">
      <Card title="Pages Functions" description="Measured at the edge, not in a browser.">
        <Select
          label="Period"
          value={days}
          options={WINDOWS.map((option) => ({ value: option.value, label: option.label }))}
          onChange={(event) => setDays(event.target.value)}
        />
        {state.data.length === 0 ? (
          <Empty>No function has been called in this window.</Empty>
        ) : (
          <Table caption="Edge latency" head={['Endpoint', 'Calls', 'p50', 'p95', 'Failing', '']}>
            {state.data.map((row) => (
              <tr key={row.endpoint}>
                <td className="kit-mono">{row.endpoint}</td>
                <td>{row.calls.toLocaleString('en-GB')}</td>
                <td>{formatVital('TTFB', row.p50)}</td>
                <td>{formatVital('TTFB', row.p95)}</td>
                <td>
                  <Badge tone={(row.error_rate ?? 0) >= 1 ? 'bad' : 'ok'}>
                    {(row.error_rate ?? 0).toFixed(2)}%
                  </Badge>
                </td>
                <td className="kit-small kit-muted">{edgeNote(row)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function Errors(): ReactElement {
  const env = useCorporateEnv();
  const [days, setDays] = useState('7');
  const [includeResolved, setIncludeResolved] = useState('no');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      listRpc<ErrorRow>(env, 'error_board', {
        p_days: Number(days),
        p_include_resolved: includeResolved === 'yes',
      }),
    [env, days, includeResolved],
  );
  const { state, reload } = useAsync(load, [env, days, includeResolved]);

  const resolve = (fingerprint: string): void => {
    setBusy(true);
    setError('');
    void (async () => {
      try {
        await callRpc<boolean>(env, 'resolve_client_error', { p_fingerprint: fingerprint });
        reload();
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(false);
      }
    })();
  };

  if (state.status === 'loading') return <Loading label="Reading the error board." />;
  if (state.status === 'error')
    return (
      <Banner tone="bad" title="The error board did not load">
        {state.message}
      </Banner>
    );

  const rows = sortErrors(state.data);

  return (
    <div className="kit-stack">
      {error !== '' && (
        <Banner tone="bad" title="That did not work">
          {error}
        </Banner>
      )}
      <Card
        title="What is breaking in the browser"
        description="Grouped by fingerprint: a hundred copies of one fault is one piece of work."
      >
        <div className="kit-grid">
          <Select
            label="Period"
            value={days}
            options={WINDOWS.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(event) => setDays(event.target.value)}
          />
          <Select
            label="Closed faults"
            value={includeResolved}
            options={[
              { value: 'no', label: 'Hide closed' },
              { value: 'yes', label: 'Show closed' },
            ]}
            onChange={(event) => setIncludeResolved(event.target.value)}
          />
        </div>
        {rows.length === 0 ? (
          <Empty>Nothing has failed in this window.</Empty>
        ) : (
          <Table caption="Client errors" head={['Fault', 'Route', 'Rate', 'Total', 'Build', '']}>
            {rows.map((row) => (
              <tr key={row.fingerprint}>
                <td>
                  <strong>{row.name}</strong>
                  <br />
                  <span className="kit-small kit-muted">{shortMessage(row)}</span>
                </td>
                <td className="kit-mono">{row.route}</td>
                <td>{errorRate(row)}</td>
                <td>{row.occurrences.toLocaleString('en-GB')}</td>
                <td className="kit-mono kit-small">{row.build === '' ? '—' : row.build}</td>
                <td>
                  {row.is_resolved ? (
                    <Badge tone="ok">closed</Badge>
                  ) : (
                    <Button
                      size="small"
                      variant="quiet"
                      disabled={busy}
                      onClick={() => resolve(row.fingerprint)}
                    >
                      Close
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

function Weight(): ReactElement {
  const env = useCorporateEnv();
  const [app, setApp] = useState('main-site');
  const load = useCallback(
    () => listRpc<BundlePoint>(env, 'bundle_history', { p_app: app, p_limit: 30 }),
    [env, app],
  );
  const { state } = useAsync(load, [env, app]);

  if (state.status === 'loading') return <Loading label="Reading build history." />;
  if (state.status === 'error')
    return (
      <Banner tone="bad" title="Build history did not load">
        {state.message}
      </Banner>
    );

  const latest = state.data[0];

  return (
    <div className="kit-stack">
      <Card
        title="What the build weighs"
        description="Recorded by continuous integration after every successful build, because a regression here becomes a regression in the field three weeks later."
      >
        <Select
          label="Application"
          value={app}
          options={APPS.map((option) => ({ value: option.id, label: option.label }))}
          onChange={(event) => setApp(event.target.value)}
        />
        {latest && (
          <Banner
            tone={latest.bytes_gzip > latest.budget_gzip ? 'bad' : 'ok'}
            title={bundleVerdict(latest)}
          >
            <p className="kit-small" style={{ margin: 0 }}>
              {budgetShare(latest.bytes_gzip, latest.budget_gzip)} of initial JavaScript, gzipped.
            </p>
          </Banner>
        )}
        {state.data.length === 0 ? (
          <Empty>No build of this application has reported its size yet.</Empty>
        ) : (
          <Table caption="Bundle size history" head={['Recorded', 'Commit', 'Size', 'Change']}>
            {state.data.map((point) => (
              <tr key={`${point.recorded_at}-${point.commit_sha}`}>
                <td>{point.recorded_at.slice(0, 10)}</td>
                <td className="kit-mono kit-small">
                  {point.commit_sha === '' ? '—' : point.commit_sha.slice(0, 7)}
                </td>
                <td>{budgetShare(point.bytes_gzip, point.budget_gzip)}</td>
                <td className="kit-small kit-muted">{bundleVerdict(point)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
