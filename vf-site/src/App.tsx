import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  Badge,
  Banner,
  Button,
  Card,
  Field,
  Loading,
  callRpc,
  docKindLabel,
  formatDocCode,
  localRejection,
  messageOf,
  missingConfig,
  parseDocCode,
  stateHeadline,
  stateTone,
  useCorporateEnv,
  type VerificationResult,
} from '@kit';
import { advice, codeFromSearch, pushRecent, resultLines, shareUrl } from './model';

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

  const configured = missingConfig(env).length === 0;

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
      callRpc<VerificationResult[]>(env, 'verify_code', { p_code: parsed.code })
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

  const parsed = parseDocCode(code);

  return (
    <div className="kit-shell">
      <header className="kit-header">
        <div className="kit-brand">
          <strong>BSDC verification</strong>
          <span>Bangladesh Software Development Community</span>
        </div>
      </header>

      <main className="kit-main">
        <div className="kit-stack" style={{ maxWidth: '46rem', margin: '0 auto', width: '100%' }}>
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
      </main>

      <footer className="kit-footer">
        This desk answers about one document at a time and never lists the registry.
      </footer>
    </div>
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

function Explainer(): ReactElement {
  return (
    <div className="kit-grid">
      <Card title="What can be checked">
        <ul className="kit-small">
          <li>Certificates, whose codes begin BSDC-CT.</li>
          <li>Notices, whose codes begin BSDC-NT.</li>
          <li>Staff identity cards, whose codes begin BSDC-ID.</li>
        </ul>
      </Card>
      <Card title="What this page will not tell you">
        <p className="kit-small">
          The answer describes the document and nothing else. A staff card confirms a name and a
          role; it does not reveal a contact detail, an address or anything the holder has not
          already shown you.
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
