import { useState, type ReactElement } from 'react';
import {
  Badge,
  Banner,
  Button,
  Card,
  Field,
  Select,
  SplitPane,
  TextArea,
  callRpc,
  meetsRole,
  useCorporateEnv,
  useSession,
} from '@kit';
import {
  MAX_TEMPLATE_BODY,
  MAX_TEMPLATE_HEADING,
  MAX_TEMPLATE_NAME,
  MAX_TEMPLATE_PURPOSE,
  fillTemplate,
  formatCertificateError,
  templateDraftProblems,
  type TemplateDraft,
  type TemplateRow,
} from './model';

const EMPTY_TEMPLATE: TemplateDraft = {
  key: '',
  name: '',
  purpose: '',
  heading: 'Certificate of Achievement',
  bodyTemplate:
    'has successfully completed {subject}, awarded by Bangladesh Software Development Community on {date}.',
  accent: '#0f766e',
  orientation: 'landscape',
  signatureName: 'Executive Director',
  signatureTitle: 'Bangladesh Software Development Community',
  isActive: true,
  sortOrder: 50,
};

function fromRow(row: TemplateRow): TemplateDraft {
  return {
    key: row.key,
    name: row.name,
    purpose: row.purpose,
    heading: row.heading,
    bodyTemplate: row.body_template,
    accent: row.accent,
    orientation: row.orientation,
    signatureName: row.signature_name,
    signatureTitle: row.signature_title,
    isActive: row.is_active,
    sortOrder: row.sort_order ?? 100,
  };
}

