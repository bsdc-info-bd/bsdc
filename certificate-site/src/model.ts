import { normaliseDocCode } from '@kit';

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
};

export type RegistryRow = {
  readonly code: string;
  readonly template_key: string;
  readonly recipient_name: string;
  readonly subject: string;
  readonly issued_on: string;
  readonly expires_on: string | null;
  readonly status: 'issued' | 'revoked';
  readonly revoke_reason: string;
  readonly verifications: number;
};

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
export function draftProblems(draft: IssueDraft): readonly string[] {
  const problems: string[] = [];
  if (draft.templateKey === '') problems.push('Choose a template.');
  if (draft.recipientName.trim().length < 2) problems.push('The recipient needs a name.');
  if (draft.subject.trim().length < 2) {
    problems.push('Say what the certificate is for: the course, the contribution, the role.');
  }
  if (!DATE.test(draft.issuedOn)) problems.push('The issue date must be a calendar date.');
  if (draft.expiresOn !== '' && !DATE.test(draft.expiresOn)) {
    problems.push('The expiry date must be a calendar date, or empty for one that never expires.');
  }
  if (DATE.test(draft.issuedOn) && DATE.test(draft.expiresOn) && draft.expiresOn < draft.issuedOn) {
    problems.push('A certificate cannot expire before it was issued.');
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
export function parseBatch(text: string): BatchParse {
  const rows: BatchRow[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();

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
    if (subject.length < 2) {
      problems.push(`Line ${String(line)}: add what the certificate is for, after a comma.`);
      return;
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
