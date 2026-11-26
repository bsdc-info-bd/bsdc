import { DataError, messageOf, normaliseDocCode } from '@kit';

export const MAX_RECIPIENT_NAME = 120;
export const MAX_SUBJECT = 200;
export const MAX_BODY = 1200;
export const MAX_REVOKE_REASON = 300;
export const MAX_TEMPLATE_NAME = 80;
export const MAX_TEMPLATE_PURPOSE = 200;
export const MAX_TEMPLATE_HEADING = 160;
export const MAX_TEMPLATE_BODY = 1200;

export type TemplateRow = {
  readonly key: string;
  readonly name: string;
  readonly purpose: string;
  readonly heading: string;
  readonly body_template: string;
  readonly accent: string;
  readonly orientation: 'landscape' | 'portrait';
  readonly signature_name: string;
  readonly signature_title: string;
  readonly is_active: boolean;
  readonly sort_order?: number | undefined;
};

export type RegistryRow = {
  readonly code: string;
  readonly template_key: string;
  readonly recipient_name: string;
  readonly subject: string;
  readonly body?: string | undefined;
  readonly recipient_uid?: string | null | undefined;
  readonly issued_on: string;
  readonly expires_on: string | null;
  readonly status: 'issued' | 'revoked';
  readonly revoke_reason: string;
  readonly revision?: number | undefined;
  readonly updated_at?: string | undefined;
  readonly edit_reason?: string | undefined;
  readonly superseded_by?: string | null | undefined;
  /**
   * Every revocation this certificate has carried, kept rather than erased when it was
   * restored. Absent on rows issued before 0147 and on any read that does not select it.
   */
  readonly revoked_history?: unknown;
  readonly verifications: number;
};

export type CertificateRevisionRow = {
  readonly id: string;
  readonly revision: number;
  readonly template_key: string;
  readonly recipient_uid: string | null;
  readonly recipient_name: string;
  readonly subject: string;
  readonly body: string;
  readonly issued_on: string;
  readonly expires_on: string | null;
  readonly status: 'issued' | 'revoked';
  readonly edited_by: string | null;
  readonly reason: string;
  readonly created_at: string;
};

export type EditCertificateDraft = {
  readonly recipientName: string;
  readonly subject: string;
  readonly body: string;
  readonly recipientUid: string;
  readonly issuedOn: string;
  readonly expiresOn: string;
  readonly reason: string;
};

export type TemplateDraft = {
  readonly key: string;
  readonly name: string;
  readonly purpose: string;
  readonly heading: string;
  readonly bodyTemplate: string;
  readonly accent: string;
  readonly orientation: 'landscape' | 'portrait';
  readonly signatureName: string;
  readonly signatureTitle: string;
  readonly isActive: boolean;
  readonly sortOrder?: number | undefined;
};

function isValidIsoDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const parts = value.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 0;
  const day = parts[2] ?? 0;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** Preview/expanded body for an in-place edit or reissue draft. */
export function resolvedEditBody(
  draft: EditCertificateDraft,
  template: TemplateRow | null = null,
  fallbackBody = '',
): string {
  const explicit = draft.body.trim();
  const source =
    explicit !== ''
      ? explicit
      : template && template.body_template.trim() !== ''
        ? template.body_template.trim()
        : fallbackBody.trim();
  return fillTemplate(source, {
    recipient: draft.recipientName,
    subject: draft.subject,
    date: draft.issuedOn,
  });
}

export function editCertificateProblems(
  draft: EditCertificateDraft,
  template: TemplateRow | null = null,
  fallbackBody = '',
): readonly string[] {
  const problems: string[] = [];
  const nameLen = draft.recipientName.trim().length;
  if (nameLen < 2) problems.push('Recipient name must be at least 2 characters.');
  else if (nameLen > MAX_RECIPIENT_NAME)
    problems.push(`Recipient name must be at most ${MAX_RECIPIENT_NAME} characters.`);

  const subjectLen = draft.subject.trim().length;
  if (subjectLen < 2) problems.push('Subject must be at least 2 characters.');
  else if (subjectLen > MAX_SUBJECT)
    problems.push(`Subject must be at most ${MAX_SUBJECT} characters.`);

  const issuedValid = isValidIsoDate(draft.issuedOn);
  const expiresValid = draft.expiresOn === '' || isValidIsoDate(draft.expiresOn);
  if (!issuedValid) problems.push('Issue date must be a valid YYYY-MM-DD calendar date.');
  if (draft.expiresOn !== '' && !expiresValid) {
    problems.push('Expiry date must be YYYY-MM-DD or left blank.');
  }
  if (issuedValid && draft.expiresOn !== '' && expiresValid && draft.expiresOn < draft.issuedOn) {
    problems.push('Expiry date cannot be earlier than the issue date.');
  }

  const expandedBody = resolvedEditBody(draft, template, fallbackBody);
  if (draft.body.trim().length > MAX_BODY || expandedBody.length > MAX_BODY) {
    problems.push(
      `Printed body text must be at most ${MAX_BODY} characters after filling placeholders (currently ${Math.max(draft.body.trim().length, expandedBody.length)}).`,
    );
  }

  if (draft.reason.trim().length < 3) {
    problems.push('Provide an audit reason (minimum 3 characters) for editing or reissuing.');
  }
  return problems;
}

