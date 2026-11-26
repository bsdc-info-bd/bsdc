import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Badge,
  Banner,
  Button,
  Card,
  Field,
  Loading,
  PublicShell,
  Table,
  TextArea,
  callPublicRpc,
  docKindLabel,
  formatDocCode,
  localRejection,
  messageOf,
  parseDocCode,
  stateHeadline,
  stateTone,
  useCorporateEnv,
  verifyReportPdf,
  type VerificationResult,
} from '@kit';
import {
  advice,
  allowanceNote,
  allowedOnly,
  batchCsv,
  countBatch,
  parseBatch,
  refusalSentence,
  codeFromSearch,
  pushRecent,
  reportIdFromSearch,
  resultLines,
  shareUrl,
  type Answer,
  type VerifiedReport,
} from './model';

/**
 * The public verification desk.
 *
 * It answers about one document at a time and never lists anything, which
 * is the point: verification must not become enumeration. Nothing here
 * requires a sign-in, because the people who most need to check a document
 * are the ones with no account.
 */
export function App(): ReactElement {
  const env = useCorporateEnv();
  const [code, setCode] = useState(() =>
    typeof window === 'undefined' ? '' : codeFromSearch(window.location.search),
  );
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<readonly string[]>([]);

  const configured = env.supabase.url !== '' && env.supabase.publishableKey !== '';
  const [report, setReport] = useState<VerifiedReport | null>(null);
  const [reportError, setReportError] = useState('');
  const [reportBusy, setReportBusy] = useState(false);

  const check = useCallback(
    (raw: string): void => {
      const rejection = localRejection(raw);
      setError('');
      if (rejection) {
        // A code that fails its own check digit cannot be in the registry,
        // so the desk answers immediately rather than asking the database.
        setResult(rejection);
        return;
      }
      const parsed = parseDocCode(raw);
      if (!parsed.ok) return;
      if (!configured) {
        setError('This portal is not configured for the current deployment.');
        return;
      }
      setBusy(true);
      callPublicRpc<VerificationResult[]>(env, 'verify_code', { p_code: parsed.code })
        .then((rows) => {
          const row = rows[0] ?? null;
          setResult(row);
          setRecent((current) => pushRecent(current, parsed.code));
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', shareUrl(window.location.origin, parsed.code));
          }
        })
        .catch((cause: unknown) => {
          setError(messageOf(cause));
        })
        .finally(() => {
          setBusy(false);
        });
    },
    [env, configured],
  );

  // A QR code lands here with the code already in the address, so the
  // answer should be on screen before anybody touches the keyboard.
  useEffect(() => {
    const initial = typeof window === 'undefined' ? '' : codeFromSearch(window.location.search);
    if (initial !== '') check(initial);
  }, [check]);

  // Report QR codes use an unguessable receipt ID, distinct from document codes.
  useEffect(() => {
    const id = typeof window === 'undefined' ? '' : reportIdFromSearch(window.location.search);
    if (id === '') return;
    if (!configured) {
      setReportError('The verification database is not configured for this deployment.');
      return;
    }
    let active = true;
    setReportBusy(true);
    callPublicRpc<VerifiedReport[]>(env, 'verify_performance_report', { p_id: id })
      .then((rows) => {
        if (!active) return;
        if (rows[0]) setReport(rows[0]);
        else setReportError('No finalized report is registered for this link.');
      })
      .catch((cause: unknown) => {
        if (active) setReportError(messageOf(cause));
      })
      .finally(() => {
        if (active) setReportBusy(false);
      });
    return () => {
      active = false;
    };
  }, [env, configured]);

  const parsed = parseDocCode(code);

  return (
    <PublicShell
      appId="bsdc-vf"
      title="BSDC Verification"
      footerText="This desk answers about one document at a time and never lists the registry."
    >
      <div className="kit-stack" style={{ maxWidth: '46rem', margin: '0 auto', width: '100%' }}>
        {reportBusy && <Loading label="Checking the report receipt." />}
        {reportError !== '' && (
          <Banner tone="bad" title="Report verification unavailable">
            {reportError}
          </Banner>
        )}
        {report && <ReportResult report={report} />}

        <Card
          title="Check a BSDC document"
          description="Certificates, notices and staff identity cards all carry a code. Type it here, or scan the code printed beside it."
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              check(code);
            }}
          >
            <Field
              label="Document code"
              placeholder="BSDC-CT-4A7C21B9-6"
              autoComplete="off"
              spellCheck={false}
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
              }}
              hint={
                code.trim() === ''
                  ? 'The code is printed under the QR square.'
                  : parsed.ok
                    ? `Reads as a ${docKindLabel(parsed.kind).toLowerCase()}.`
                    : ''
              }
            />
            <div className="kit-row" style={{ marginTop: 'var(--sp-3)' }}>
              <Button type="submit" disabled={busy || code.trim() === ''}>
                {busy ? 'Checking' : 'Check this document'}
              </Button>
              {result && (
                <Button
                  variant="quiet"
                  onClick={() => {
                    setCode('');
                    setResult(null);
                    if (typeof window !== 'undefined') {
                      window.history.replaceState(null, '', window.location.pathname);
                    }
                  }}
                >
                  Check another
                </Button>
              )}
            </div>
          </form>
        </Card>

        {error !== '' && (
          <Banner tone="bad" title="The desk could not answer">
            <p className="kit-small">{error}</p>
          </Banner>
        )}

        {busy && <Loading label="Asking the registry." />}

        {result && !busy && <Result result={result} />}

        <Batch />

        {recent.length > 1 && (
          <Card title="Checked from this device">
            <div className="kit-row">
              {recent.map((item) => (
                <Button
                  key={item}
                  size="small"
                  variant="quiet"
                  onClick={() => {
                    setCode(item);
                    check(item);
                  }}
                >
                  {formatDocCode(item)}
                </Button>
              ))}
            </div>
          </Card>
        )}

        <Explainer />
      </div>
    </PublicShell>
  );
}

