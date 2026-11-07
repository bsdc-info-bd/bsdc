import { useState, type ReactElement } from 'react';
import {
  Banner,
  Button,
  Card,
  Field,
  Select,
  TextArea,
  callRpc,
  messageOf,
  sealReportPdf,
  useCorporateEnv,
} from '@kit';
import { APPS, metricFromValue, metricOptions } from './model';
import {
  REPORT_SECTIONS,
  loadReportData,
  reportProblems,
  type ReportOptions,
  type ReportSection,
} from './report-data';
import type { ReportReceipt } from './report-pdf';

export function Reports(): ReactElement {
  const env = useCorporateEnv();
  const [title, setTitle] = useState('BSDC performance report');
  const [app, setApp] = useState('main-site');
  const [days, setDays] = useState('28');
  const [metric, setMetric] = useState('LCP');
  const [rowLimit, setRowLimit] = useState('25');
  const [accent, setAccent] = useState('#1b4332');
  const [note, setNote] = useState('');
  const [sections, setSections] = useState<readonly ReportSection[]>([
    'overall',
    'routes',
    'trend',
    'edge',
    'bundle',
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verification, setVerification] = useState('');

  const options: ReportOptions = {
    title: title.trim(),
    app,
    days: Number(days),
    metric: metricFromValue(metric),
    rowLimit: Number(rowLimit),
    accent,
    note,
    sections,
  };
  const problems = reportProblems(options);

  const toggle = (id: ReportSection, checked: boolean): void => {
    setSections((current) =>
      checked ? [...current, id] : current.filter((section) => section !== id),
    );
  };

  const create = async (): Promise<void> => {
    if (problems.length > 0 || busy) return;
    setBusy(true);
    setError('');
    setVerification('');
    try {
      const data = await loadReportData(env, options);
      const rows = await callRpc<ReportReceipt[]>(env, 'start_performance_report', {
        p_app: options.app,
        p_days: options.days,
        p_title: options.title,
        p_sections: [...options.sections],
      });
      const receipt = rows[0];
      if (!receipt) throw new Error('The registry did not allocate a report receipt.');
      // The font and PDF engine are loaded only when a report is requested.
      const pdf = await import('./report-pdf');
      const unsigned = pdf.buildPerformanceReportPdf(options, data, receipt, env.verificationUrl);
      const sealed = await sealReportPdf(unsigned);
      const finalized = await callRpc<boolean>(env, 'finalize_performance_report', {
        p_id: receipt.receipt_id,
        p_sha256: sealed.sha256,
      });
      if (!finalized) throw new Error('The registry did not finalize this report.');
      pdf.downloadPerformanceReport(sealed.bytes, options.app, receipt.receipt_id);
      setVerification(pdf.reportVerificationUrl(env.verificationUrl, receipt.receipt_id));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="kit-stack">
      <Card
        title="Build a performance report"
        description="Choose real data, a rolling period and the sections to include. The PDF is registered before it is downloaded."
      >
        <div className="kit-grid kit-grid--2">
          <Field
            label="Report title"
            value={title}
            maxLength={100}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Select
            label="Application"
            value={app}
            options={APPS.map((item) => ({ value: item.id, label: item.label }))}
            onChange={(event) => setApp(event.target.value)}
          />
          <Field
            label="Rolling period (days)"
            type="number"
            min={1}
            max={90}
            step={1}
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
          <Select
            label="Trend metric"
            value={metric}
            options={metricOptions()}
            onChange={(event) => setMetric(event.target.value)}
          />
          <Select
            label="Report theme"
            value={accent}
            options={[
              { value: '#1b4332', label: 'BSDC emerald' },
              { value: '#134e4a', label: 'Deep teal' },
              { value: '#1e3a5f', label: 'Midnight blue' },
            ]}
            onChange={(event) => setAccent(event.target.value)}
          />
          <Select
            label="Maximum rows per detail section"
            value={rowLimit}
            options={[10, 25, 50, 100].map((value) => ({
              value: String(value),
              label: String(value),
            }))}
            onChange={(event) => setRowLimit(event.target.value)}
          />
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 'var(--sp-3) 0' }}>
          <legend>
            <strong>Include sections</strong>
          </legend>
          <div className="kit-grid kit-grid--2">
            {REPORT_SECTIONS.map((section) => (
              <label className="kit-check" key={section.id}>
                <input
                  type="checkbox"
                  checked={sections.includes(section.id)}
                  onChange={(event) => toggle(section.id, event.target.checked)}
                />
                <span>{section.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <TextArea
          label="Private report note (optional)"
          value={note}
          maxLength={600}
          rows={3}
          hint="Printed in the PDF, never sent to the public verification registry."
          onChange={(event) => setNote(event.target.value)}
        />
        <p className="kit-small kit-muted">
          The title, app, period, selected sections and PDF fingerprint are public to anyone with
          the QR link. Measurements and the note are not published. Some apps may not yet have
          collected data.
        </p>
        {problems.length > 0 && (
          <ul className="kit-small">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
        <Button disabled={busy || problems.length > 0} onClick={() => void create()}>
          {busy ? 'Preparing and registering…' : 'Create verified PDF'}
        </Button>
      </Card>
      {error !== '' && (
        <Banner tone="bad" title="The report was not downloaded">
          {error}
        </Banner>
      )}
      {verification !== '' && (
        <Banner tone="ok" title="Report registered and downloaded">
          <p className="kit-small">
            <a href={verification} target="_blank" rel="noopener noreferrer">
              Open its verification record
            </a>
            . Upload the PDF there to check its exact bytes.
          </p>
        </Banner>
      )}
    </div>
  );
}
