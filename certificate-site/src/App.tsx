import { Suspense, lazy, useCallback, useMemo, useState, type ReactElement } from 'react';
import {
  AppShell,
  Badge,
  Banner,
  BulkBar,
  Button,
  Card,
  DataError,
  Drawer,
  Empty,
  Field,
  Loading,
  Select,
  Table,
  TextArea,
  callRpc,
  computeFieldDiff,
  formatDocCode,
  listRpc,
  qrSvg,
  relativeTimeLabel,
  rowsToCsv,
  selectRows,
  useAsync,
  useCorporateEnv,
  verificationUrl,
  type CorporateEnv,
} from '@kit';
import {
  EMPTY_DRAFT,
  MAX_BODY,
  MAX_RECIPIENT_NAME,
  MAX_REVOKE_REASON,
  MAX_SUBJECT,
  certificateFilename,
  draftProblems,
  draftToArgs,
  editCertificateProblems,
  formatCertificateError,
  longDate,
  parseBatch,
  registryState,
  resolvedBody,
  resolvedEditBody,
  revokeCertificateProblems,
  type CertificateRevisionRow,
  type EditCertificateDraft,
  type IssueDraft,
  type RegistryRow,
  type TemplateRow,
} from './model';

const LazyTemplateStudio = lazy(() => import('./TemplateStudio'));

/**
 * Corporate Certificate Desk & Template Studio:
 * - Issue & Batch issue certificates with instant QR + signed PDF download
 * - Live Edit in-place (revision tracked), Amend & Reissue (supersedes prior code),
 *   Restore revoked certificates, Revision History Diff Drawer, & Bulk Operations
 * - Lazy-loaded Admin Template Studio for design & signature management
 */
export function App(): ReactElement {
  const [tabId, setTabId] = useState('issue');

  return (
    <AppShell
      minRole="moderator"
      activeTabId={tabId}
      onTabChange={setTabId}
      note="Every issuance, live amendment, reissue, restoration, and revocation writes an immutable revision trail."
      tabs={[
        { id: 'issue', label: 'Issue', render: () => <Issue /> },
        { id: 'registry', label: 'Registry', render: () => <Registry /> },
        { id: 'templates', label: 'Template Studio', render: () => <TemplatesTab /> },
      ]}
    />
  );
}

function useTemplates(): ReturnType<typeof useAsync<readonly TemplateRow[]>> {
  const env = useCorporateEnv();
  const load = useCallback(() => selectRows<TemplateRow>(env, 'certificate_templates', '*'), [env]);
  return useAsync(load, [env]);
}

