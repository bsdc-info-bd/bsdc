import { useCallback, useMemo, useState, type ReactElement } from 'react';
import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  Empty,
  Field,
  Loading,
  Select,
  Table,
  TextArea,
  callRpc,
  downloadPdf,
  formatDocCode,
  listRpc,
  messageOf,
  qrSvg,
  selectRows,
  useAsync,
  useCorporateEnv,
  verificationUrl,
  type CorporateEnv,
} from '@kit';
import {
  EMPTY_DRAFT,
  certificateFilename,
  draftProblems,
  draftToArgs,
  longDate,
  parseBatch,
  registryState,
  resolvedBody,
  type IssueDraft,
  type RegistryRow,
  type TemplateRow,
} from './model';
import { buildCertificatePdf, printFromTemplate } from './certificate-pdf';

/**
 * The certificate generator. A certificate is issued once and never edited:
 * the text is frozen at issue so the copy in somebody's hand and the answer
 * the public desk gives describe the same document. A mistake is revoked,
 * with a reason, and reissued.
 */
export function App(): ReactElement {
  return (
    <AppShell
      minRole="moderator"
      note="Issued certificates are public once their code is shared."
      tabs={[
        { id: 'issue', label: 'Issue', render: () => <Issue /> },
        { id: 'registry', label: 'Registry', render: () => <Registry /> },
      ]}
    />
  );
}

function useTemplates(): ReturnType<typeof useAsync<readonly TemplateRow[]>> {
  const env = useCorporateEnv();
  const load = useCallback(() => selectRows<TemplateRow>(env, 'certificate_templates', '*'), [env]);
  return useAsync(load, [env]);
}

