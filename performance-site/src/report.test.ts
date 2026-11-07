import { describe, expect, it } from 'vitest';
import { REPORT_HASH_MARKER, sealReportPdf, verifyReportPdf, type CorporateEnv } from '@kit';
import { buildPerformanceReportPdf, reportVerificationUrl } from './report-pdf';
import { loadReportData, reportProblems, type ReportData, type ReportOptions } from './report-data';

const options: ReportOptions = {
  title: 'November performance',
  app: 'main-site',
  days: 28,
  metric: 'CLS',
  sections: ['overall', 'routes', 'trend', 'edge', 'errors', 'bundle', 'forecast'],
  rowLimit: 10,
  accent: '#1b4332',
  note: 'Private note, not registry metadata.',
};
const data: ReportData = {
  overall: [{ metric: 'CLS', samples: 100, p75: 0.08, p95: 0.2 }],
  routes: [{ route: '/home', metric: 'CLS', samples: 100, p75: 0.08, p95: 0.2, rating: 'good' }],
  trend: [{ day: '2026-11-05', samples: 100, p75: 0.08, mobile_p75: 0.1, desktop_p75: 0.05 }],
  edge: [{ endpoint: '/api/status', calls: 3, p50: 12, p95: 40, error_rate: 0 }],
  errors: [
    {
      fingerprint: 'a',
      name: 'TypeError',
      message: 'private error detail',
      route: '/',
      build: '',
      occurrences: 12,
      first_seen: '2026-01-01',
      last_seen: '2026-11-05',
      is_resolved: false,
    },
  ],
  bundles: [
    {
      recorded_at: '2026-11-05T00:00:00Z',
      commit_sha: 'abc123',
      bytes_gzip: 100000,
      budget_gzip: 256000,
      delta_bytes: null,
    },
  ],
  bundleSourceCount: 1,
  forecast: null,
};
const receipt = {
  receipt_id: '12345678-1234-4234-8234-123456789abc',
  generated_at: '2026-11-07T12:00:00Z',
};
const env: CorporateEnv = {
  appId: 'bsdc-perf',
  appName: 'Performance',
  siteUrl: 'https://www.bsdc.info.bd',
  verificationUrl: 'https://vf.main.bsdc.info.bd',
  firebase: { apiKey: '', authDomain: '', projectId: '', appId: '', databaseURL: '' },
  supabase: { url: '', publishableKey: '' },
};

describe('report configuration and data', () => {
  it('requires a title, bounded period and at least one section', () => {
    expect(reportProblems(options)).toEqual([]);
    expect(reportProblems({ ...options, title: '', days: 91, sections: [] })).toHaveLength(3);
  });

  it('requests only selected real sources and filters build dates', async () => {
    const calls: string[] = [];
    const reader = async <T>(_env: CorporateEnv, name: string): Promise<readonly T[]> => {
      calls.push(name);
      return (
        name === 'bundle_history'
          ? [data.bundles[0], { ...data.bundles[0], recorded_at: '2026-01-01T00:00:00Z' }]
          : data.overall
      ) as readonly T[];
    };
    const result = await loadReportData(
      env,
      { ...options, sections: ['overall', 'bundle'] },
      reader,
      new Date('2026-11-07T00:00:00Z'),
    );
    expect(calls).toEqual(['performance_vitals_overall', 'bundle_history']);
    expect(result.bundles).toHaveLength(1);
    expect(result.overall).toEqual(data.overall);
  });

  it('does not turn a failed source into a zero-valued report', async () => {
    await expect(
      loadReportData(env, options, async () => {
        throw new Error('offline');
      }),
    ).rejects.toThrow('offline');
  });
});

describe('the downloadable report', () => {
  it('prints the requested real values and distinguishes all-app error counts', async () => {
    const bytes = buildPerformanceReportPdf(options, data, receipt, env.verificationUrl);
    const raw = new TextDecoder().decode(bytes);
    expect(raw).toContain('November performance');
    expect(raw).toContain('0.080');
    expect(raw).toContain('/api/status');
    expect(raw).toContain('lifetime occurrences');
    expect(raw).not.toContain('private error detail');
    expect(raw).toContain(receipt.receipt_id);
    expect(raw.match(new RegExp(REPORT_HASH_MARKER, 'g'))).toHaveLength(1);
    const sealed = await sealReportPdf(bytes);
    expect(await verifyReportPdf(sealed.bytes, sealed.sha256)).toBe(true);
    const tampered = Uint8Array.from(sealed.bytes);
    tampered[100] = (tampered[100] ?? 0) ^ 1;
    expect(await verifyReportPdf(tampered, sealed.sha256)).toBe(false);
  });

  it('does not label a small route sample as good', () => {
    const raw = new TextDecoder().decode(
      buildPerformanceReportPdf(
        options,
        {
          ...data,
          routes: [{ ...data.routes[0]!, samples: 5 }],
        },
        receipt,
        env.verificationUrl,
      ),
    );
    expect(raw).toContain('n=5 | too few to judge');
    expect(raw).not.toContain('n=5 | good');
  });

  it('omits unchecked sections rather than claiming they were measured', () => {
    const raw = new TextDecoder().decode(
      buildPerformanceReportPdf(
        { ...options, sections: ['edge'] },
        data,
        receipt,
        env.verificationUrl,
      ),
    );
    expect(raw).toContain('Edge latency');
    expect(raw).not.toContain('Application-wide vitals');
    expect(raw).not.toContain('Recent client errors');
  });

  it('keeps long content on multiple branded pages', () => {
    const rows = Array.from({ length: 90 }, (_, i) => ({
      ...data.trend[0]!,
      day: `day${String(i)}`,
    }));
    const raw = new TextDecoder().decode(
      buildPerformanceReportPdf(options, { ...data, trend: rows }, receipt, env.verificationUrl),
    );
    expect(raw.match(/\/Type \/Page\b/g)?.length ?? 0).toBeGreaterThan(1);
    expect(raw).toContain('day89');
    expect(raw.match(/PERFORMANCE REPORT/g)?.length ?? 0).toBeGreaterThan(1);
  });

  it('points its QR at the public report receipt, not a made-up document code', () => {
    expect(reportVerificationUrl(`${env.verificationUrl}/`, receipt.receipt_id)).toBe(
      `${env.verificationUrl}/?report=${receipt.receipt_id}`,
    );
  });
});