function ReportResult({ report }: { report: VerifiedReport }): ReactElement {
  const [fileState, setFileState] = useState<'idle' | 'checking' | 'match' | 'mismatch'>('idle');
  const [fileError, setFileError] = useState('');
  const fileCheck = useRef(0);
  useEffect(
    () => () => {
      fileCheck.current += 1;
    },
    [],
  );
  const checkFile = async (file: File | undefined): Promise<void> => {
    const check = ++fileCheck.current;
    setFileError('');
    if (!file) {
      setFileState('idle');
      return;
    }
    setFileState('checking');
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Choose a PDF smaller than 25 MB.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const matches = await verifyReportPdf(bytes, report.sha256);
      if (check === fileCheck.current) setFileState(matches ? 'match' : 'mismatch');
    } catch (cause) {
      if (check !== fileCheck.current) return;
      setFileState('idle');
      setFileError(messageOf(cause));
    }
  };
  const date = new Date(report.generated_at);
  const generated = Number.isNaN(date.getTime())
    ? report.generated_at
    : `${date
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d{3}Z$/, '')} UTC`;
  return (
    <Card
      title="Registered performance report"
      actions={<Badge tone="ok">registered</Badge>}
      description="The registry confirms these details. Upload the PDF to check that every byte matches the issued copy."
    >
      <div className="kit-tablewrap">
        <table className="kit-table">
          <tbody>
            <tr>
              <th scope="row">Title</th>
              <td>{report.title}</td>
            </tr>
            <tr>
              <th scope="row">Application</th>
              <td>{report.app}</td>
            </tr>
            <tr>
              <th scope="row">Period</th>
              <td>{report.days} days</td>
            </tr>
            <tr>
              <th scope="row">Generated</th>
              <td>{generated}</td>
            </tr>
            <tr>
              <th scope="row">Sections</th>
              <td>{report.sections.join(', ')}</td>
            </tr>
            <tr>
              <th scope="row">SHA-256</th>
              <td className="kit-mono kit-small" style={{ overflowWrap: 'anywhere' }}>
                {report.sha256}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <label className="kit-field" style={{ marginTop: 'var(--sp-3)' }}>
        <span>Check the PDF file (stays on this device)</span>
        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={(event) => void checkFile(event.currentTarget.files?.[0])}
        />
      </label>
      {fileState === 'checking' && <Loading label="Checking the PDF fingerprint." />}
      {fileState === 'match' && (
        <Banner tone="ok" title="Exact match">
          The file matches the PDF registered by BSDC.
        </Banner>
      )}
      {fileState === 'mismatch' && (
        <Banner tone="bad" title="File does not match">
          The file differs from the registered PDF or is the wrong report.
        </Banner>
      )}
      {fileError !== '' && (
        <Banner tone="bad" title="The file could not be checked">
          {fileError}
        </Banner>
      )}
    </Card>
  );
}

