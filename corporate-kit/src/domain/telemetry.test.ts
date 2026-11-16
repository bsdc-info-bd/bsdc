import { describe, expect, it } from 'vitest';
import {
  buildTelemetrySignals,
  computeFieldDiff,
  csvCell,
  relativeTimeLabel,
  rowsToCsv,
  type TelemetrySnapshot,
} from './telemetry';

const sample: TelemetrySnapshot = {
  staff_active: 14,
  issued_certificates: 120,
  revoked_certificates: 3,
  live_notices: 5,
  draft_notices: 2,
  active_ip_rules: 8,
  custom_pages_live: 4,
  seo_overrides_count: 11,
  redirects_count: 6,
  unresolved_errors: 4,
  open_incidents: 1,
  audit_events_24h: 49,
};

describe('telemetry & audit helpers', () => {
  it('builds actionable cross-portal signals with accurate tones', () => {
    const signals = buildTelemetrySignals(sample);
    expect(signals.find((s) => s.id === 'incidents')?.tone).toBe('bad');
    expect(signals.find((s) => s.id === 'errors')?.tone).toBe('warn');
    expect(signals.find((s) => s.id === 'certificates')?.detail).toContain('3 revoked');
  });

  it('computes ordered field-level revision diffs', () => {
    const diff = computeFieldDiff(
      { recipient: 'Rahim', title: 'Track A', date: '2026-01-01' },
      { recipient: 'Rahim Uddin', title: 'Track A', date: '2026-01-02' },
      ['recipient', 'title', 'date'],
    );
    expect(diff).toEqual([
      { field: 'recipient', before: 'Rahim', after: 'Rahim Uddin', changed: true },
      { field: 'title', before: 'Track A', after: 'Track A', changed: false },
      { field: 'date', before: '2026-01-01', after: '2026-01-02', changed: true },
    ]);
  });

  it('escapes formula injection and commas in CSV output', () => {
    expect(csvCell('=cmd()')).toBe(`"'=cmd()"`);
    expect(csvCell('Hello, "BSDC"')).toBe(`"Hello, ""BSDC"""`);
    const csv = rowsToCsv(['code', 'recipient'], [['BSDC-CT-1', 'Ayesha']]);
    expect(csv).toBe('"code","recipient"\n"BSDC-CT-1","Ayesha"');
  });

  it('formats relative time cleanly', () => {
    const now = Date.parse('2026-11-11T12:00:00Z');
    expect(relativeTimeLabel('2026-11-11T11:59:45Z', now)).toBe('just now');
    expect(relativeTimeLabel('2026-11-11T11:30:00Z', now)).toBe('30m ago');
    expect(relativeTimeLabel('2026-11-11T09:00:00Z', now)).toBe('3h ago');
    expect(relativeTimeLabel('2026-11-08T12:00:00Z', now)).toBe('3d ago');
  });
});