function Issue(): ReactElement {
  const env = useCorporateEnv();
  const templates = useTemplates();
  const [draft, setDraft] = useState<IssueDraft>(EMPTY_DRAFT);
  const [issued, setIssued] = useState<IssuedCertificate | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (templates.state.status === 'loading') return <Loading label="Loading templates." />;
  if (templates.state.status === 'error') {
    return (
      <Banner tone="bad" title="Templates did not load">
        {templates.state.message}
      </Banner>
    );
  }

  const active = templates.state.data.filter((template) => template.is_active);
  const template = active.find((item) => item.key === draft.templateKey) ?? null;
  const problems = draftProblems(draft);
  const body = resolvedBody(draft, template);

  const issue = (): void => {
    if (!template) return;
    setBusy(true);
    setError('');
    callRpc<string>(env, 'issue_certificate', draftToArgs(draft))
      .then((code) => {
        setIssued({
          code,
          template,
          body,
          recipientName: draft.recipientName.trim(),
          issuedOn: draft.issuedOn,
          expiresOn: draft.expiresOn === '' ? null : draft.expiresOn,
        });
        setDraft({ ...EMPTY_DRAFT, templateKey: draft.templateKey });
      })
      .catch((cause: unknown) => {
        setError(messageOf(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const set = (patch: Partial<IssueDraft>): void => {
    setDraft({ ...draft, ...patch });
    setIssued(null);
  };

  return (
    <div className="kit-stack">
      {issued && <IssuedCard issued={issued} env={env} />}

      <Card
        title="Issue a certificate"
        description="The text is frozen at issue and cannot be edited afterwards."
      >
        {error !== '' && (
          <Banner tone="bad" title="The certificate was not issued">
            {error}
          </Banner>
        )}
        <div className="kit-grid">
          <Select
            label="Template"
            hint={template?.purpose ?? 'Each template carries its own heading and wording.'}
            value={draft.templateKey}
            onChange={(event) => {
              set({ templateKey: event.target.value });
            }}
            options={[
              { value: '', label: 'Choose a template' },
              ...active.map((item) => ({ value: item.key, label: item.name })),
            ]}
          />
          <Field
            label="Recipient name"
            hint="Exactly as it should be printed."
            value={draft.recipientName}
            onChange={(event) => {
              set({ recipientName: event.target.value });
            }}
          />
          <Field
            label="What it is for"
            hint="The course, the contribution or the role."
            value={draft.subject}
            onChange={(event) => {
              set({ subject: event.target.value });
            }}
          />
          <Field
            label="Member identifier"
            hint="Optional. Links the certificate to a member account."
            value={draft.recipientUid}
            onChange={(event) => {
              set({ recipientUid: event.target.value });
            }}
          />
          <Field
            label="Issued on"
            type="date"
            value={draft.issuedOn}
            onChange={(event) => {
              set({ issuedOn: event.target.value });
            }}
          />
          <Field
            label="Valid until"
            type="date"
            hint="Leave empty for a certificate that does not expire."
            value={draft.expiresOn}
            onChange={(event) => {
              set({ expiresOn: event.target.value });
            }}
          />
        </div>
        <div style={{ marginTop: 'var(--sp-3)' }}>
          <TextArea
            label="Wording"
            hint="Leave empty to use the template. {recipient}, {subject} and {date} are filled in."
            value={draft.body}
            onChange={(event) => {
              set({ body: event.target.value });
            }}
          />
        </div>

        {template && (
          <div className="kit-card" style={{ marginTop: 'var(--sp-3)', textAlign: 'center' }}>
            <p className="kit-small kit-muted">Preview</p>
            <h3 style={{ color: template.accent }}>{template.heading}</h3>
            <p className="kit-small">This is to certify that</p>
            <p>
              <strong>{draft.recipientName === '' ? 'The recipient' : draft.recipientName}</strong>
            </p>
            <p className="kit-small">{body}</p>
            <p className="kit-hint">
              Issued on {longDate(draft.issuedOn)}
              {draft.expiresOn === '' ? '' : `, valid until ${longDate(draft.expiresOn)}`}
            </p>
          </div>
        )}

        {problems.length > 0 && draft.templateKey !== '' && (
          <ul className="kit-error" style={{ marginTop: 'var(--sp-3)' }}>
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}

        <div className="kit-row" style={{ marginTop: 'var(--sp-3)' }}>
          <Button disabled={busy || problems.length > 0} onClick={issue}>
            {busy ? 'Issuing' : 'Issue certificate'}
          </Button>
        </div>
      </Card>

      <Batch templates={active} />
    </div>
  );
}

type IssuedCertificate = {
  readonly code: string;
  readonly template: TemplateRow;
  readonly body: string;
  readonly recipientName: string;
  readonly issuedOn: string;
  readonly expiresOn: string | null;
};

function IssuedCard({
  issued,
  env,
}: {
  issued: IssuedCertificate;
  env: CorporateEnv;
}): ReactElement {
  const portal = env.siteUrl.replace('www.', 'vf.');
  const url = verificationUrl(portal, issued.code);
  const svg = useMemo(() => qrSvg(url), [url]);

  return (
    <Card title="Certificate issued" description="Download the document or share the code.">
      <div className="kit-row" style={{ alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
        {/* The preview QR is drawn from the same matrix the PDF uses, so the
            code on screen and the code on paper resolve identically. */}
        <div
          style={{ width: '128px', flex: '0 0 auto' }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div>
          <p className="kit-mono">
            <strong>{formatDocCode(issued.code)}</strong>
          </p>
          <p className="kit-small">
            {issued.recipientName} — issued {longDate(issued.issuedOn)}
          </p>
          <p className="kit-small kit-muted">{url}</p>
          <Button
            size="small"
            onClick={() => {
              const bytes = buildCertificatePdf(
                printFromTemplate(issued.template, {
                  code: issued.code,
                  recipientName: issued.recipientName,
                  body: issued.body,
                  issuedOn: issued.issuedOn,
                  expiresOn: issued.expiresOn,
                  siteUrl: portal,
                }),
              );
              downloadPdf(bytes, certificateFilename(issued.code, issued.recipientName));
            }}
          >
            Download PDF
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Batch({ templates }: { templates: readonly TemplateRow[] }): ReactElement {
  const env = useCorporateEnv();
  const [templateKey, setTemplateKey] = useState('');
  const [text, setText] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [done, setDone] = useState<readonly string[]>([]);
  const [failed, setFailed] = useState<readonly string[]>([]);

  const parsed = parseBatch(text);

  const run = (): void => {
    setIssuing(true);
    setDone([]);
    setFailed([]);
    void (async () => {
      const issued: string[] = [];
      const errors: string[] = [];
      for (const row of parsed.rows) {
        try {
          const code = await callRpc<string>(env, 'issue_certificate', {
            p_template_key: templateKey,
            p_recipient_name: row.name,
            p_subject: row.subject,
            p_recipient_uid: null,
            p_issued_on: new Date().toISOString().slice(0, 10),
            p_expires_on: null,
            p_body: '',
          });
          issued.push(`${row.name}: ${code}`);
        } catch (cause: unknown) {
          errors.push(`Line ${String(row.line)} (${row.name}): ${messageOf(cause)}`);
        }
      }
      setDone(issued);
      setFailed(errors);
      setIssuing(false);
    })();
  };

  return (
    <Card
      title="Batch"
      description="One recipient per line: name, then a comma, then what the certificate is for."
    >
      <div className="kit-grid">
        <Select
          label="Template"
          value={templateKey}
          onChange={(event) => {
            setTemplateKey(event.target.value);
          }}
          options={[
            { value: '', label: 'Choose a template' },
            ...templates.map((item) => ({ value: item.key, label: item.name })),
          ]}
        />
      </div>
      <div style={{ marginTop: 'var(--sp-3)' }}>
        <TextArea
          label="Recipients"
          hint="Ayesha Rahman, Frontend track 2026"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
      </div>

      {parsed.problems.length > 0 && (
        <ul className="kit-error">
          {parsed.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <div className="kit-row" style={{ marginTop: 'var(--sp-3)' }}>
        <Button disabled={issuing || templateKey === '' || parsed.rows.length === 0} onClick={run}>
          {issuing ? 'Issuing' : `Issue ${String(parsed.rows.length)} certificates`}
        </Button>
      </div>

      {done.length > 0 && (
        <Banner tone="ok" title={`${done.length} issued`}>
          <ul className="kit-small kit-mono">
            {done.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Banner>
      )}
      {failed.length > 0 && (
        <Banner tone="bad" title={`${failed.length} refused`}>
          <ul className="kit-small">
            {failed.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Banner>
      )}
    </Card>
  );
}

function Registry(): ReactElement {
  const env = useCorporateEnv();
  const templates = useTemplates();
  const [search, setSearch] = useState('');
  const load = useCallback(
    () => listRpc<RegistryRow>(env, 'certificate_registry', { p_search: search, p_limit: 200 }),
    [env, search],
  );
  const { state, reload } = useAsync(load, [env, search]);

  return (
    <div className="kit-stack">
      <Card title="Registry" description="Search by code, recipient or subject.">
        <Field
          label="Search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </Card>

      {state.status === 'loading' ? (
        <Loading label="Loading the registry." />
      ) : state.status === 'error' ? (
        <Banner tone="bad" title="The registry did not load">
          {state.message}
        </Banner>
      ) : state.data.length === 0 ? (
        <Empty>No certificate matches that search.</Empty>
      ) : (
        <Table
          caption="A certificate is never edited. A mistake is revoked, with a reason, and reissued."
          head={['Code', 'Recipient', 'For', 'Issued', 'State', 'Checks', 'Actions']}
        >
          {state.data.map((row) => {
            const state_ = registryState(row);
            const template =
              templates.state.status === 'ready'
                ? (templates.state.data.find((item) => item.key === row.template_key) ?? null)
                : null;
            return (
              <tr key={row.code}>
                <td className="kit-mono kit-small">{formatDocCode(row.code)}</td>
                <td>{row.recipient_name}</td>
                <td className="kit-small">{row.subject}</td>
                <td className="kit-small">{longDate(row.issued_on)}</td>
                <td>
                  <Badge tone={state_ === 'valid' ? 'ok' : state_ === 'expired' ? 'warn' : 'bad'}>
                    {state_}
                  </Badge>
                  {row.status === 'revoked' && row.revoke_reason !== '' && (
                    <p className="kit-hint">{row.revoke_reason}</p>
                  )}
                </td>
                <td className="kit-small">{row.verifications}</td>
                <td>
                  <div className="kit-row">
                    <Button
                      size="small"
                      variant="quiet"
                      disabled={template === null}
                      onClick={() => {
                        if (!template) return;
                        const bytes = buildCertificatePdf(
                          printFromTemplate(template, {
                            code: row.code,
                            recipientName: row.recipient_name,
                            body: row.subject,
                            issuedOn: row.issued_on,
                            expiresOn: row.expires_on,
                            siteUrl: env.siteUrl.replace('www.', 'vf.'),
                          }),
                        );
                        downloadPdf(bytes, certificateFilename(row.code, row.recipient_name));
                      }}
                    >
                      PDF
                    </Button>
                    {row.status === 'issued' && <Revoke code={row.code} onRevoked={reload} />}
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}

function Revoke({ code, onRevoked }: { code: string; onRevoked: () => void }): ReactElement {
  const env = useCorporateEnv();
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  if (!open) {
    return (
      <Button
        size="small"
        variant="danger"
        onClick={() => {
          setOpen(true);
        }}
      >
        Revoke
      </Button>
    );
  }

  return (
    <div className="kit-stack">
      <Field
        label="Reason"
        hint="Shown to anybody who verifies this code."
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
        }}
      />
      {error !== '' && <p className="kit-error">{error}</p>}
      <div className="kit-row">
        <Button
          size="small"
          variant="danger"
          disabled={reason.trim() === ''}
          onClick={() => {
            callRpc(env, 'revoke_issued_certificate', { p_code: code, p_reason: reason.trim() })
              .then(() => {
                setOpen(false);
                onRevoked();
              })
              .catch((cause: unknown) => {
                setError(messageOf(cause));
              });
          }}
        >
          Confirm
        </Button>
        <Button
          size="small"
          variant="quiet"
          onClick={() => {
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
