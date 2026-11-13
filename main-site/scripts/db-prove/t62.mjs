/**
 * Proof for 0091: certificate issuance, editing, amendment/reissue, revocation,
 * and template saving validate bounds and foreign keys explicitly with clear
 * 22023 messages instead of surfacing raw SQLSTATE 23514/23503 failures.
 */
import assert from 'node:assert/strict';
import { makeDb } from './lib.mjs';

const db = await makeDb();
let checks = 0;
const ok = (condition, label) => {
  assert.ok(condition, label);
  checks += 1;
  console.log(`ok    ${label}`);
};
const eq = (actual, expected, label) => {
  assert.equal(actual, expected, label);
  checks += 1;
  console.log(`ok    ${label}`);
};

async function caller(uid, role, sql, params = [], claimsRole = 'authenticated') {
  const payload = JSON.stringify({
    sub: uid,
    role: claimsRole,
    bsdc_role: role,
    staff: role !== 'member',
  });
  await db.exec(
    `set role ${claimsRole}; select set_config('request.jwt.claims', $jwt$${payload}$jwt$, false);`,
  );
  try {
    return { rows: (await db.query(sql, params)).rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec('reset role');
  }
}

try {
  await db.exec(`
    insert into public.profiles (uid, username, display_name, role, status) values
      ('admin-u',  'adminuser',  'Admin Person',  'admin',  'active'),
      ('member-u', 'memberuser', 'Member Person', 'member', 'active');
    insert into public.staff_records (uid, staff_no, department, designation, is_active) values
      ('admin-u', 'BSDC-OP-0010', 'Operations', 'Admin', true);
  `);

  // 1. issue_certificate enforces bounds & empty/missing recipient_uid cleanly (22023, never 23514/23503)
  eq(
    (
      await caller(
        'admin-u',
        'admin',
        `select public.issue_certificate('course-completion', $1, 'Subject', null, '2026-11-11', null, '')`,
        ['A'.repeat(121)],
      )
    ).error?.code,
    '22023',
    'issue_certificate rejects recipient_name > 120 chars with 22023',
  );
  eq(
    (
      await caller(
        'admin-u',
        'admin',
        `select public.issue_certificate('course-completion', 'Ayesha Rahman', $1, null, '2026-11-11', null, '')`,
        ['S'.repeat(201)],
      )
    ).error?.code,
    '22023',
    'issue_certificate rejects subject > 200 chars with 22023',
  );
  eq(
    (
      await caller(
        'admin-u',
        'admin',
        `select public.issue_certificate('course-completion', 'Ayesha Rahman', 'Subject', 'missing-uid', '2026-11-11', null, '')`,
      )
    ).error?.code,
    '22023',
    'issue_certificate rejects missing recipient_uid with 22023 instead of 23503',
  );
  eq(
    (
      await caller(
        'admin-u',
        'admin',
        `select public.issue_certificate('course-completion', 'Ayesha Rahman', 'Subject', null, '2026-11-11', '2026-11-10', '')`,
      )
    ).error?.code,
    '22023',
    'issue_certificate rejects expires_on < issued_on with 22023',
  );
  eq(
    (
      await caller(
        'admin-u',
        'admin',
        `select public.issue_certificate('course-completion', 'Ayesha Rahman', 'Subject', null, '2026-11-11', null, $1)`,
        ['B'.repeat(1201)],
      )
    ).error?.code,
    '22023',
    'issue_certificate rejects body > 1200 chars with 22023',
  );

  // Empty string recipient_uid is normalized to null rather than triggering 23503 FK failure
  const issued = await caller(
    'admin-u',
    'admin',
    `select public.issue_certificate('course-completion', $1, $2, '', '2026-11-11', '2026-11-11', $3) as code`,
    ['A'.repeat(120), 'S'.repeat(200), 'B'.repeat(1200)],
  );
  const code = issued.rows[0]?.code;
  ok(
    issued.error === null && typeof code === 'string',
    'issue_certificate succeeds at exact max boundaries (120/200/1200) and normalizes blank UID',
  );

  // 2. edit_issued_certificate rejects invalid bounds/expanded body/missing UID with 22023
  for (const [label, params] of [
    ['recipient_name > 120', [code, 'N'.repeat(121), 'Track', 'Body', '2026-11-11', null, null, 'reason']],
    ['subject > 200', [code, 'Ayesha Rahman', 'S'.repeat(201), 'Body', '2026-11-11', null, null, 'reason']],
    ['raw body > 1200', [code, 'Ayesha Rahman', 'Track', 'B'.repeat(1201), '2026-11-11', null, null, 'reason']],
    [
      'placeholder-expanded body > 1200',
      [code, 'A'.repeat(100), 'S'.repeat(180), '{recipient} {subject} '.repeat(5), '2026-11-11', null, null, 'reason'],
    ],
    ['expires_on < issued_on', [code, 'Ayesha Rahman', 'Track', 'Body', '2026-11-11', '2026-11-10', null, 'reason']],
    ['missing recipient_uid', [code, 'Ayesha Rahman', 'Track', 'Body', '2026-11-11', null, 'ghost-uid', 'reason']],
  ]) {
    const res = await caller(
      'admin-u',
      'admin',
      `select public.edit_issued_certificate($1, $2, $3, $4, $5, $6, $7, $8)`,
      params,
    );
    eq(res.error?.code, '22023', `edit_issued_certificate rejects ${label} with 22023`);
  }

  // Exact max boundary edit with valid UID and >300 char reason succeeds and records snapshot
  const edited = await caller(
    'admin-u',
    'admin',
    `select public.edit_issued_certificate($1, $2, $3, $4, '2026-11-11', '2027-11-11', 'member-u', $5) as rev`,
    [code, 'R'.repeat(120), 'T'.repeat(200), 'W'.repeat(1200), 'X'.repeat(350)],
  );
  eq(edited.rows[0]?.rev, 2, 'edit_issued_certificate succeeds at max bounds and stores rev #2');

  // 3. amend_and_reissue_certificate validates cleanly and dispatches notification with long subject
  eq(
    (
      await caller(
        'admin-u',
        'admin',
        `select public.amend_and_reissue_certificate($1, 'course-completion', 'Ayesha Rahman', $2, '', '2026-11-11', null, 'member-u', 'amendment')`,
        [code, 'S'.repeat(201)],
      )
    ).error?.code,
    '22023',
    'amend_and_reissue_certificate rejects subject > 200 with 22023',
  );
  const amended = await caller(
    'admin-u',
    'admin',
    `select public.amend_and_reissue_certificate($1, 'course-completion', 'Ayesha Rahman', $2, '', '2026-11-11', null, 'member-u', 'amendment') as code`,
    [code, 'S'.repeat(200)],
  );
  const newCode = amended.rows[0]?.code;
  ok(
    amended.error === null && typeof newCode === 'string',
    'amend_and_reissue_certificate succeeds with 200-char subject and recipient_uid',
  );

  // 4. revoke_issued_certificate enforces <= 300 chars and normalizes code case/whitespace
  eq(
    (
      await caller(
        'admin-u',
        'admin',
        `select public.revoke_issued_certificate($1, $2)`,
        [newCode, 'R'.repeat(301)],
      )
    ).error?.code,
    '22023',
    'revoke_issued_certificate rejects reason > 300 with 22023',
  );
  const revoked = await caller(
    'admin-u',
    'admin',
    `select public.revoke_issued_certificate($1, $2)`,
    [`  ${newCode.toLowerCase()}  `, 'R'.repeat(300)],
  );
  eq(revoked.error, null, 'revoke_issued_certificate accepts 300-char reason and normalized code');

  // 5. save_certificate_template rejects over-limit fields with 22023
  for (const [label, params] of [
    ['name > 80', ['custom-tpl', 'N'.repeat(81), 'Purpose', 'Heading', 'Body', '#0f766e', 'landscape']],
    ['purpose > 200', ['custom-tpl', 'Name', 'P'.repeat(201), 'Heading', 'Body', '#0f766e', 'landscape']],
    ['heading > 160', ['custom-tpl', 'Name', 'Purpose', 'H'.repeat(161), 'Body', '#0f766e', 'landscape']],
    ['body > 1200', ['custom-tpl', 'Name', 'Purpose', 'Heading', 'B'.repeat(1201), '#0f766e', 'landscape']],
  ]) {
    const res = await caller(
      'admin-u',
      'admin',
      `select * from public.save_certificate_template($1, $2, $3, $4, $5, $6, $7, 'Director', 'BSDC', true, 45)`,
      params,
    );
    eq(res.error?.code, '22023', `save_certificate_template rejects ${label} with 22023`);
  }

  const savedTpl = await caller(
    'admin-u',
    'admin',
    `select * from public.save_certificate_template('custom-tpl', $1, $2, $3, $4, '#0F766E', 'portrait', 'Director', 'BSDC', true, 45)`,
    ['N'.repeat(80), 'P'.repeat(200), 'H'.repeat(160), 'B'.repeat(1200)],
  );
  eq(savedTpl.rows[0]?.accent, '#0f766e', 'save_certificate_template succeeds at exact max limits');

  // 6. Security: anon and member remain strictly denied
  eq(
    (
      await caller(
        '',
        'member',
        `select public.revoke_issued_certificate($1, 'reason')`,
        [code],
        'anon',
      )
    ).error?.code,
    '42501',
    'anon cannot call revoke_issued_certificate',
  );
  eq(
    (
      await caller(
        'member-u',
        'member',
        `select public.issue_certificate('course-completion', 'X', 'Y', null, '2026-11-11', null, '')`,
      )
    ).error?.code,
    '42501',
    'member cannot call issue_certificate',
  );

  console.log(`\nPASS t62 (${checks} assertions passed)`);
} finally {
  await db.close();
}