export function revokeCertificateProblems(reason: string): readonly string[] {
  const len = reason.trim().length;
  const problems: string[] = [];
  if (len < 3) problems.push('Enter an audit reason (minimum 3 characters) to revoke.');
  else if (len > MAX_REVOKE_REASON) {
    problems.push(`Revocation reason must be at most ${MAX_REVOKE_REASON} characters.`);
  }
  return problems;
}

export function templateDraftProblems(draft: TemplateDraft): readonly string[] {
  const problems: string[] = [];
  if (!/^[a-z][a-z0-9_-]{2,40}$/.test(draft.key.trim().toLowerCase())) {
    problems.push('Key must be 3-41 lowercase letters, digits, hyphens, or underscores.');
  }
  const nameLen = draft.name.trim().length;
  if (nameLen < 2) problems.push('Template name is required (at least 2 characters).');
  else if (nameLen > MAX_TEMPLATE_NAME) {
    problems.push(`Template name must be at most ${MAX_TEMPLATE_NAME} characters.`);
  }
  if (draft.purpose.trim().length > MAX_TEMPLATE_PURPOSE) {
    problems.push(`Template purpose must be at most ${MAX_TEMPLATE_PURPOSE} characters.`);
  }
  const headingLen = draft.heading.trim().length;
  if (headingLen < 2) problems.push('Certificate heading is required (at least 2 characters).');
  else if (headingLen > MAX_TEMPLATE_HEADING) {
    problems.push(`Certificate heading must be at most ${MAX_TEMPLATE_HEADING} characters.`);
  }
  if (draft.bodyTemplate.trim().length > MAX_TEMPLATE_BODY) {
    problems.push(`Body wording template must be at most ${MAX_TEMPLATE_BODY} characters.`);
  }
  if (!/^#[0-9a-f]{6}$/i.test(draft.accent.trim())) {
    problems.push('Accent must be a 6-digit hex color like #0F766E.');
  }
  if (draft.orientation !== 'landscape' && draft.orientation !== 'portrait') {
    problems.push('Orientation must be landscape or portrait.');
  }
  return problems;
}

export type IssueDraft = {
  readonly templateKey: string;
  readonly recipientName: string;
  readonly subject: string;
  readonly recipientUid: string;
  readonly issuedOn: string;
  readonly expiresOn: string;
  readonly body: string;
};

