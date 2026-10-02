import { describe, expect, it } from 'vitest';
import {
  cardCheckDigit,
  escapePdfText,
  formatDocCode,
  hexToRgb,
  isValidDocCode,
  normaliseDocCode,
  parseDocCode,
  qrMatrix,
  qrPath,
  qrSvg,
  textWidth,
  toLatin,
  verificationUrl,
  wrapText,
} from '@kit';
import {
  EMPTY_DRAFT,
  certificateFilename,
  draftProblems,
  draftToArgs,
  fillTemplate,
  longDate,
  parseBatch,
  registryState,
  resolvedBody,
  type RegistryRow,
  type TemplateRow,
} from './model';
import { buildCertificatePdf, printFromTemplate } from './certificate-pdf';

const template: TemplateRow = {
  key: 'course-completion',
  name: 'Course completion',
  purpose: 'Finishing a track.',
  heading: 'Certificate of Completion',
  body_template: 'This certifies that {recipient} has completed {subject} on {date}.',
  accent: '#1b4332',
  orientation: 'landscape',
  signature_name: 'Chief Executive Officer',
  signature_title: 'Bangladesh Software Development Community',
  is_active: true,
};

const code = (kind: string, body: string): string => `BSDC-${kind}-${body}-${cardCheckDigit(body)}`;

describe('document codes', () => {
  it('accepts a well-formed code of every issued kind', () => {
    expect(isValidDocCode(code('CT', '4A7C21B9'))).toBe(true);
    expect(isValidDocCode(code('NT', '91B2C3D4'))).toBe(true);
    expect(isValidDocCode(code('ID', '12345678'))).toBe(true);
  });

  it('refuses a kind BSDC does not issue, even with a correct digit', () => {
    const parsed = parseDocCode(code('ZZ', '4A7C21B9'));
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.reason).toContain('does not issue');
  });

  it('refuses a mistyped code before any lookup', () => {
    const good = code('CT', '4A7C21B9');
    const wrong = `${good.slice(0, 17)}${(Number(good.slice(17)) + 1) % 10}`;
    const parsed = parseDocCode(wrong);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.reason).toContain('check digit');
  });

  it('repairs the characters a reader confuses and the dashes an editor replaces', () => {
    const valid = code('CT', '4A7C2189');
    const typed = valid.replace('4A7C2189', 'oa7c21i9').replace('BSDC-CT', 'bsdc\u2014ct');
    expect(normaliseDocCode(typed)).toBe(valid);
    expect(isValidDocCode(typed)).toBe(true);
  });

  it('refuses an empty box with an instruction rather than an error', () => {
    const parsed = parseDocCode('   ');
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.reason).toContain('Enter the code');
  });

  it('spaces a code for printing and builds its verification address', () => {
    const valid = code('CT', '4A7C21B9');
    expect(formatDocCode(valid)).toBe(`BSDC-CT 4A7C21B9 ${valid.slice(17)}`);
    expect(verificationUrl('https://vf.main.bsdc.info.bd/', valid)).toBe(
      `https://vf.main.bsdc.info.bd/?code=${valid}`,
    );
  });
});

describe('the issue form', () => {
  const draft = {
    ...EMPTY_DRAFT,
    templateKey: 'course-completion',
    recipientName: 'Ayesha Rahman',
    subject: 'Frontend track 2026',
    issuedOn: '2026-03-10',
  };

  it('is happy with a complete draft', () => {
    expect(draftProblems(draft)).toEqual([]);
  });

  it('names everything missing at once', () => {
    expect(draftProblems(EMPTY_DRAFT).length).toBeGreaterThanOrEqual(3);
  });

  it('refuses an expiry before the issue date', () => {
    expect(draftProblems({ ...draft, expiresOn: '2026-03-09' })).toEqual([
      'A certificate cannot expire before it was issued.',
    ]);
    expect(draftProblems({ ...draft, expiresOn: '2027-03-09' })).toEqual([]);
  });

  it('sends an absent expiry and an absent member as null, not as empty text', () => {
    const args = draftToArgs(draft);
    expect(args['p_expires_on']).toBeNull();
    expect(args['p_recipient_uid']).toBeNull();
    expect(args['p_recipient_name']).toBe('Ayesha Rahman');
  });

  it('fills the template placeholders the way the database will', () => {
    expect(
      fillTemplate(template.body_template, {
        recipient: 'Ayesha Rahman',
        subject: 'Frontend track 2026',
        date: '2026-03-10',
      }),
    ).toBe('This certifies that Ayesha Rahman has completed Frontend track 2026 on 10 Mar 2026.');
  });

  it('prefers an explicit wording over the template, and still fills it in', () => {
    expect(resolvedBody({ ...draft, body: 'Awarded to {recipient}.' }, template)).toBe(
      'Awarded to Ayesha Rahman.',
    );
    expect(resolvedBody(draft, template)).toContain('has completed Frontend track 2026');
  });

  it('reads a date the way a person says it', () => {
    expect(longDate('2026-03-26')).toBe('26 Mar 2026');
    expect(longDate('not a date')).toBe('not a date');
  });
});