function TemplatesTab(): ReactElement {
  const templates = useTemplates();
  if (templates.state.status === 'loading') return <Loading label="Loading templates." />;
  if (templates.state.status === 'error') {
    return (
      <Banner tone="bad" title="Templates did not load">
        {templates.state.message}
      </Banner>
    );
  }
  return (
    <Suspense fallback={<Loading label="Loading Template Studio." />}>
      <LazyTemplateStudio templates={templates.state.data} onSaved={templates.reload} />
    </Suspense>
  );
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
  const problems = draftProblems(draft, template);
  const body = resolvedBody(draft, template);

  const issue = (): void => {
    if (!template || problems.length > 0) return;
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
        setError(formatCertificateError(cause));
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
        description="Generates an immutable verification code, QR matrix, and revision #1 record."
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
            hint={`Exactly as it should be printed (${draft.recipientName.trim().length} / ${MAX_RECIPIENT_NAME}).`}
            value={draft.recipientName}
            onChange={(event) => {
              set({ recipientName: event.target.value });
            }}
          />
          <Field
            label="What it is for"
            hint={`The course, the contribution or the role (${draft.subject.trim().length} / ${MAX_SUBJECT}).`}
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
            hint={`Leave empty to use the template. {recipient}, {subject} and {date} are filled in (${body.length} / ${MAX_BODY} resolved).`}
            value={draft.body}
            onChange={(event) => {
              set({ body: event.target.value });
            }}
          />
        </div>

        {template && (
          <div className="kit-card" style={{ marginTop: 'var(--sp-3)', textAlign: 'center' }}>
            <p className="kit-small kit-muted">Live Specimen Preview</p>
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
  const portal = env.verificationUrl;
  const url = verificationUrl(portal, issued.code);
  const svg = useMemo(() => qrSvg(url), [url]);

  return (
    <Card title="Certificate issued" description="Download the PDF or share the verification link.">
      <div className="kit-row" style={{ alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
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
          <PrintCertificateButton
            code={issued.code}
            template={issued.template}
            env={env}
            label="Download PDF"
          />
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

  const selectedTemplate = templates.find((item) => item.key === templateKey) ?? null;
  const parsed = parseBatch(text, selectedTemplate);

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
          errors.push(`Line ${String(row.line)} (${row.name}): ${formatCertificateError(cause)}`);
        }
      }
      setDone(issued);
      setFailed(errors);
      setIssuing(false);
    })();
  };

  return (
    <Card
      title="Batch Issuance"
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
  const [statusFilter, setStatusFilter] = useState('all');
  const [templateFilter, setTemplateFilter] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkReason, setBulkReason] = useState('');
  const [bulkExpiresOn, setBulkExpiresOn] = useState('');
  const [bulkFeedback, setBulkFeedback] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [registryFeedback, setRegistryFeedback] = useState('');

  const [inspectRow, setInspectRow] = useState<RegistryRow | null>(null);

  const load = useCallback(async () => {
    try {
      return await listRpc<RegistryRow>(env, 'certificate_registry_v2', {
        p_search: search,
        p_status: statusFilter,
        p_template: templateFilter,
        p_limit: 250,
      });
    } catch (cause) {
      if (cause instanceof DataError && cause.code === 'PGRST202') {
        return listRpc<RegistryRow>(env, 'certificate_registry', {
          p_search: search,
          p_status: statusFilter,
          p_limit: 200,
        });
      }
      throw cause;
    }
  }, [env, search, statusFilter, templateFilter]);
  const { state, reload } = useAsync(load, [env, search, statusFilter, templateFilter]);

  const toggle = (code: string): void => {
    setSelected((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));
  };

  const runBulk = async (action: 'revoke' | 'extend_expiry' | 'clear_expiry'): Promise<void> => {
    if (selected.length === 0) return;
    setBulkBusy(true);
    setBulkFeedback('');
    try {
      const updated = await callRpc<number>(env, 'bulk_certificate_action', {
        p_codes: selected,
        p_action: action,
        p_reason: bulkReason.trim(),
        p_expires_on: action === 'extend_expiry' ? bulkExpiresOn : null,
      });
      setBulkFeedback(`Applied "${action}" to ${updated} certificate(s).`);
      setSelected([]);
      setBulkReason('');
      reload();
    } catch (cause) {
      setBulkFeedback(formatCertificateError(cause));
    } finally {
      setBulkBusy(false);
    }
  };

  const exportCsv = (): void => {
    if (state.status !== 'ready') return;
    const csv = rowsToCsv(
      [
        'code',
        'template',
        'recipient_name',
        'subject',
        'issued_on',
        'expires_on',
        'status',
        'revision',
        'verifications',
      ],
      state.data.map((r) => [
        r.code,
        r.template_key,
        r.recipient_name,
        r.subject,
        r.issued_on,
        r.expires_on ?? '',
        r.status,
        r.revision ?? 1,
        r.verifications,
      ]),
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bsdc-certificate-registry.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const templateOptions =
    templates.state.status === 'ready'
      ? templates.state.data.map((t) => ({ value: t.key, label: t.name }))
      : [];

  return (
    <div className="kit-stack">
      <Card
        title="Certificate Registry & Editorial Desk"
        description="Filter certificates, inspect revision diffs, edit or amend-reissue credentials, or apply batch operations."
        actions={
          <div className="kit-row">
            <Button size="small" variant="quiet" onClick={reload}>
              Refresh
            </Button>
            {state.status === 'ready' && state.data.length > 0 && (
              <Button size="small" variant="quiet" onClick={exportCsv}>
                Export CSV ({state.data.length})
              </Button>
            )}
          </div>
        }
      >
        <div className="kit-grid">
          <Field
            label="Search"
            placeholder="Code, recipient, or subject..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            label="Status"
            value={statusFilter}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'valid', label: 'Valid' },
              { value: 'expired', label: 'Expired' },
              { value: 'revoked', label: 'Revoked' },
            ]}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
          <Select
            label="Template"
            value={templateFilter}
            options={[{ value: 'all', label: 'All templates' }, ...templateOptions]}
            onChange={(e) => setTemplateFilter(e.target.value)}
          />
        </div>
      </Card>

      {registryFeedback !== '' && (
        <Banner tone="ok" title="Certificate Updated">
          <p className="kit-small">{registryFeedback}</p>
        </Banner>
      )}

      {bulkFeedback !== '' && (
        <Banner tone="neutral" title="Batch Update">
          <p className="kit-small">{bulkFeedback}</p>
        </Banner>
      )}

      {state.status === 'loading' ? (
        <Loading label="Loading the registry." />
      ) : state.status === 'error' ? (
        <Banner tone="bad" title="The registry did not load">
          {state.message}
        </Banner>
      ) : state.data.length === 0 ? (
        <Empty>No certificate matches that filter.</Empty>
      ) : (
        <Table
          caption="Registry records support live revision-tracked editing, amendment/reissue, restoration, and bulk updates."
          head={['', 'Code & Rev', 'Recipient', 'For', 'Issued', 'State', 'Checks', 'Actions']}
        >
          {state.data.map((row) => {
            const st = registryState(row);
            const template =
              templates.state.status === 'ready'
                ? (templates.state.data.find((item) => item.key === row.template_key) ?? null)
                : null;
            return (
              <tr key={row.code}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.code}`}
                    checked={selected.includes(row.code)}
                    onChange={() => toggle(row.code)}
                  />
                </td>
                <td className="kit-mono kit-small">
                  <div>{formatDocCode(row.code)}</div>
                  <Badge>rev {row.revision ?? 1}</Badge>
                </td>
                <td>{row.recipient_name}</td>
                <td className="kit-small">{row.subject}</td>
                <td className="kit-small">{longDate(row.issued_on)}</td>
                <td>
                  <Badge tone={st === 'valid' ? 'ok' : st === 'expired' ? 'warn' : 'bad'}>
                    {st}
                  </Badge>
                  {row.superseded_by && (
                    <div className="kit-small kit-mono kit-muted">→ {row.superseded_by}</div>
                  )}
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
                      onClick={() => {
                        setRegistryFeedback('');
                        setInspectRow(row);
                      }}
                    >
                      Edit / History
                    </Button>
                    <PrintCertificateButton
                      code={row.code}
                      template={template}
                      env={env}
                      label="PDF"
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}

      <BulkBar selectedCount={selected.length} onClear={() => setSelected([])}>
        <Field
          label="Reason"
          placeholder="Required for bulk revoke"
          value={bulkReason}
          onChange={(e) => setBulkReason(e.target.value)}
        />
        <Field
          label="New Expiry"
          type="date"
          value={bulkExpiresOn}
          onChange={(e) => setBulkExpiresOn(e.target.value)}
        />
        <Button
          size="small"
          disabled={bulkBusy || bulkExpiresOn === ''}
          onClick={() => {
            void runBulk('extend_expiry');
          }}
        >
          Set Expiry
        </Button>
        <Button
          size="small"
          variant="quiet"
          disabled={bulkBusy}
          onClick={() => {
            void runBulk('clear_expiry');
          }}
        >
          Clear Expiry
        </Button>
        <Button
          size="small"
          variant="danger"
          disabled={bulkBusy || bulkReason.trim().length < 3}
          onClick={() => {
            void runBulk('revoke');
          }}
        >
          Bulk Revoke
        </Button>
      </BulkBar>

      <Drawer
        open={inspectRow !== null}
        title={inspectRow ? `Manage ${inspectRow.code}` : ''}
        subtitle={
          inspectRow
            ? `${inspectRow.recipient_name} · Revision ${inspectRow.revision ?? 1}`
            : undefined
        }
        onClose={() => setInspectRow(null)}
      >
        {inspectRow && (
          <CertificateInspector
            key={inspectRow.code}
            row={inspectRow}
            templates={templates.state.status === 'ready' ? templates.state.data : []}
            onChanged={(message) => {
              setInspectRow(null);
              setRegistryFeedback(message);
              reload();
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

function CertificateInspector({
  row,
  templates,
  onChanged,
}: {
  readonly row: RegistryRow;
  readonly templates: readonly TemplateRow[];
  readonly onChanged: (message: string) => void;
}): ReactElement {
  const env = useCorporateEnv();
  const [draft, setDraft] = useState<EditCertificateDraft>({
    recipientName: row.recipient_name,
    subject: row.subject,
    body: row.body ?? '',
    recipientUid: row.recipient_uid ?? '',
    issuedOn: row.issued_on,
    expiresOn: row.expires_on ?? '',
    reason: '',
  });
  const [newTemplateKey, setNewTemplateKey] = useState(row.template_key);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadHistory = useCallback(
    () => listRpc<CertificateRevisionRow>(env, 'certificate_history', { p_code: row.code }),
    [env, row.code],
  );
  const historyState = useAsync(loadHistory, [env, row.code]);

  const currentTemplate = templates.find((t) => t.key === row.template_key) ?? null;
  const reissueTemplate = templates.find((t) => t.key === newTemplateKey) ?? null;
  const inPlaceProblems = editCertificateProblems(draft, currentTemplate, row.body ?? '');
  const reissueProblems = [
    ...editCertificateProblems(draft, reissueTemplate, row.body ?? ''),
    ...(!reissueTemplate
      ? ['Selected replacement template could not be found.']
      : !reissueTemplate.is_active
        ? ['Selected replacement template is inactive; choose an active template to reissue.']
        : []),
  ];
  const revokeProblems = revokeCertificateProblems(draft.reason);
  const previewBody = resolvedEditBody(draft, currentTemplate, row.body ?? '');
  const staleBodyRecipient =
    draft.recipientName.trim() !== row.recipient_name.trim() &&
    draft.body.trim() !== '' &&
    !draft.body.includes('{recipient}') &&
    row.recipient_name.trim().length >= 2 &&
    draft.body.includes(row.recipient_name.trim()) &&
    !draft.body.includes(draft.recipientName.trim());

  const saveInPlace = (): void => {
    if (inPlaceProblems.length > 0) return;
    setBusy(true);
    setError('');
    void callRpc<number>(env, 'edit_issued_certificate', {
      p_code: row.code,
      p_recipient_name: draft.recipientName.trim(),
      p_subject: draft.subject.trim(),
      p_body: draft.body.trim(),
      p_issued_on: draft.issuedOn,
      p_expires_on: draft.expiresOn === '' ? null : draft.expiresOn,
      p_recipient_uid: draft.recipientUid.trim() === '' ? null : draft.recipientUid.trim(),
      p_reason: draft.reason.trim(),
    })
      .then((nextRev) => {
        onChanged(`Updated ${row.code} in place to revision #${nextRev}.`);
      })
      .catch((cause: unknown) => setError(formatCertificateError(cause)))
      .finally(() => setBusy(false));
  };

  const amendReissue = (): void => {
    if (reissueProblems.length > 0) return;
    setBusy(true);
    setError('');
    void callRpc<string>(env, 'amend_and_reissue_certificate', {
      p_code: row.code,
      p_template_key: newTemplateKey,
      p_recipient_name: draft.recipientName.trim(),
      p_subject: draft.subject.trim(),
      p_body: draft.body.trim(),
      p_issued_on: draft.issuedOn,
      p_expires_on: draft.expiresOn === '' ? null : draft.expiresOn,
      p_recipient_uid: draft.recipientUid.trim() === '' ? null : draft.recipientUid.trim(),
      p_reason: draft.reason.trim(),
    })
      .then((newCode) => {
        onChanged(`Issued replacement ${newCode} and marked ${row.code} superseded.`);
      })
      .catch((cause: unknown) => setError(formatCertificateError(cause)))
      .finally(() => setBusy(false));
  };

  const toggleStanding = (): void => {
    if (row.status === 'issued' && revokeProblems.length > 0) {
      setError(revokeProblems[0] ?? 'Enter an audit reason first.');
      return;
    }
    if (row.status === 'revoked' && draft.reason.trim().length < 3) {
      setError('Enter an audit reason (minimum 3 characters) first.');
      return;
    }
    setBusy(true);
    setError('');
    const rpcName =
      row.status === 'revoked' ? 'restore_issued_certificate' : 'revoke_issued_certificate';
    void callRpc(env, rpcName, { p_code: row.code, p_reason: draft.reason.trim() })
      .then(() =>
        onChanged(
          row.status === 'revoked' ? `Restored ${row.code} to issued.` : `Revoked ${row.code}.`,
        ),
      )
      .catch((cause: unknown) => setError(formatCertificateError(cause)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="kit-stack">
      {error !== '' && (
        <Banner tone="bad" title="Operation refused">
          {error}
        </Banner>
      )}
      {row.superseded_by && (
        <Banner tone="warn" title="Superseded certificate">
          This record was superseded by <strong>{row.superseded_by}</strong>.
        </Banner>
      )}

      <Card
        title="Live Edit / Amend & Reissue"
        description="Save in-place updates (preserving the code while appending a snapshot to certificate_revisions) or amend and reissue under a replacement code."
      >
        <div className="kit-stack">
          <Select
            label="Template (used if Amending & Reissuing)"
            value={newTemplateKey}
            options={templates.map((t) => ({
              value: t.key,
              label: t.is_active ? t.name : `${t.name} (inactive)`,
            }))}
            onChange={(e) => setNewTemplateKey(e.target.value)}
          />
          <Field
            label="Recipient Name"
            hint={`${draft.recipientName.trim().length} / ${MAX_RECIPIENT_NAME} characters`}
            value={draft.recipientName}
            onChange={(e) => setDraft({ ...draft, recipientName: e.target.value })}
          />
          <Field
            label="Subject"
            hint={`${draft.subject.trim().length} / ${MAX_SUBJECT} characters`}
            value={draft.subject}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
          />
          <Field
            label="Recipient Member UID (optional)"
            hint="Leave blank unless linking to a registered member UID."
            value={draft.recipientUid}
            onChange={(e) => setDraft({ ...draft, recipientUid: e.target.value })}
          />
          <div className="kit-grid kit-grid--2">
            <Field
              label="Issued On"
              type="date"
              value={draft.issuedOn}
              onChange={(e) => setDraft({ ...draft, issuedOn: e.target.value })}
            />
            <Field
              label="Expires On"
              type="date"
              value={draft.expiresOn}
              onChange={(e) => setDraft({ ...draft, expiresOn: e.target.value })}
            />
          </div>
          <TextArea
            label="Printed Body Text"
            hint={`Leave blank to regenerate from the template. Supports {recipient}, {subject}, and {date} (${previewBody.length} / ${MAX_BODY} characters resolved).`}
            rows={3}
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
          {currentTemplate && (
            <div className="kit-row">
              <Button
                size="small"
                variant="quiet"
                onClick={() => setDraft({ ...draft, body: currentTemplate.body_template })}
              >
                Use template wording
              </Button>
            </div>
          )}
          {staleBodyRecipient && (
            <Banner tone="warn" title="Printed body still mentions the previous name">
              <p className="kit-small">
                Recipient Name changed, while Printed Body Text still contains &ldquo;
                {row.recipient_name}&rdquo;. Click <strong>Use template wording</strong> or edit the
                body before saving if the printed text should update too.
              </p>
            </Banner>
          )}
          {previewBody !== '' && (
            <div className="kit-card" style={{ padding: 'var(--sp-2)' }}>
              <p className="kit-hint" style={{ margin: 0 }}>
                <strong>
                  Resolved printed wording ({previewBody.length} / {MAX_BODY}):
                </strong>{' '}
                {previewBody}
              </p>
            </div>
          )}
          <Field
            label="Mandatory Audit Reason"
            hint={`Minimum 3 characters (${draft.reason.trim().length} / ${MAX_REVOKE_REASON} max for revocations).`}
            placeholder="e.g. Corrected legal spelling per member ID request"
            value={draft.reason}
            onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
          />

          {inPlaceProblems.length > 0 && (
            <ul className="kit-error">
              {inPlaceProblems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {inPlaceProblems.length === 0 && reissueProblems.length > 0 && (
            <p className="kit-hint">To Amend &amp; Reissue: {reissueProblems.join(' ')}</p>
          )}

          <div className="kit-row">
            <Button
              size="small"
              disabled={busy || inPlaceProblems.length > 0}
              onClick={saveInPlace}
            >
              Save Edit In-Place
            </Button>
            <Button
              size="small"
              variant="quiet"
              disabled={busy || reissueProblems.length > 0}
              onClick={amendReissue}
            >
              Amend & Reissue New Code
            </Button>
            <Button
              size="small"
              variant={row.status === 'revoked' ? 'primary' : 'danger'}
              disabled={
                busy ||
                (row.status === 'revoked'
                  ? draft.reason.trim().length < 3
                  : revokeProblems.length > 0)
              }
              onClick={toggleStanding}
            >
              {row.status === 'revoked' ? 'Restore Certificate' : 'Revoke Certificate'}
            </Button>
          </div>
        </div>
      </Card>

      <Card
        title="Revision Audit History & Diff"
        description="Every prior revision captured before mutation."
      >
        {historyState.state.status === 'loading' && <Loading label="Loading revision history." />}
        {historyState.state.status === 'error' && (
          <Banner tone="bad" title="Could not load history">
            {historyState.state.message}
          </Banner>
        )}
        {historyState.state.status === 'ready' && historyState.state.data.length === 0 && (
          <Empty>No edits yet — currently on original issued revision #1.</Empty>
        )}
        {historyState.state.status === 'ready' && historyState.state.data.length > 0 && (
          <div className="kit-stack">
            {historyState.state.data.map((rev) => {
              const diffs = computeFieldDiff(
                {
                  recipient_name: rev.recipient_name,
                  subject: rev.subject,
                  issued_on: rev.issued_on,
                  expires_on: rev.expires_on ?? '',
                  status: rev.status,
                },
                {
                  recipient_name: row.recipient_name,
                  subject: row.subject,
                  issued_on: row.issued_on,
                  expires_on: row.expires_on ?? '',
                  status: row.status,
                },
                ['recipient_name', 'subject', 'issued_on', 'expires_on', 'status'],
              ).filter((d) => d.changed);
              return (
                <div key={rev.id} className="kit-card" style={{ padding: 'var(--sp-3)' }}>
                  <div className="kit-row" style={{ justifyContent: 'space-between' }}>
                    <Badge>Before Revision #{rev.revision}</Badge>
                    <span className="kit-small kit-muted">{relativeTimeLabel(rev.created_at)}</span>
                  </div>
                  <p className="kit-small" style={{ marginTop: 'var(--sp-1)' }}>
                    <strong>Reason:</strong> {rev.reason || '—'}
                  </p>
                  {diffs.length > 0 && (
                    <ul className="kit-small kit-mono">
                      {diffs.map((d) => (
                        <li key={d.field}>
                          {d.field}: "{d.before || '—'}" → "{d.after || '—'}"
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

type PrintableCertificate = {
  readonly code: string;
  readonly template_key: string;
  readonly recipient_name: string;
  readonly body: string;
  readonly issued_on: string;
  readonly expires_on: string | null;
  readonly status: 'issued' | 'revoked';
};

/** Always print the issued body from the registry, including on the first download. */
function PrintCertificateButton({
  code,
  template,
  env,
  label,
}: {
  code: string;
  template: TemplateRow | null;
  env: CorporateEnv;
  label: string;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const print = async (): Promise<void> => {
    if (!template) return;
    setBusy(true);
    setError('');
    try {
      const records = await listRpc<PrintableCertificate>(env, 'certificate_for_print', {
        p_code: code,
      });
      const record = records[0];
      if (!record)
        throw new Error('The issued certificate could not be found. Refresh the registry.');
      if (record.template_key !== template.key)
        throw new Error('The template changed. Refresh the registry and retry.');
      const [certificate, pdf] = await Promise.all([
        import('./certificate-pdf'),
        import('@kit/pdf'),
      ]);
      const bytes = certificate.buildCertificatePdf(
        certificate.printFromTemplate(template, {
          code: record.code,
          recipientName: record.recipient_name,
          body: record.body,
          issuedOn: record.issued_on,
          expiresOn: record.expires_on,
          status: record.status,
          siteUrl: env.verificationUrl,
        }),
      );
      pdf.downloadPdf(bytes, certificateFilename(record.code, record.recipient_name));
    } catch (cause) {
      setError(formatCertificateError(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span>
      <Button
        size="small"
        variant="quiet"
        disabled={busy || template === null}
        onClick={() => void print()}
      >
        {busy ? 'Preparing…' : label}
      </Button>
      {error !== '' && (
        <span className="kit-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