export const EMPTY_DRAFT: IssueDraft = {
  templateKey: '',
  recipientName: '',
  subject: '',
  recipientUid: '',
  issuedOn: new Date().toISOString().slice(0, 10),
  expiresOn: '',
  body: '',
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Everything wrong with a draft, in the order the form shows it. The
 * database applies the same constraints; checking here only means an
 * operator is told before a round trip rather than after one.
 */
export function draftProblems(
  draft: IssueDraft,
  template: TemplateRow | null = null,
): readonly string[] {
  const problems: string[] = [];
  if (draft.templateKey === '') problems.push('Choose a template.');
  const nameLen = draft.recipientName.trim().length;
  if (nameLen < 2) problems.push('The recipient needs a name.');
  else if (nameLen > MAX_RECIPIENT_NAME) {
    problems.push(`Recipient name must be at most ${MAX_RECIPIENT_NAME} characters.`);
  }
  const subjectLen = draft.subject.trim().length;
  if (subjectLen < 2) {
    problems.push('Say what the certificate is for: the course, the contribution, the role.');
  } else if (subjectLen > MAX_SUBJECT) {
    problems.push(`Subject must be at most ${MAX_SUBJECT} characters.`);
  }
  const issuedValid = isValidIsoDate(draft.issuedOn);
  const expiresValid = draft.expiresOn === '' || isValidIsoDate(draft.expiresOn);
  if (!issuedValid) problems.push('The issue date must be a calendar date.');
  if (draft.expiresOn !== '' && !expiresValid) {
    problems.push('The expiry date must be a calendar date, or empty for one that never expires.');
  }
  if (issuedValid && draft.expiresOn !== '' && expiresValid && draft.expiresOn < draft.issuedOn) {
    problems.push('A certificate cannot expire before it was issued.');
  }
  const body = resolvedBody(draft, template);
  if (draft.body.trim().length > MAX_BODY || body.length > MAX_BODY) {
    problems.push(
      `Printed wording must be at most ${MAX_BODY} characters after filling placeholders.`,
    );
  }
  return problems;
}

/** The arguments `issue_certificate()` expects, already tidied. */
export function draftToArgs(draft: IssueDraft): Record<string, unknown> {
  return {
    p_template_key: draft.templateKey,
    p_recipient_name: draft.recipientName.trim(),
    p_subject: draft.subject.trim(),
    p_recipient_uid: draft.recipientUid.trim() === '' ? null : draft.recipientUid.trim(),
    p_issued_on: draft.issuedOn,
    p_expires_on: draft.expiresOn === '' ? null : draft.expiresOn,
    p_body: draft.body.trim(),
  };
}

/** Printed dates read as a person would say them, not as the database stores them. */
export function longDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Fills a template's placeholders. The same substitution runs in the
 * database at issue time, so the preview on screen is the text that will be
 * frozen into the certificate rather than an approximation of it.
 */
export function fillTemplate(
  template: string,
  values: { readonly recipient: string; readonly subject: string; readonly date: string },
): string {
  return template
    .replace(/\{recipient\}/g, values.recipient.trim())
    .replace(/\{subject\}/g, values.subject.trim())
    .replace(/\{date\}/g, longDate(values.date));
}

/** The body a draft would be issued with, template or override. */
export function resolvedBody(draft: IssueDraft, template: TemplateRow | null): string {
  const source = draft.body.trim() === '' ? (template?.body_template ?? '') : draft.body.trim();
  return fillTemplate(source, {
    recipient: draft.recipientName,
    subject: draft.subject,
    date: draft.issuedOn,
  });
}

export type BatchRow = { readonly line: number; readonly name: string; readonly subject: string };
export type BatchParse = {
  readonly rows: readonly BatchRow[];
  readonly problems: readonly string[];
};

/**
 * Reads a pasted batch: one recipient per line, name and subject separated
 * by a comma. Bad lines are reported with their line number and the good
 * ones are still offered, because a batch of two hundred should not be
 * rejected whole for one typo.
 */
export function parseBatch(text: string, template: TemplateRow | null = null): BatchParse {
  const rows: BatchRow[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  const issuedOn = new Date().toISOString().slice(0, 10);

  text.split('\n').forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed === '') return;
    const parts = trimmed.split(',');
    const name = (parts[0] ?? '').trim();
    const subject = parts.slice(1).join(',').trim();
    if (name.length < 2) {
      problems.push(`Line ${String(line)}: the name is missing.`);
      return;
    }
    if (name.length > MAX_RECIPIENT_NAME) {
      problems.push(
        `Line ${String(line)}: recipient name exceeds ${String(MAX_RECIPIENT_NAME)} characters.`,
      );
      return;
    }
    if (subject.length < 2) {
      problems.push(`Line ${String(line)}: add what the certificate is for, after a comma.`);
      return;
    }
    if (subject.length > MAX_SUBJECT) {
      problems.push(`Line ${String(line)}: subject exceeds ${String(MAX_SUBJECT)} characters.`);
      return;
    }
    if (template) {
      const expanded = fillTemplate(template.body_template, {
        recipient: name,
        subject,
        date: issuedOn,
      });
      if (expanded.length > MAX_BODY) {
        problems.push(
          `Line ${String(line)}: expanded wording exceeds ${String(MAX_BODY)} characters.`,
        );
        return;
      }
    }
    const key = `${name.toLowerCase()}|${subject.toLowerCase()}`;
    if (seen.has(key)) {
      problems.push(`Line ${String(line)}: the same certificate appears twice.`);
      return;
    }
    seen.add(key);
    rows.push({ line, name, subject });
  });

  return { rows, problems };
}

/** A filename somebody can find again a year later. */
export function certificateFilename(code: string, recipient: string): string {
  const slug = recipient
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const safeCode = normaliseDocCode(code).replace(/[^A-Z0-9-]/g, '');
  return slug === '' ? `${safeCode}.pdf` : `${safeCode}-${slug}.pdf`;
}

