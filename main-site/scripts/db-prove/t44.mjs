/** Cached staff tokens must not survive demotion or suspension. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDb, MIGRATIONS_DIR } from './lib.mjs';
const db = await makeDb();
let checks = 0;
async function as(uid, sql, extra = {}) {
  try {
    const claims = JSON.stringify({
      sub: uid,
      role: 'authenticated',
      bsdc_role: 'owner',
      staff: true,
      ...extra,
    });
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claims', '${claims}', false)`,
    );
    return (await db.query(sql)).rows;
  } finally {
    await db.exec('reset role');
  }
}
async function authority(uid, expected, extra = {}) {
  const rows = await as(
    uid,
    'select bsdc.actor_role() as role, bsdc.is_staff() as staff, bsdc.is_moderator() as moderator',
    extra,
  );
  assert.equal(rows[0].role, expected);
  const staff = ['moderator', 'admin', 'owner'].includes(expected);
  assert.equal(rows[0].staff, staff);
  assert.equal(rows[0].moderator, staff);
  checks += 3;
}
try {
  await db.exec(`insert into public.profiles (uid, username, display_name, role) values
    ('staff', 'currentstaff', 'Staff', 'admin'), ('member', 'currentmember', 'Member', 'member');
    insert into public.profiles (uid, username, display_name, status)
      values ('hidden', 'currenthidden', 'Hidden', 'suspended');`);
  await authority('staff', 'admin', { staff: false, bsdc_role: 'member' });
  assert.equal(
    (await as('staff', "select uid from public.profiles where uid = 'hidden'")).length,
    1,
  );
  checks++;
  await db.exec(`update public.profiles set role = 'member' where uid = 'staff'`);
  await authority('staff', 'member');
  assert.equal(
    (await as('staff', "select uid from public.profiles where uid = 'hidden'")).length,
    0,
  );
  checks++;
  await db.exec(`update public.profiles set role = 'moderator' where uid = 'staff'`);
  await authority('staff', 'moderator', { staff: false, bsdc_role: 'member' });
  for (const status of ['suspended', 'deactivated', 'deleted']) {
    await db.exec(`update public.profiles set status = '${status}' where uid = 'staff'`);
    await authority('staff', 'member');
    assert.equal(
      (await as('staff', "select uid from public.profiles where uid = 'hidden'")).length,
      0,
    );
    checks++;
  }
  await authority('missing', 'member');
  await authority('', 'member');
  const bootstrap = { email: 'rrc@bsdc.info.bd', email_verified: true };
  await authority('member', 'owner', bootstrap);
  await db.exec(`update public.profiles set status = 'suspended' where uid = 'member'`);
  await authority('member', 'member', bootstrap);
  // Bootstrap still supports first sign-in before a profile exists.
  await authority('new-bootstrap', 'owner', bootstrap);
  await authority('', 'member', bootstrap);
  for (let i = 0; i < 2; i++) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, '0071_current_account_authority.sql'), 'utf8'));
    await authority('staff', 'member');
  }
  console.log(`SUMMARY: ${checks} passed, 0 failed`);
} finally {
  await db.close();
}
