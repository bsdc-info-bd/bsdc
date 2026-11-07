import {
  BRAND_MARK,
  PdfDocument,
  downloadPdf,
  hexToRgb,
  markGeometry,
  pdfText,
  textWidth,
  wordmarkLayout,
  wrapText,
  type Rgb,
} from '@kit/pdf';
import {
  REPORT_HASH_PLACEHOLDER,
  VITAL_SPECS,
  forecastSentence,
  formatVital,
  isTrustworthy,
  kilobytes,
  overallVerdicts,
  qrMatrix,
} from '@kit';
import { APPS } from './model';
import type { ReportData, ReportOptions, ReportSection } from './report-data';

export interface ReportReceipt {
  readonly receipt_id: string;
  readonly generated_at: string;
}

export function reportVerificationUrl(base: string, receipt: string): string {
  return `${base.replace(/\/+$/, '')}/?report=${encodeURIComponent(receipt)}`;
}

/** A branded A4 report. Data is supplied by the real, permissioned RPCs. */
export function buildPerformanceReportPdf(
  options: ReportOptions,
  data: ReportData,
  receipt: ReportReceipt,
  verificationBase: string,
): Uint8Array {
  const doc = new PdfDocument(options.title.trim(), 'portrait', 48);
  const ink: Rgb = hexToRgb(options.accent);
  const muted: Rgb = [0.34, 0.4, 0.37];
  const accent: Rgb = ink.map((part) => part + (1 - part) * 0.15) as unknown as Rgb;
  const appLabel = APPS.find((item) => item.id === options.app)?.label ?? options.app;
  const stamp = new Date(receipt.generated_at);
  if (!Number.isFinite(stamp.getTime()))
    throw new Error('The report receipt has an invalid timestamp.');
  const issued = stamp
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, ' UTC');
  let page = 1;

  const decorate = (): void => {
    doc.rect(0, doc.height - 77, doc.width, 77, ink);
    const brand = wordmarkLayout({ x: doc.margin, y: doc.height - 58, width: 0, height: 29 });
    doc.ops(...markGeometry(brand.mark, BRAND_MARK));
    doc.place(brand.title.text, brand.title.x, brand.title.y, {
      size: brand.title.size,
      bold: true,
      colour: [1, 1, 1],
    });
    doc.place(brand.subtitle.text, brand.subtitle.x, brand.subtitle.y, {
      size: brand.subtitle.size,
      bold: true,
      colour: [1, 1, 1],
    });
    const label = 'PERFORMANCE REPORT';
    doc.place(label, doc.width - doc.margin - textWidth(label, 7, true), doc.height - 42, {
      size: 7,
      bold: true,
      colour: [1, 1, 1],
    });
    doc.line(
      { x: doc.margin, y: 51 },
      { x: doc.width - doc.margin, y: 51 },
      { colour: [0.8, 0.84, 0.81] },
    );
    doc.place('BSDC  |  Internal operational data', doc.margin, 35, { size: 7, colour: muted });
    doc.place(`Page ${String(page)}`, doc.width - doc.margin - 35, 35, { size: 7, colour: muted });
    doc.moveTo(doc.height - 100);
  };
  decorate();
  const ensure = (needed: number): void => {
    if (doc.y - needed >= 70) return;
    doc.addPage();
    page += 1;
    decorate();
  };
  const line = (
    value: string,
    options_: { size?: number; bold?: boolean; colour?: Rgb; grey?: number } = {},
  ): void => {
    const size = options_.size ?? 9;
    for (const part of wrapText(pdfText(value), size, doc.contentWidth, options_.bold === true)) {
      ensure(size + 4);
      doc.text(part, { ...options_, size });
    }
  };
  const heading = (value: string, detail?: string): void => {
    ensure(52);
    doc.space(8);
    line(value, { size: 13, bold: true, colour: ink });
    if (detail) line(detail, { size: 8, colour: muted });
    doc.rule({ grey: 0.85 });
  };
  const chosen = (section: ReportSection): boolean => options.sections.includes(section);
  const noRows = (): void =>
    line('No measurements are available for this selection.', { colour: muted });
  const cap = <T>(rows: readonly T[]): readonly T[] => rows.slice(0, options.rowLimit);

  line(options.title.trim(), { size: 23, bold: true, colour: ink });
  doc.space(5);
  line(
    `${appLabel} (${options.app})  |  Last ${String(options.days)} days  |  Generated ${issued}`,
    { size: 9, colour: muted },
  );
  line(
    'Rolling windows are queried separately; daily trends use calendar days. Missing data is not a zero.',
    { size: 8, colour: muted },
  );
  if (options.note.trim() !== '') {
    heading('Report note', 'This note is included in the PDF, not the public verification record.');
    line(options.note.trim());
  }

  if (chosen('overall')) {
    heading(
      'Application-wide vitals',
      'Percentiles are calculated from the underlying observations, not averages of route percentiles.',
    );
    for (const item of overallVerdicts(data.overall)) {
      line(
        `${item.metric} - ${VITAL_SPECS[item.metric].label}: ${formatVital(item.metric, item.p75)} | ${String(item.samples)} measurements | ${item.rating}${item.samples > 0 && item.samples < 20 ? ' (small sample)' : ''}`,
        { bold: true },
      );
    }
  }

  if (chosen('routes')) {
    const rows = [...data.routes].sort(
      (a, b) => b.samples - a.samples || a.route.localeCompare(b.route),
    );
    heading(
      'Route detail',
      `Showing ${String(Math.min(rows.length, options.rowLimit))} of ${String(rows.length)} route/metric rows, busiest first.`,
    );
    if (rows.length === 0) noRows();
    for (const row of cap(rows)) {
      line(
        `${row.route} | ${row.metric} | p75 ${formatVital(row.metric, row.p75)} | p95 ${formatVital(row.metric, row.p95)} | n=${String(row.samples)} | ${isTrustworthy(row) ? row.rating : 'too few to judge'}`,
      );
    }
  }

  if (chosen('trend')) {
    heading(
      `${options.metric} daily trend`,
      'Calendar days; a dash means there were no measurements.',
    );
    if (data.trend.length === 0) noRows();
    for (const point of data.trend) {
      line(
        `${point.day} | n=${String(point.samples)} | p75 ${formatVital(options.metric, point.p75)} | mobile ${formatVital(options.metric, point.mobile_p75)} | desktop ${formatVital(options.metric, point.desktop_p75)}`,
        { size: 8.5 },
      );
    }
  }

  if (chosen('edge')) {
    heading(
      'Edge latency',
      `Selected app only. Showing ${String(Math.min(data.edge.length, options.rowLimit))} of ${String(data.edge.length)} endpoints.`,
    );
    if (data.edge.length === 0) noRows();
    for (const row of cap(data.edge)) {
      line(
        `${row.endpoint} | calls ${String(row.calls)} | p50 ${formatVital('TTFB', row.p50)} | p95 ${formatVital('TTFB', row.p95)} | 5xx ${row.error_rate === null ? 'n/a' : `${row.error_rate.toFixed(2)}%`}`,
      );
    }
  }

  if (chosen('errors')) {
    heading(
      'Recent client errors - all apps',
      `Last seen in this window; occurrence counts are lifetime totals, not window totals. Showing ${String(Math.min(data.errors.length, options.rowLimit))} of ${String(data.errors.length)}.`,
    );
    if (data.errors.length === 0) noRows();
    for (const row of cap(data.errors)) {
      line(
        `${row.name} | ${row.route} | ${String(row.occurrences)} lifetime occurrences | last ${row.last_seen.slice(0, 10)} | ${row.is_resolved ? 'closed' : 'open'}`,
      );
    }
  }

  if (chosen('bundle')) {
    heading(
      'Bundle history',
      `Selected app; total emitted JS gzip, not initial download, within the rolling window. At most the latest 365 builds are fetched; showing ${String(Math.min(data.bundles.length, options.rowLimit))} of ${String(data.bundles.length)}${data.bundleSourceCount === 365 ? ' (source limit reached)' : ''}.`,
    );
    if (data.bundles.length === 0) noRows();
    for (const row of cap(data.bundles)) {
      line(
        `${row.recorded_at.slice(0, 10)} | ${row.commit_sha.slice(0, 12) || 'no commit'} | ${kilobytes(row.bytes_gzip)} gzip | budget ${kilobytes(row.budget_gzip)}`,
      );
    }
  }

  if (chosen('forecast')) {
    heading(
      'Measurement-volume projection - all apps',
      'A projection of vital measurements, not visitors or server capacity.',
    );
    line(forecastSentence(data.forecast));
  }

  // One marker in the whole PDF. After serialization its fixed-width zeroes
  // are replaced with the hash of all normalized bytes, preserving xref offsets.
  ensure(150);
  doc.space(8);
  line('Verify this exact PDF', { size: 13, bold: true, colour: ink });
  const qrTop = doc.y - 8;
  const qrSize = 68;
  const qrX = doc.margin;
  const qrY = qrTop - qrSize;
  const url = reportVerificationUrl(verificationBase, receipt.receipt_id);
  doc.rect(qrX - 9, qrY - 9, qrSize + 18, qrSize + 18, [1, 1, 1]);
  doc.qr(qrMatrix(url), qrX, qrY, qrSize);
  const labelX = qrX + qrSize + 14;
  doc.place('SCAN TO CHECK THE REGISTRY', labelX, qrTop - 9, {
    size: 7,
    bold: true,
    colour: accent,
  });
  doc.place(receipt.receipt_id, labelX, qrTop - 24, { size: 8.5, bold: true, colour: ink });
  doc.place(url.replace(/^https?:\/\//, ''), labelX, qrTop - 39, { size: 6.6, colour: muted });
  doc.place('Upload this PDF at the desk to check every byte.', labelX, qrTop - 53, {
    size: 7,
    colour: muted,
  });
  doc.place(REPORT_HASH_PLACEHOLDER, doc.margin, qrY - 19, { size: 5.4, colour: muted });
  return doc.build();
}

/** Download only after the registry has finalized the matching digest. */
export function downloadPerformanceReport(bytes: Uint8Array, app: string, receiptId: string): void {
  downloadPdf(bytes, `bsdc-performance-${app}-${receiptId}.pdf`);
}