describe('batch issuing', () => {
  it('reads one recipient per line and keeps the rest when one line is wrong', () => {
    const parsed = parseBatch('Ayesha Rahman, Frontend track\n\nRafi, \nZaman, Backend track');
    expect(parsed.rows.map((row) => row.name)).toEqual(['Ayesha Rahman', 'Zaman']);
    expect(parsed.problems).toHaveLength(1);
    expect(parsed.problems[0]).toContain('Line 3');
  });

  it('keeps a comma inside the subject', () => {
    const parsed = parseBatch('Ayesha, Frontend track, 2026 cohort');
    expect(parsed.rows[0]?.subject).toBe('Frontend track, 2026 cohort');
  });

  it('refuses the same certificate twice in one batch', () => {
    const parsed = parseBatch('Ayesha, Track\nayesha, track');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.problems[0]).toContain('twice');
  });
});

describe('the registry view', () => {
  const row: RegistryRow = {
    code: code('CT', '4A7C21B9'),
    template_key: 'course-completion',
    recipient_name: 'Ayesha Rahman',
    subject: 'Frontend track',
    issued_on: '2026-01-01',
    expires_on: null,
    status: 'issued',
    revoke_reason: '',
    verifications: 3,
  };
  const today = new Date('2026-03-10T00:00:00Z');

  it('calls a live certificate valid', () => {
    expect(registryState(row, today)).toBe('valid');
  });

  it('calls a revoked certificate revoked, whatever its dates say', () => {
    expect(registryState({ ...row, status: 'revoked', expires_on: '2027-01-01' }, today)).toBe(
      'revoked',
    );
  });

  it('calls a lapsed certificate expired', () => {
    expect(registryState({ ...row, expires_on: '2026-03-09' }, today)).toBe('expired');
    expect(registryState({ ...row, expires_on: '2026-03-10' }, today)).toBe('valid');
  });

  it('builds a filename somebody can find again', () => {
    expect(certificateFilename(row.code, 'Ayesha Rahman')).toBe(`${row.code}-ayesha-rahman.pdf`);
    expect(certificateFilename(row.code, '  ')).toBe(`${row.code}.pdf`);
  });
});

describe('the printed certificate', () => {
  const print = printFromTemplate(template, {
    code: code('CT', '4A7C21B9'),
    recipientName: 'Ayesha Rahman',
    body: 'This certifies that Ayesha Rahman has completed the Frontend track.',
    issuedOn: '2026-03-10',
    expiresOn: null,
    siteUrl: 'https://vf.main.bsdc.info.bd',
  });

  const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

  it('produces a parseable PDF whose size matches its cross-reference table', () => {
    const text = decode(buildCertificatePdf(print));
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    const size = Number(/\/Size (\d+)/.exec(text)?.[1]);
    const entries = text.split('xref')[1]?.match(/\d{10} \d{5} [nf]/g)?.length ?? 0;
    expect(entries).toBe(size);
  });

  it('prints the code and the verification address on the document itself', () => {
    const text = decode(buildCertificatePdf(print));
    expect(text).toContain(print.code);
    expect(text).toContain('vf.main.bsdc.info.bd');
  });

  it('uses landscape for a landscape template and portrait for a portrait one', () => {
    const landscape = decode(buildCertificatePdf(print));
    const portrait = decode(buildCertificatePdf({ ...print, orientation: 'portrait' }));
    expect(landscape).toContain('MediaBox [0 0 841.89 595.28]');
    expect(portrait).toContain('MediaBox [0 0 595.28 841.89]');
  });

  it('survives a name the base-14 fonts cannot draw', () => {
    const text = decode(buildCertificatePdf({ ...print, recipientName: 'আয়েশা রহমান' }));
    expect(text.startsWith('%PDF-1.4')).toBe(true);
  });
});

describe('pdf primitives', () => {
  it('escapes the characters that would end a PDF string', () => {
    expect(escapePdfText('a(b)c\\d')).toBe('a\\(b\\)c\\\\d');
  });

  it('substitutes a space for an undrawable glyph rather than fusing two words', () => {
    expect(toLatin('one\u09aatwo')).toBe('one two');
    expect(toLatin('  spaced   out  ')).toBe('spaced out');
  });

  it('wraps to the width it was given and never loses a word', () => {
    const lines = wrapText('alpha beta gamma delta epsilon', 10, textWidth('alpha beta', 10));
    expect(lines.join(' ').split(' ')).toHaveLength(5);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('reads a hex colour, and falls back to black rather than throwing', () => {
    expect(hexToRgb('#ffffff')).toEqual([1, 1, 1]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgb('nonsense')).toEqual([0, 0, 0]);
  });
});

describe('the verification QR', () => {
  const url = verificationUrl('https://vf.main.bsdc.info.bd', code('CT', '4A7C21B9'));

  it('is square, and the same code every time', () => {
    const first = qrMatrix(url);
    const second = qrMatrix(url);
    expect(first.size).toBeGreaterThan(20);
    expect(first.modules).toHaveLength(first.size);
    expect(first.modules[0]).toHaveLength(first.size);
    expect(second.modules).toEqual(first.modules);
  });

  it('keeps the finder patterns a scanner looks for', () => {
    const matrix = qrMatrix(url);
    expect(matrix.modules[0]?.[0]).toBe(true);
    expect(matrix.modules[0]?.[6]).toBe(true);
    expect(matrix.modules[1]?.[1]).toBe(false);
  });

  it('draws one path per dark module and wraps it in a quiet zone', () => {
    const matrix = qrMatrix(url);
    const dark = matrix.modules.flat().filter(Boolean).length;
    expect(qrPath(matrix).match(/M/g)).toHaveLength(dark);
    const svg = qrSvg(url, { quietZone: 4 });
    expect(svg).toContain(`viewBox="0 0 ${matrix.size + 8} ${matrix.size + 8}"`);
  });
});