/** Whether a certificate is in force today, without asking the database. */
export function registryState(
  row: RegistryRow,
  today = new Date(),
): 'valid' | 'revoked' | 'expired' {
  if (row.status === 'revoked') return 'revoked';
  if (row.expires_on !== null && row.expires_on < today.toISOString().slice(0, 10))
    return 'expired';
  return 'valid';
}

/** Turns any database constraint or FK code into an actionable certificate message. */
export function formatCertificateError(cause: unknown): string {
  const msg = messageOf(cause);
  if (cause instanceof DataError && cause.code === '23514') {
    const detail = `${msg} ${cause.detail}`.toLowerCase();
    if (detail.includes('recipient_name')) {
      return `Recipient name must be between 2 and ${MAX_RECIPIENT_NAME} characters.`;
    }
    if (detail.includes('subject')) {
      return `Subject must be between 2 and ${MAX_SUBJECT} characters.`;
    }
    if (detail.includes('body_template')) {
      return `Template wording must be at most ${MAX_TEMPLATE_BODY} characters.`;
    }
    if (detail.includes('body')) {
      return `Printed certificate body must be at most ${MAX_BODY} characters after filling placeholders.`;
    }
    if (detail.includes('revoke_reason')) {
      return `Revocation reason must be at most ${MAX_REVOKE_REASON} characters.`;
    }
    if (detail.includes('period')) {
      return 'Expiry date cannot be earlier than the issue date.';
    }
    if (detail.includes('name')) {
      return `Template name must be between 2 and ${MAX_TEMPLATE_NAME} characters.`;
    }
    if (detail.includes('purpose')) {
      return `Template purpose must be at most ${MAX_TEMPLATE_PURPOSE} characters.`;
    }
    if (detail.includes('accent')) {
      return 'Accent must be a 6-digit hex color like #0F766E.';
    }
    if (detail.includes('orientation')) {
      return 'Orientation must be landscape or portrait.';
    }
    return `Check the field limits: recipient name (2–${MAX_RECIPIENT_NAME}), subject (2–${MAX_SUBJECT}), printed wording (≤${MAX_BODY}), and expiry ≥ issue date.`;
  }
  if (cause instanceof DataError && cause.code === '23503') {
    return 'No member account matches that member UID. Leave the field blank if the recipient does not have an account.';
  }
  return msg;
}

// ---------------------------------------------------------------------------
// §11.1 The amendment chain
// ---------------------------------------------------------------------------
// A certificate's history is not a list of revisions to open three at a time. The
// database already returns each link with the fields that differ from the next one
// (`certificate_chain`); this turns that into the two things a reader needs: what
// changed, and why it is still visible that it was once revoked.
export type ChainLink = {
  readonly code: string;
  readonly revision: number;
  readonly status: string;
  readonly issued_on: string;
  readonly expires_on: string | null;
  readonly recipient_name: string;
  readonly subject: string;
  readonly reason: string;
  readonly edited_by: string;
  readonly edited_at: string | null;
  readonly changes: readonly ChainChange[];
};

export type ChainChange = {
  readonly field: string;
  readonly from: string | null;
  readonly to: string | null;
};

/** One row of the revocation ledger a reader is shown. */
export type RevocationRecord = {
  readonly revoked_at: string;
  readonly reason: string;
  readonly restored_at: string;
  readonly restored_by: string;
  readonly restore_reason: string;
};

/**
 * Reads the `revoked_history` column defensively.
 *
 * The column is JSONB written by a trigger-free RPC, so it can arrive as an array, as
 * a JSON string (a driver that hands back text), or as null on rows issued before
 * 0147. A card is not allowed to throw because one row predates a migration, and it is
 * not allowed to silently show "never revoked" for a row whose history failed to
 * parse — so a malformed value is reported as a problem, not as an empty list.
 */
export function parseRevocationHistory(raw: unknown): {
  readonly records: readonly RevocationRecord[];
  readonly malformed: boolean;
} {
  if (raw === null || raw === undefined || raw === '') return { records: [], malformed: false };
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return { records: [], malformed: true };
    }
  }
  if (!Array.isArray(value)) return { records: [], malformed: true };
  const records: RevocationRecord[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') return { records: [], malformed: true };
    const row = entry as Record<string, unknown>;
    const revokedAt = String(row['revoked_at'] ?? '');
    if (revokedAt === '') continue;
    records.push({
      revoked_at: revokedAt,
      reason: String(row['reason'] ?? ''),
      restored_at: String(row['restored_at'] ?? ''),
      restored_by: String(row['restored_by'] ?? ''),
      restore_reason: String(row['restore_reason'] ?? ''),
    });
  }
  // Oldest first, because that is the order they happened in and the order somebody
  // reading a dispute expects.
  return {
    records: records.sort((a, b) => a.revoked_at.localeCompare(b.revoked_at)),
    malformed: false,
  };
}

