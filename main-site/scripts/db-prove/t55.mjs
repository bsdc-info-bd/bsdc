/** Corporate actions use the current database role, not stale Firebase claims. */
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

async function caller(uid, sql, args = [], extra = {}, role = 'authenticated') {
  const claims = JSON.stringify({ sub: uid, role, bsdc_role: 'owner', staff: true, ...extra });
  await db.exec(
    `set role ${role}; select set_config('request.jwt.claims', $jwt$${claims}$jwt$, false);`,
  );
  try {
    return { rows: (await db.query(sql, args)).rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec('reset role');
  }
}
const staffClaims = { email: 'staff@example.test', email_verified: true };
const bootstrapClaims = { email: 'rrc@bsdc.info.bd', email_verified: true };
const campaignSql = `select public.staff_setup_campaign(
  'advertiser', 'Corporate permission proof', 'cpm', 100, 10000, 10000,
  null, null, '{}'::text[], '{}'::text[], 'bn', false, 'feed', '', '', '', '', ''
) as id`;
const certificateSql = `select public.issue_certificate('course-completion',
  'Recipient Name', 'Permission test', null, current_date, null, 'The issued wording') as code`;
const reportSql = `select * from public.start_performance_report('main-site', 28, 'Permission test', array['overall'])`;

try {
  await db.exec(`insert into public.profiles (uid, display_name, role, status) values
    ('admin-actor', 'Admin Person', 'admin', 'active'),
    ('owner-actor', 'Owner Person', 'owner', 'active'),
    ('moderator-actor', 'Moderator Person', 'moderator', 'active'),
    ('member-actor', 'Member Person', 'member', 'active'),
    ('suspended-actor', 'Suspended Person', 'admin', 'suspended'),
    ('bootstrap-actor', 'Bootstrap Person', 'member', 'active'),
    ('advertiser', 'Advertiser Person', 'member', 'active');`);

  for (const uid of ['admin-actor', 'owner-actor']) {
    // bsdc_role=member proves that a stale or missing application claim cannot
    // hide an actual current database promotion.
    const claims = { ...staffClaims, bsdc_role: 'member', staff: false };
    const templates = await caller(
      uid,
      'select count(*)::integer as n from public.certificate_templates',
      [],
      claims,
    );
    ok(
      templates.error === null && Number(templates.rows[0]?.n) > 0,
      `${uid} can read certificate templates`,
    );
    for (const [label, sql] of [
      ['campaign owners', "select * from public.campaign_owners('', 50)"],
      ['campaign inventory', 'select * from public.ad_inventory()'],
      ['campaign book', 'select * from public.campaign_book(50)'],
    ]) {
      ok((await caller(uid, sql, [], claims)).error === null, `${uid} can read ${label}`);
    }
    const campaign = await caller(uid, campaignSql, [], claims);
    ok(
      campaign.error === null && typeof campaign.rows[0]?.id === 'string',
      `${uid} can create a campaign`,
    );
    const certificate = await caller(uid, certificateSql, [], claims);
    ok(
      certificate.error === null && typeof certificate.rows[0]?.code === 'string',
      `${uid} can issue a certificate`,
    );
    const print = await caller(
      uid,
      'select * from public.certificate_for_print($1)',
      [certificate.rows[0].code],
      claims,
    );
    eq(
      print.rows[0]?.body,
      'The issued wording',
      `${uid} can retrieve the issued certificate for PDF`,
    );
    const performance = await caller(
      uid,
      `select * from public.performance_vitals_overall(28, 'main-site')`,
      [],
      claims,
    );
    ok(performance.error === null, `${uid} can read performance metrics`);
    const report = await caller(uid, reportSql, [], claims);
    ok(
      report.error === null && typeof report.rows[0]?.receipt_id === 'string',
      `${uid} can start a performance report`,
    );
    const finalized = await caller(
      uid,
      `select public.finalize_performance_report($1, $2) as result`,
      [report.rows[0].receipt_id, 'ab'.repeat(32)],
      claims,
    );
    eq(finalized.rows[0]?.result, true, `${uid} can finalize the report`);
  }

  const bootstrapRole = await caller(
    'bootstrap-actor',
    'select * from public.my_role()',
    [],
    bootstrapClaims,
  );
  eq(
    bootstrapRole.rows[0]?.role,
    'owner',
    'verified main administrator has the effective owner role',
  );
  ok(
    (await caller('bootstrap-actor', campaignSql, [], bootstrapClaims)).error === null,
    'verified bootstrap owner can create a campaign',
  );
  ok(
    (await caller('bootstrap-actor', certificateSql, [], bootstrapClaims)).error === null,
    'verified bootstrap owner can issue a certificate',
  );
  ok(
    (await caller('bootstrap-actor', reportSql, [], bootstrapClaims)).error === null,
    'verified bootstrap owner can start a report',
  );

  for (const uid of ['member-actor', 'suspended-actor']) {
    for (const [label, sql] of [
      ['campaign', campaignSql],
      ['certificate', certificateSql],
      ['report', reportSql],
    ]) {
      eq(
        (await caller(uid, sql, [], staffClaims)).error?.code,
        '42501',
        `${uid} cannot use ${label} with a stale owner claim`,
      );
    }
  }
  const provisioned = await caller(
    'member-actor',
    `select role::text from public.provision_staff('Member Person')`,
    [],
    staffClaims,
  );
  eq(provisioned.rows[0]?.role, 'member', 'provisioning cannot reverse a demotion');
  eq(
    (await caller('member-actor', 'select role from public.my_role()', [], staffClaims)).rows[0]
      ?.role,
    'member',
    'demoted member remains a member after provisioning',
  );
  await db.exec(`insert into public.profiles (uid, display_name, role, status)
    values ('missing-staff', 'Former Staff', 'owner', 'active');
    delete from public.profiles where uid = 'missing-staff';`);
  const stale = await caller(
    'missing-staff',
    `select role::text from public.provision_staff('Missing Person')`,
    [],
    staffClaims,
  );
  eq(
    stale.rows[0]?.role,
    'member',
    'a deleted profile and stale owner token do not recreate staff',
  );
  eq(
    (await caller('missing-staff', certificateSql, [], staffClaims)).error?.code,
    '42501',
    'the recreated member cannot issue certificates',
  );
  const newBootstrap = await caller(
    'new-bootstrap',
    `select role::text from public.provision_staff('First Owner')`,
    [],
    bootstrapClaims,
  );
  eq(
    newBootstrap.rows[0]?.role,
    'owner',
    'a verified bootstrap owner can still create a first staff profile',
  );
  const unverified = await caller(
    'unverified-bootstrap',
    `select role::text from public.provision_staff('Unverified')`,
    [],
    { email: 'rrc@bsdc.info.bd', email_verified: false },
  );
  eq(unverified.rows[0]?.role, 'member', 'an unverified bootstrap email cannot mint staff');
  for (let i = 0; i < 2; i += 1) {
    eq(
      (
        await caller(
          'bootstrap-actor',
          `select public.claim_bootstrap_role() as role`,
          [],
          bootstrapClaims,
        )
      ).rows[0]?.role,
      'owner',
      'an active verified bootstrap owner can claim their role idempotently',
    );
  }
  await db.exec(`update public.profiles set status = 'suspended' where uid = 'bootstrap-actor'`);
  eq(
    (await caller('bootstrap-actor', reportSql, [], bootstrapClaims)).error?.code,
    '42501',
    'suspension revokes effective bootstrap permissions',
  );
  eq(
    (await caller('bootstrap-actor', `select public.claim_bootstrap_role()`, [], bootstrapClaims))
      .error?.code,
    '42501',
    'a suspended bootstrap owner cannot promote their profile',
  );
  eq(
    (await caller('bootstrap-actor', `select public.provision_staff('Again')`, [], bootstrapClaims))
      .error?.code,
    '42501',
    'a suspended bootstrap owner cannot provision around suspension',
  );
  eq(
    (await caller('moderator-actor', campaignSql, [], staffClaims)).error?.code,
    '42501',
    'moderators cannot manage ads',
  );
  ok(
    (await caller('moderator-actor', certificateSql, [], staffClaims)).error === null,
    'moderators retain certificate access',
  );
  ok(
    (await caller('moderator-actor', reportSql, [], staffClaims)).error === null,
    'moderators retain performance access',
  );
  eq(
    (await caller('', reportSql, [], {}, 'anon')).error?.code,
    '42501',
    'anonymous sessions cannot create reports',
  );

  eq(
    (await caller('', `select public.provision_staff('Anonymous')`, [], {}, 'anon')).error?.code,
    '42501',
    'anonymous sessions cannot provision an identity',
  );

  for (let i = 0; i < 2; i += 1) {
    await db.exec(
      readFileSync(
        join(MIGRATIONS_DIR, '0081_corporate_identity_follows_database_authority.sql'),
        'utf8',
      ),
    );
    eq(
      (
        await caller(
          'member-actor',
          `select role::text from public.provision_staff()`,
          [],
          staffClaims,
        )
      ).rows[0]?.role,
      'member',
      'reapplying the migration preserves the demotion guard',
    );
  }
  console.log(`SUMMARY: ${checks} passed, 0 failed`);
} finally {
  await db.close();
}
