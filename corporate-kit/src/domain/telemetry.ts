/**
 * Shared operational telemetry types, diff helpers, CSV/JSON serialization,
 * and keyboard shortcut normalization for all corporate consoles.
 */

export interface TelemetrySnapshot {
  readonly staff_active: number;
  readonly issued_certificates: number;
  readonly revoked_certificates: number;
  readonly live_notices: number;
  readonly draft_notices: number;
  readonly active_ip_rules: number;
  readonly custom_pages_live: number;
  readonly seo_overrides_count: number;
  readonly redirects_count: number;
  readonly unresolved_errors: number;
  readonly open_incidents: number;
  readonly audit_events_24h: number;
}

export interface TelemetrySignal {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly tone: 'ok' | 'warn' | 'bad' | 'neutral';
  readonly targetPortalId: string;
  readonly detail: string;
}

/** Builds cross-portal operational signals from a single RPC snapshot. */
export function buildTelemetrySignals(snapshot: TelemetrySnapshot): readonly TelemetrySignal[] {
  return [
    {
      id: 'incidents',
      label: 'Open incidents',
      value: snapshot.open_incidents,
      tone: snapshot.open_incidents > 0 ? 'bad' : 'ok',
      targetPortalId: 'bsdc-status',
      detail:
        snapshot.open_incidents > 0
          ? 'Active public outage or degraded service'
          : 'All services clean',
    },
    {
      id: 'errors',
      label: 'Client errors',
      value: snapshot.unresolved_errors,
      tone:
        snapshot.unresolved_errors >= 10 ? 'bad' : snapshot.unresolved_errors > 0 ? 'warn' : 'ok',
      targetPortalId: 'bsdc-perf',
      detail:
        snapshot.unresolved_errors > 0
          ? 'Unresolved browser error groups'
          : 'Zero unresolved errors',
    },
    {
      id: 'certificates',
      label: 'Valid certificates',
      value: snapshot.issued_certificates,
      tone: 'neutral',
      targetPortalId: 'bsdc-cert',
      detail: `${String(snapshot.revoked_certificates)} revoked on record`,
    },
    {
      id: 'notices',
      label: 'Live notices',
      value: snapshot.live_notices,
      tone: 'neutral',
      targetPortalId: 'bsdc-notice',
      detail: `${String(snapshot.draft_notices)} drafts awaiting schedule`,
    },
    {
      id: 'ip-rules',
      label: 'Active IP rules',
      value: snapshot.active_ip_rules,
      tone: 'neutral',
      targetPortalId: 'bsdc-ip',
      detail: 'Edge allow, block, and watch rules',
    },
    {
      id: 'staff',
      label: 'Active staff',
      value: snapshot.staff_active,
      tone: 'neutral',
      targetPortalId: 'bsdc-umod',
      detail: `${String(snapshot.audit_events_24h)} audit events in 24h`,
    },
    {
      id: 'pages',
      label: 'Custom pages live',
      value: snapshot.custom_pages_live,
      tone: 'neutral',
      targetPortalId: 'bsdc-custom',
      detail: `${String(snapshot.seo_overrides_count)} SEO overrides · ${String(snapshot.redirects_count)} redirects`,
    },
  ];
}

export interface DiffChange {
  readonly field: string;
  readonly before: string;
  readonly after: string;
  readonly changed: boolean;
}

/** Computes field-level comparison between two string maps (older revision vs newer). */
export function computeFieldDiff(
  previous: Readonly<Record<string, string>>,
  current: Readonly<Record<string, string>>,
  order?: readonly string[],
): readonly DiffChange[] {
  const keys = order
    ? [...order]
    : [...new Set([...Object.keys(previous), ...Object.keys(current)])];
  return keys.map((field) => {
    const before = previous[field] ?? '';
    const after = current[field] ?? '';
    return {
      field,
      before,
      after,
      changed: before !== after,
    };
  });
}

/** Escapes RFC-4180 CSV cells safely (preventing spreadsheet formula injection on display values too). */
export function csvCell(value: unknown): string {
  const raw =
    value === null || value === undefined ? '' : String(value as string | number | boolean);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Serializes tabular records cleanly into downloadable UTF-8 CSV. */
export function rowsToCsv(
  headers: readonly string[],
  rows: ReadonlyArray<readonly unknown[]>,
): string {
  const head = headers.map(csvCell).join(',');
  const body = rows.map((row) => row.map(csvCell).join(','));
  return [head, ...body].join('\n');
}

/** Formats relative timestamps cleanly for activity feeds and audit drawers. */
export function relativeTimeLabel(iso: string, now = Date.now()): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '—';
  const sec = Math.max(0, Math.floor((now - ts) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${String(min)}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${String(hrs)}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${String(days)}d ago`;
  return new Date(ts).toISOString().slice(0, 10);
}