/** A sentence for the top of a restored certificate, or '' when it never was revoked. */
export function revocationSummary(records: readonly RevocationRecord[]): string {
  if (records.length === 0) return '';
  const last = records[records.length - 1];
  if (last === undefined) return '';
  const times = records.length === 1 ? 'once' : `${records.length} times`;
  const why = last.reason.trim() === '' ? 'no reason recorded' : last.reason.trim();
  const back =
    last.restore_reason.trim() === '' ? 'restored' : `restored: ${last.restore_reason.trim()}`;
  return `This certificate has been revoked ${times}. It was revoked ${why}, then ${back}.`;
}

/**
 * The chain newest-first, with the revision number a reader is looking at and a
 * human field name for each change.
 *
 * `changes` from the database is already a diff against the next (newer) link, so it
 * needs no recomputation here — recomputing it in the client is what produced a card
 * that compared every revision against the *current* row and therefore reported the
 * same three differences eight times.
 */
const CHAIN_FIELD_LABELS: Readonly<Record<string, string>> = {
  recipient_name: 'Recipient',
  subject: 'Subject',
  status: 'Status',
  expires_on: 'Expiry',
};

export function chainFieldLabel(field: string): string {
  return CHAIN_FIELD_LABELS[field] ?? field.replace(/_/g, ' ');
}

export type ChainEntry = {
  readonly revision: number;
  readonly status: string;
  readonly at: string | null;
  readonly reason: string;
  readonly actor: string;
  readonly changes: readonly {
    readonly label: string;
    readonly from: string;
    readonly to: string;
  }[];
  /** True for the link that is the certificate as it stands now. */
  readonly current: boolean;
};

export function describeChain(links: readonly ChainLink[]): readonly ChainEntry[] {
  return links.map((link, index) => ({
    revision: link.revision,
    status: link.status,
    at: link.edited_at,
    reason: link.reason,
    actor: link.edited_by,
    current: index === 0,
    changes: (link.changes ?? []).map((c) => ({
      label: chainFieldLabel(c.field),
      from: c.from === null || c.from === '' ? '—' : c.from,
      to: c.to === null || c.to === '' ? '—' : c.to,
    })),
  }));
}

/** Whether a certificate's stored hash still describes its own content. */
export type VerificationState = {
  readonly kind: string;
  readonly found: boolean;
  readonly state: string;
  readonly reason: string;
  readonly supersededBy: string;
  readonly hashMatches: boolean | null;
};

export function describeVerification(row: {
  readonly kind: string;
  readonly found: boolean;
  readonly state: string;
  readonly reason: string | null;
  readonly superseded_by: string | null;
  readonly hash_matches: boolean | null;
}): VerificationState {
  return {
    kind: row.kind,
    found: row.found,
    state: row.state,
    reason: row.reason ?? '',
    supersededBy: row.superseded_by ?? '',
    hashMatches: row.hash_matches,
  };
}

/**
 * The one line a person holding a printed document came to read.
 *
 * `not_found` and `revoked` are deliberately different sentences: a revoked
 * certificate is one we issued and then withdrew, and telling somebody their document
 * is "not ours" when we revoked it would be a false accusation of forgery.
 */
export function verificationSentence(v: VerificationState): string {
  switch (v.state) {
    case 'valid':
      return v.hashMatches === false
        ? 'This certificate is current, but its stored text no longer matches the record it was issued from. Ask the registry to reissue it.'
        : 'This certificate is current and matches the record it was issued from.';
    case 'revoked':
      return v.reason === ''
        ? 'We issued this certificate and have since revoked it.'
        : `We issued this certificate and have since revoked it: ${v.reason}`;
    case 'withdrawn':
      return v.reason === ''
        ? 'This notice was published and has since been withdrawn.'
        : `This notice was published and has since been withdrawn: ${v.reason}`;
    case 'published':
      return 'This notice is current.';
    case 'draft':
      return 'This notice has not been published.';
    case 'not_found':
    default:
      return 'No document with that code is in our registry. Check the code printed on it.';
  }
}

/** Restoring a certificate needs a reason the reader will eventually be shown. */
export function restoreProblems(reason: string): readonly string[] {
  const problems: string[] = [];
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    problems.push('Give a reason for the restoration — it is shown beside the revocation.');
  } else if (trimmed.length > 300) {
    problems.push(`Keep the restoration reason to ${MAX_REVOKE_REASON} characters or fewer.`);
  }
  return problems;
}
