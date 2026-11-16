/**
 * Proof for 0086: certificate editing & revision history, certificate template
 * studio, live notice editing & version revert, ack roster, CLI macros,
 * telemetry snapshot, and bulk governance RPCs with RLS + anon guards.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDb, MIGRATIONS_DIR } from './lib.mjs';

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
      ('owner-u',  'owneruser', 'Owner Person',     'owner',     'active'),
      ('admin-u',  'adminuser', 'Admin Person',     'admin',     'active'),
      ('mod-u',    'moduser',   'Moderator Person', 'moderator', 'active'),
      ('member-u', 'memberusr', 'Member Person',    'member',    'active'),
      ('other-u',  'otherusr',  'Other Member',     'member',    'active');
    insert into public.staff_records (uid, staff_no, department, designation, is_active) values
      ('owner-u', 'BSDC-EN-0001', 'Engineering', 'CEO', true),
      ('admin-u', 'BSDC-OP-0002', 'Operations',  'Admin', true);
  `);

  const issue = await caller(
    'admin-u',
    'admin',
    `select public.issue_certificate('course-completion', 'Rafi Islam', 'Full Stack Bootcamp', 'member-u', '2026-01-10', '2027-01-10', '') as code`,
  );
  const code = issue.rows[0]?.code;
  ok(issue.error === null && typeof code === 'string', 'admin can issue initial certificate');

  // Member and anon are refused edit / template / bulk RPCs
  eq(
    (
      await caller(
        'member-u',
        'member',
        `select public.edit_issued_certificate($1, 'Hacker', 'Hack', '', '2026-01-10', null, null, 'reason')`,
        [code],
      )
    ).error?.code,
    '42501',
    'member cannot edit an issued certificate',
  );
  eq(
    (
      await caller(
        '',
        'member',
        `select public.edit_issued_certificate($1, 'Anon', 'Hack', '', '2026-01-10', null, null, 'reason')`,
        [code],
        'anon',
      )
    ).error?.code,
    '42501',
    'anon cannot call certificate edit RPC',
  );

  // Edit with empty reason rejected
  eq(
    (
      await caller(
        'admin-u',
        'admin',
        `select public.edit_issued_certificate($1, 'Rafi Rahman', 'Full Stack', '', '2026-01-10', '2028-01-10', null, 'no')`,
        [code],
      )
    ).error?.code,
    '22023',
    'certificate edit rejects reason under 3 chars',
  );

  // Valid in-place edit records revision snapshot and increments revision
  const edited = await caller(
    'admin-u',
    'admin',
    `select public.edit_issued_certificate($1, 'Rafiur Rahman', 'Advanced TypeScript Track', 'Awarded to {recipient} for {subject} on {date}.', '2026-01-15', '2028-01-15', 'member-u', 'Spelling and date correction') as rev`,
    [code],
  );
  eq(edited.rows[0]?.rev, 2, 'edit_issued_certificate increments revision to 2');

  const detail = await caller(
    'admin-u',
    'admin',
    `select * from public.certificate_detail($1)`,
    [code],
  );
  eq(detail.rows[0]?.recipient_name, 'Rafiur Rahman', 'certificate recipient name updated');
  ok(
    detail.rows[0]?.body.includes('15 Jan 2026'),
    'certificate edit substitutes placeholders into body',
  );

  const certHist = await caller(
    'admin-u',
    'admin',
    `select * from public.certificate_history($1)`,
    [code],
  );
  eq(certHist.rows.length, 1, 'certificate_history stores immutable v1 snapshot');
  eq(certHist.rows[0]?.recipient_name, 'Rafi Islam', 'snapshot retains original recipient name');

  // Amend & supersede atomically issues replacement and revokes original
  const amended = await caller(
    'admin-u',
    'admin',
    `select public.amend_and_reissue_certificate($1, 'contribution', 'Rafiur Rahman', 'Lead Contributor', '', '2026-02-01', null, 'member-u', 'Upgraded template tier') as new_code`,
    [code],
  );
  const newCode = amended.rows[0]?.new_code;
  ok(
    amended.error === null && typeof newCode === 'string' && newCode !== code,
    'amend_and_reissue_certificate mints replacement code',
  );
  const oldAfterAmend = await caller(
    'admin-u',
    'admin',
    `select * from public.certificate_detail($1)`,
    [code],
  );
  eq(oldAfterAmend.rows[0]?.status, 'revoked', 'superseded original certificate is revoked');
  eq(oldAfterAmend.rows[0]?.superseded_by, newCode, 'superseded_by points to replacement code');

  // Restore revoked certificate works cleanly
  const restored = await caller(
    'admin-u',
    'admin',
    `select public.restore_issued_certificate($1, 'Audit reinstatement') as rev`,
    [code],
  );
  eq(restored.rows[0]?.rev, 4, 'restore_issued_certificate increments revision and clears revocation');
  eq(
    (await caller('admin-u', 'admin', `select status from public.certificate_detail($1)`, [code]))
      .rows[0]?.status,
    'issued',
    'restored certificate has status issued',
  );

  // Bulk extend expiry & bulk revoke
  const bulkExtend = await caller(
    'admin-u',
    'admin',
    `select public.bulk_certificate_action($1, 'extend_expiry', 'Extended by 1y', '2029-12-31') as n`,
    [[code, newCode]],
  );
  eq(bulkExtend.rows[0]?.n, 2, 'bulk_certificate_action updates both certificates');

  // Save new certificate template
  const tpl = await caller(
    'admin-u',
    'admin',
    `select * from public.save_certificate_template('mentorship', 'Mentorship Fellow', 'Recognizing community mentors.', 'Certificate of Mentorship', 'Awarded to {recipient} for mentoring {subject} ({date}).', '#0f766e', 'landscape', 'CEO', 'BSDC', true, 40)`,
  );
  eq(tpl.rows[0]?.key, 'mentorship', 'save_certificate_template upserts custom template');
  eq(
    (
      await caller(
        'mod-u',
        'moderator',
        `select * from public.save_certificate_template('badmod', 'No', '', 'No', '', '#111111', 'landscape', '', '', true, 50)`,
      )
    ).error?.code,
    '42501',
    'moderator cannot modify certificate templates without settings.write',
  );

  // Notice save with revision + publish + live edit + revert + unpublish + clone + ack roster + bulk
  const nidRes = await caller(
    'admin-u',
    'admin',
    `select public.save_notice_with_revision(null, 'Platform Upgrade Window', 'Scheduled maintenance summary line.', 'Full details for all BSDC community members about upcoming upgrades.', 'operations', 'staff', 'important', true, true, null, null, 'Initial draft') as id`,
  );
  const noticeId = nidRes.rows[0]?.id;
  ok(nidRes.error === null && typeof noticeId === 'string', 'save_notice_with_revision creates draft');

  await caller('admin-u', 'admin', `select public.publish_notice($1, now())`, [noticeId]);
  await caller('admin-u', 'admin', `select public.acknowledge_notice($1)`, [noticeId]);

  const roster = await caller(
    'admin-u',
    'admin',
    `select * from public.notice_ack_roster($1, 50)`,
    [noticeId],
  );
  eq(roster.rows.length, 2, 'notice_ack_roster lists both active staff records');
  const ackedRow = roster.rows.find((r) => r.uid === 'admin-u');
  eq(ackedRow?.acknowledged, true, 'roster shows who acknowledged');

  // Live notice edit cleanly bumps version & logs revision
  await caller(
    'admin-u',
    'admin',
    `select public.save_notice_with_revision($1, 'Platform Upgrade Window Revised', 'Updated summary line.', 'Full updated details for all BSDC community members with revised ETA.', 'operations', 'staff', 'urgent', true, true, now(), null, 'Escalated priority and revised copy')`,
    [noticeId],
  );
  const nHist = await caller(
    'admin-u',
    'admin',
    `select * from public.notice_history($1)`,
    [noticeId],
  );
  eq(nHist.rows.length, 1, 'notice_history captures revision 1 on live edit');
  eq(nHist.rows[0]?.title, 'Platform Upgrade Window', 'notice_history holds prior title');

  const revertedVer = await caller(
    'admin-u',
    'admin',
    `select public.revert_notice_revision($1, 1, 'Restoring original title') as v`,
    [noticeId],
  );
  eq(revertedVer.rows[0]?.v, 3, 'revert_notice_revision creates v3 from v1');

  const cloned = await caller('admin-u', 'admin', `select public.clone_notice($1) as id`, [
    noticeId,
  ]);
  const clonedId = cloned.rows[0]?.id;
  ok(
    cloned.error === null && typeof clonedId === 'string' && clonedId !== noticeId,
    'clone_notice produces distinct draft copy',
  );

  await caller('admin-u', 'admin', `select public.unpublish_notice($1, 'Completed')`, [noticeId]);
  const bulkUnpin = await caller(
    'admin-u',
    'admin',
    `select public.bulk_notice_action($1, 'pin', null) as n`,
    [[noticeId, clonedId]],
  );
  eq(bulkUnpin.rows[0]?.n, 1, 'bulk_notice_action pins unpinned cloned notice cleanly');
  const bulkNotice = await caller(
    'admin-u',
    'admin',
    `select public.bulk_notice_action($1, 'unpin', null) as n`,
    [[noticeId, clonedId]],
  );
  eq(bulkNotice.rows[0]?.n, 2, 'bulk_notice_action unpins both notices cleanly');

  // CLI macros + telemetry + bulk role/status
  const macroIdRes = await caller(
    'owner-u',
    'owner',
    `select public.save_admin_macro('Health sweep', 'Check telemetry & errors', 'telemetry\nerrors list --days=7', 'moderator', true, null) as id`,
  );
  const macroId = macroIdRes.rows[0]?.id;
  ok(macroIdRes.error === null && typeof macroId === 'string', 'save_admin_macro creates shared CLI macro');

  const macroList = await caller('mod-u', 'moderator', `select * from public.list_admin_macros()`);
  eq(macroList.rows.length, 1, 'moderator sees shared macro with moderator min_role');

  const telemetry = await caller('admin-u', 'admin', `select * from public.admin_telemetry_snapshot()`);
  eq(telemetry.rows[0]?.staff_active, 2, 'admin_telemetry_snapshot reports accurate live counts');

  const bulkRole = await caller(
    'owner-u',
    'owner',
    `select public.bulk_people_role($1, 'moderator') as n`,
    [['member-u', 'other-u']],
  );
  eq(bulkRole.rows[0]?.n, 2, 'owner bulk_people_role promotes both targets');

  const bulkStatus = await caller(
    'owner-u',
    'owner',
    `select public.bulk_people_status($1, 'suspended', 'Policy breach') as n`,
    [['other-u']],
  );
  eq(bulkStatus.rows[0]?.n, 1, 'owner bulk_people_status suspends target');

  // Escalation blocked cleanly
  eq(
    (
      await caller(
        'mod-u',
        'moderator',
        `select public.bulk_people_role($1, 'admin')`,
        [['member-u']],
      )
    ).error?.code,
    '42501',
    'moderator cannot invoke bulk_people_role',
  );

  // Re-apply migration cleanly (idempotency check)
  const sql = readFileSync(
    join(MIGRATIONS_DIR, '0086_corporate_admin_suite_and_editing.sql'),
    'utf8',
  );
  await db.exec(sql);
  ok(true, '0086 re-applied idempotently without error');

  console.log(`\nSUMMARY: ${checks} passed, 0 failed`);
} finally {
  await db.close();
}