function Result({ result }: { result: VerificationResult }): ReactElement {
  const tone = stateTone(result.state);
  return (
    <Card
      title={stateHeadline(result)}
      actions={<Badge tone={tone}>{result.state}</Badge>}
      description={result.reason}
    >
      <p className="kit-mono kit-small">{formatDocCode(result.code)}</p>

      {resultLines(result).length > 1 && (
        <div className="kit-tablewrap" style={{ marginTop: 'var(--sp-3)' }}>
          <table className="kit-table">
            <caption
              className="kit-small kit-muted"
              style={{ captionSide: 'top', padding: 'var(--sp-2)' }}
            >
              What the registry holds about this document.
            </caption>
            <tbody>
              {resultLines(result).map((line) => (
                <tr key={line.label}>
                  <th scope="row">{line.label}</th>
                  <td>{line.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="kit-small" style={{ marginTop: 'var(--sp-3)' }}>
        {advice(result)}
      </p>

      {result.verifications > 0 && (
        <p className="kit-hint">
          This document has been checked {result.verifications}{' '}
          {result.verifications === 1 ? 'time' : 'times'}.
        </p>
      )}
    </Card>
  );
}

/**
 * §13.3 — a column of codes, checked in one call.
 *
 * This is the shape the trust desk actually uses: somebody sends a spreadsheet
 * of certificates to confirm before a hiring decision. One call, one file back,
 * and a count that names how many are no longer in force — which is the finding
 * the exercise exists to produce.
 */
function Batch(): ReactElement {
  const env = useCorporateEnv();
  const [raw, setRaw] = useState('');
  const [answers, setAnswers] = useState<readonly Answer[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [refusal, setRefusal] = useState('');
  const [busy, setBusy] = useState(false);

  const codes = parseBatch(raw);
  const count = countBatch(answers);

  const check = (): void => {
    if (codes.length === 0) return;
    setBusy(true);
    setError('');
    setRefusal('');
    callPublicRpc<{ results: Record<string, unknown>[]; remaining: number }>(env, 'verify_public', {
      p_codes: codes,
      p_address: '',
    })
      .then((payload) => {
        setAnswers((payload.results ?? []).map((row) => allowedOnly(row)));
        setRemaining(payload.remaining ?? null);
      })
      .catch((cause: unknown) => {
        const message = messageOf(cause);
        // A refusal is not a verdict about the codes, and the two must not look
        // alike on a page whose whole purpose is to be trusted.
        const refusalText = refusalSentence(message.includes('53400') ? '53400' : null);
        if (refusalText !== '') setRefusal(refusalText);
        else setError(message);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const download = (): void => {
    const blob = new Blob([batchCsv(answers)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bsdc-verification.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="kit-stack">
      <Card
        title="Check a list of documents"
        description="Paste a column of codes, one per line or separated by commas. Up to 200 at a time, and sixty checks an hour from one connection."
      >
        <TextArea
          label="Codes"
          hint={
            codes.length === 0
              ? 'A code looks like BSDC-CT-4A7C21B9-6.'
              : `${String(codes.length)} code${codes.length === 1 ? '' : 's'} read.`
          }
          value={raw}
          onChange={(event) => {
            setRaw(event.target.value);
          }}
        />
        <div className="kit-row" style={{ marginTop: 'var(--sp-3)' }}>
          <Button disabled={busy || codes.length === 0} onClick={check}>
            {busy ? 'Checking' : `Check ${String(codes.length)}`}
          </Button>
          {answers.length > 0 && (
            <Button variant="quiet" onClick={download}>
              Download CSV
            </Button>
          )}
        </div>
        {remaining !== null && allowanceNote(remaining) !== '' && (
          <p className="kit-hint" style={{ marginTop: 'var(--sp-2)' }}>
            {allowanceNote(remaining)}
          </p>
        )}
      </Card>

      {refusal !== '' && (
        <Banner tone="warn" title="The desk is busy">
          <p className="kit-small">{refusal}</p>
        </Banner>
      )}
      {error !== '' && (
        <Banner tone="bad" title="The list could not be checked">
          <p className="kit-small">{error}</p>
        </Banner>
      )}

      {answers.length > 0 && (
        <Card title="Result" description={count.summary}>
          <Table
            caption="In the order the codes were pasted."
            head={['Code', 'Document', 'State', 'Holder or title', 'Reason']}
          >
            {answers.map((answer) => (
              <tr key={answer.code}>
                <td className="kit-mono kit-small">{answer.code}</td>
                <td className="kit-small">{docKindLabel(answer.kind)}</td>
                <td>
                  <Badge tone={answer.state === 'valid' ? 'ok' : answer.found ? 'bad' : 'warn'}>
                    {answer.state === 'valid'
                      ? 'in force'
                      : answer.found
                        ? answer.state
                        : 'not found'}
                  </Badge>
                </td>
                <td className="kit-small">{answer.recipient_name ?? answer.subject ?? '—'}</td>
                <td className="kit-small">{answer.reason === '' ? '—' : answer.reason}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Card title="What this list does and does not say">
        <p className="kit-small">
          Each answer comes from the registry and carries only the fields printed on the document. A
          code that is not in the registry and a document that was withdrawn are different answers,
          and the state column never merges them. Checks are counted in aggregate only: the desk
          records that a check happened and what it found, never who asked.
        </p>
      </Card>
    </div>
  );
}

function Explainer(): ReactElement {
  return (
    <div className="kit-grid">
      <Card title="What can be checked">
        <ul className="kit-small">
          <li>Certificates, whose codes begin BSDC-CT.</li>
          <li>Notices, whose codes begin BSDC-NT.</li>
          <li>Staff identity cards, whose codes begin BSDC-ID.</li>
          <li>Performance reports, by scanning their receipt QR and uploading the PDF.</li>
        </ul>
      </Card>
      <Card title="What this page will not tell you">
        <p className="kit-small">
          For certificates, notices and cards the answer checks the listed registry fields, not
          every line of the file. The answer describes the document and nothing else. A staff card
          confirms a name and a role; it does not reveal a contact detail, an address or anything
          the holder has not already shown you.
        </p>
      </Card>
      <Card title="If a code will not read">
        <p className="kit-small">
          Every code carries a check digit, so one mistyped character is caught here rather than
          returning a confident wrong answer. The letters O and I are never issued: read them as the
          digits 4 and 8.
        </p>
      </Card>
    </div>
  );
}
