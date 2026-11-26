import { useCallback, useState, type ReactElement } from 'react';
import {
  Banner,
  Button,
  Card,
  KpiTile,
  Loading,
  listRpc,
  rowsToCsv,
  useAsync,
  useCorporateEnv,
  useToast,
} from '@kit';
import {
  deltaArrow,
  formatValue,
  freshness,
  isAlarming,
  needsAttention,
  orderMetrics,
  pageFreshness,
  provenance,
  type MetricRow,
} from './telemetry';

/**
 * The telemetry panel: every number with its age, its direction and its source.
 *
 * The three things this screen refuses to do:
 *
 *   * show a number without saying how old it is;
 *   * show a change without saying which way is bad — a rising count of anything is
 *     not automatically a problem, and pretending otherwise teaches a reader to
 *     ignore the panel;
 *   * show a number without naming where it came from, because the first question
 *     when a number looks wrong is "where does this come from" and it should cost
 *     one glance.
 *
 * A stale page says so once at the top rather than on every tile, because the
 * reader needs to know the whole page is old, not to be told fourteen times.
 */
export function Telemetry(): ReactElement {
  const env = useCorporateEnv();
  const { success } = useToast();
  const [windowMinutes, setWindowMinutes] = useState(60);

  const load = useCallback(
    () => listRpc<MetricRow>(env, 'admin_telemetry_delta', { p_window_minutes: windowMinutes }),
    [env, windowMinutes],
  );
  const { state, reload } = useAsync(load, [env, windowMinutes]);

  const rows = state.status === 'ready' ? state.data : [];
  const now = new Date();
  const page = pageFreshness(rows, now);

  const copyCsv = useCallback(() => {
    const csv = rowsToCsv(
      ['key', 'label', 'current', 'previous', 'delta', 'measured_at', 'source'],
      orderMetrics(rows).map((row) => [
        row.key,
        row.label,
        String(row.current_value),
        String(row.previous_value),
        String(row.delta),
        row.measured_at,
        provenance(row),
      ]),
    );
    void navigator.clipboard?.writeText(csv).then(
      () => {
        success('The page is on your clipboard as CSV, with its source and its age.');
      },
      () => {
        /* A clipboard refusal is not worth a banner; the table is on screen. */
      },
    );
  }, [rows, success]);

  return (
    <div className="kit-stack">
      <Banner
        tone={page.stale ? 'warn' : 'neutral'}
        title={
          page.stale ? `These numbers are ${page.label}` : 'Every number here says how old it is'
        }
      >
        <p className="kit-small">
          {page.stale
            ? 'The page has not been measured recently enough to compare one row with another. Read again before acting on any of it.'
            : 'A count without an age and a comparison cannot answer the question you are asking, which is whether this is normal. Each tile carries the moment it was measured, how it moved against the preceding window of the same length, and where it came from.'}
        </p>
        <div className="kit-row">
          <Button size="small" variant="quiet" onClick={reload}>
            Read again
          </Button>
          {[15, 60, 360, 1440].map((minutes) => (
            <Button
              key={minutes}
              size="small"
              variant={windowMinutes === minutes ? 'primary' : 'quiet'}
              onClick={() => {
                setWindowMinutes(minutes);
              }}
            >
              {minutes === 15
                ? '15 min'
                : minutes === 60
                  ? '1 hour'
                  : minutes === 360
                    ? '6 hours'
                    : '1 day'}
            </Button>
          ))}
          <Button size="small" variant="quiet" onClick={copyCsv}>
            Copy as CSV
          </Button>
        </div>
      </Banner>

      {state.status === 'loading' && <Loading label="Measuring every number twice." />}
      {state.status === 'error' && (
        <Banner tone="bad" title="Telemetry could not be read">
          <p className="kit-small">{state.message}</p>
          <p className="kit-small">
            This screen needs <code>audit.read</code>.
          </p>
        </Banner>
      )}

      {state.status === 'ready' && (
        <>
          <Card
            title={`${String(rows.length)} measurements over the last ${String(windowMinutes)} minutes`}
            description="Alarming first, then whatever moved. The arrow shows direction, not judgement: whether a rise is bad is the metric's own business."
          >
            <div className="kit-grid kit-grid--kpi">
              {orderMetrics(rows).map((row) => (
                <KpiTile
                  key={row.key}
                  label={row.label}
                  value={formatValue(row.current_value, row.unit)}
                  tone={isAlarming(row) ? 'bad' : needsAttention(row) ? 'warn' : 'neutral'}
                  badge={`${deltaArrow(row.delta)} ${row.delta > 0 ? '+' : ''}${String(row.delta)}`}
                  detail={`${provenance(row)} · measured ${freshness(row.measured_at, now).label}`}
                />
              ))}
            </div>
          </Card>

          <Card
            title="What each number means"
            description="The definition a reader can check the count against, and the way it is computed. A number whose definition nobody can read is a number nobody can argue with."
          >
            <div className="kit-table-wrap">
              <table className="kit-table">
                <caption className="kit-small">Metric definitions</caption>
                <thead>
                  <tr>
                    <th scope="col">Number</th>
                    <th scope="col">What it counts</th>
                    <th scope="col">Source</th>
                    <th scope="col">Wrong way</th>
                    <th scope="col">Threshold</th>
                  </tr>
                </thead>
                <tbody>
                  {orderMetrics(rows).map((row) => (
                    <tr key={row.key}>
                      <th scope="row">{row.label}</th>
                      <td>{row.key}</td>
                      <td>
                        <code>{provenance(row)}</code>
                      </td>
                      <td>
                        {row.direction === 'up_is_bad'
                          ? 'rising'
                          : row.direction === 'up_is_good'
                            ? 'falling'
                            : 'no direction: read it'}
                      </td>
                      <td>
                        {row.alert_above === null ? 'none' : `above ${String(row.alert_above)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