export function TemplateStudio({
  templates,
  onSaved,
}: {
  readonly templates: readonly TemplateRow[];
  readonly onSaved: () => void;
}): ReactElement {
  const env = useCorporateEnv();
  const { state: session } = useSession();
  const profile = session.status === 'authenticated' ? session.profile : null;
  const mayManage = meetsRole(profile, 'admin');

  const [draft, setDraft] = useState<TemplateDraft>(EMPTY_TEMPLATE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  if (!mayManage) {
    return (
      <Banner tone="warn" title="Administrator clearance required">
        <p className="kit-small">
          Designing or modifying certificate templates requires <strong>settings.write</strong>{' '}
          (admin clearance). Moderators can still issue, edit, reissue, and revoke existing
          templates from the Issue and Registry tabs.
        </p>
      </Banner>
    );
  }

  const problems = templateDraftProblems(draft);

  const save = (): void => {
    if (problems.length > 0) return;
    setBusy(true);
    setError('');
    setOk('');
    void callRpc<TemplateRow>(env, 'save_certificate_template', {
      p_key: draft.key.trim().toLowerCase(),
      p_name: draft.name.trim(),
      p_purpose: draft.purpose.trim(),
      p_heading: draft.heading.trim(),
      p_body_template: draft.bodyTemplate.trim(),
      p_accent: draft.accent.trim().toLowerCase(),
      p_orientation: draft.orientation,
      p_signature_name: draft.signatureName.trim(),
      p_signature_title: draft.signatureTitle.trim(),
      p_is_active: draft.isActive,
      p_sort_order: draft.sortOrder ?? 100,
    })
      .then((saved) => {
        setOk(`Saved template "${saved.name}" (${saved.key}).`);
        onSaved();
      })
      .catch((cause: unknown) => setError(formatCertificateError(cause)))
      .finally(() => setBusy(false));
  };

  const previewBody = fillTemplate(draft.bodyTemplate, {
    recipient: 'Tasnim Jahan',
    subject: 'Core Systems Engineering Track',
    date: new Date().toISOString().slice(0, 10),
  });

  return (
    <div className="kit-stack">
      <Card
        title="Existing Certificate Templates"
        description="Click any template to customize its copy, palette, signature lines, or active state."
        actions={
          <Button size="small" variant="quiet" onClick={() => setDraft(EMPTY_TEMPLATE)}>
            New Template
          </Button>
        }
      >
        <div className="kit-row">
          {templates.map((item) => (
            <Button
              key={item.key}
              size="small"
              variant={draft.key === item.key ? 'primary' : 'quiet'}
              onClick={() => {
                setOk('');
                setError('');
                setDraft(fromRow(item));
              }}
            >
              {item.name} {!item.is_active ? '(inactive)' : ''}
            </Button>
          ))}
        </div>
      </Card>

      {error !== '' && (
        <Banner tone="bad" title="Could not save template">
          {error}
        </Banner>
      )}
      {ok !== '' && (
        <Banner tone="ok" title="Template Updated">
          {ok}
        </Banner>
      )}

      <SplitPane
        primary={
          <Card
            title="Template Studio"
            description="Saved changes validate strictly inside Postgres."
          >
            <div className="kit-grid kit-grid--2">
              <Field
                label="Template Key"
                hint="e.g. contributor-2026"
                value={draft.key}
                onChange={(e) => setDraft({ ...draft, key: e.target.value })}
              />
              <Field
                label="Display Name"
                hint={`${draft.name.trim().length} / ${MAX_TEMPLATE_NAME} characters`}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <Field
                label="Heading"
                hint={`${draft.heading.trim().length} / ${MAX_TEMPLATE_HEADING} characters`}
                value={draft.heading}
                onChange={(e) => setDraft({ ...draft, heading: e.target.value })}
              />
              <Field
                label="Purpose"
                hint={`${draft.purpose.trim().length} / ${MAX_TEMPLATE_PURPOSE} characters`}
                value={draft.purpose}
                onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
              />
              <Field
                label="Accent Colour"
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(draft.accent) ? draft.accent : '#0f766e'}
                onChange={(e) => setDraft({ ...draft, accent: e.target.value })}
              />
              <Select
                label="Page Orientation"
                value={draft.orientation}
                options={[
                  { value: 'landscape', label: 'Landscape (Certificate)' },
                  { value: 'portrait', label: 'Portrait (Formal Letter)' },
                ]}
                onChange={(e) =>
                  setDraft({ ...draft, orientation: e.target.value as 'landscape' | 'portrait' })
                }
              />
              <Field
                label="Signatory Name"
                value={draft.signatureName}
                onChange={(e) => setDraft({ ...draft, signatureName: e.target.value })}
              />
              <Field
                label="Signatory Title"
                value={draft.signatureTitle}
                onChange={(e) => setDraft({ ...draft, signatureTitle: e.target.value })}
              />
              <Select
                label="Status"
                value={draft.isActive ? 'active' : 'inactive'}
                options={[
                  { value: 'active', label: 'Active (selectable on Issue desk)' },
                  { value: 'inactive', label: 'Archived / Hidden' },
                ]}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.value === 'active' })}
              />
            </div>

            <div style={{ marginTop: 'var(--sp-3)' }}>
              <TextArea
                label="Body Wording Template"
                hint={`Supports {recipient}, {subject}, and {date} variables (${draft.bodyTemplate.trim().length} / ${MAX_TEMPLATE_BODY} characters).`}
                rows={4}
                value={draft.bodyTemplate}
                onChange={(e) => setDraft({ ...draft, bodyTemplate: e.target.value })}
              />
            </div>

            {problems.length > 0 && (
              <ul className="kit-error" style={{ marginTop: 'var(--sp-2)' }}>
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}

            <div className="kit-row" style={{ marginTop: 'var(--sp-3)' }}>
              <Button disabled={busy || problems.length > 0} onClick={save}>
                {busy ? 'Saving' : 'Save Template'}
              </Button>
            </div>
          </Card>
        }
        secondary={
          <Card title="Live Specimen Proof">
            <div
              style={{
                border: `3px solid ${draft.accent}`,
                borderRadius: 'var(--r-md)',
                padding: 'var(--sp-4)',
                textAlign: 'center',
                background: 'var(--c-surface-2)',
              }}
            >
              <Badge>{draft.orientation}</Badge>
              <h2 style={{ color: draft.accent, marginTop: 'var(--sp-2)' }}>
                {draft.heading || 'Certificate Heading'}
              </h2>
              <p className="kit-small kit-muted">This is to certify that</p>
              <p style={{ fontSize: '1.15rem', fontWeight: 700 }}>Tasnim Jahan</p>
              <p className="kit-small">{previewBody}</p>
              <hr style={{ borderColor: 'var(--c-line)', margin: 'var(--sp-4) 0' }} />
              <p style={{ margin: 0, fontWeight: 600 }}>{draft.signatureName || 'Signatory'}</p>
              <p className="kit-small kit-muted" style={{ margin: 0 }}>
                {draft.signatureTitle}
              </p>
            </div>
          </Card>
        }
      />
    </div>
  );
}
export default TemplateStudio;
