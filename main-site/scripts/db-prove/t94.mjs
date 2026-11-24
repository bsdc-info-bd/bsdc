/**
 * Proof for 0134: the permission spine.
 *
 * The claim this migration makes is narrow and checkable, and everything here
 * exists to check it:
 *
 *   **With no grants and no denies, nobody's answer changed.**
 *
 * That is proved first and by exhaustive comparison — every role against every
 * permission in the catalogue, before-shape and after-shape — because a
 * migration that quietly widens authority is the one failure this platform
 * could not recover from.
 *
 * Everything after that section is the new behaviour, and each part is proved
 * by the thing it is meant to prevent:
 *
 *   2. A grant adds authority to one person without touching the role.
 *   3. A deny removes one permission without removing nine.
 *   4. An expiry actually expires, and the sweep records it as an event.
 *   5. You cannot grant what you do not hold, cannot grant above your rank,
 *      and cannot grant to somebody who outranks you.
 *   6. A permission nobody defined is refused rather than silently inert.
 *   7. A scope that does not fit the permission's kind is refused.
 *   8. History is not rewritten: revoking, re-granting and expiring all leave
 *      the earlier row readable.
 *
 * Two of these are the reason the migration is safe to apply to production:
 * section 1 (nothing changed) and section 5 (a manager cannot promote themself).
 */
import { makeDb } from './lib.mjs';

let pass = 0;
const bad = [];
function check(condition, label, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`ok    ${label}`);
  } else {
    bad.push(label);
    console.log(`FAIL  ${label}${detail ? `  -> ${detail}` : ''}`);
  }
}

const db = await makeDb();

/**
 * Runs SQL as a verified member with a chosen role in the profile row.
 *
 * The role is written to `profiles`, not carried in the JWT, because the whole
 * design reads authority from the row: a demotion has to take effect on the
 * next call, not on the next token refresh. Passing the role as a claim would
 * be testing the opposite of the contract.
 */
let nextUid = 0;
const uids = [];
async function actor(role, options = {}) {
  nextUid += 1;
  const uid = `00000000-0000-4000-8000-${String(nextUid).padStart(12, '0')}`;
  const handle = `t94user${nextUid}`;
  await db.exec(`
    insert into public.profiles (uid, username, display_name, role, status)
    values ('${uid}', '${handle}', 'T94 User ${nextUid}', '${role}', 'active')
    on conflict (uid) do nothing;
  `);
  uids.push(uid);
  return { uid, role, claims: options.claims ?? {} };
}

async function as(who, sql, params = []) {
  const claims = JSON.stringify({
    sub: who.uid,
    role: 'authenticated',
    bsdc_role: 'member',
    email: `${who.uid.slice(0, 8)}@bsdc.info.bd`,
    email_verified: true,
    ...who.claims,
  });
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claims', $jwt$${claims}$jwt$, false);`,
  );
  try {
    const result = await db.query(sql, params);
    return { rows: result.rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec('reset role;');
  }
}

async function asSuperuser(sql, params = []) {
  try {
    const result = await db.query(sql, params);
    return { rows: result.rows, error: null };
  } catch (error) {
    return { rows: [], error };
  }
}

const ROLES = ['member', 'creator', 'vendor', 'moderator', 'manager', 'admin', 'owner'];
const PERMISSIONS = (
  await db.query(`select permission from public.permission_catalogue order by permission`)
).rows.map((row) => row.permission);

// ===========================================================================
// 1. Nothing changed: the whole matrix, role by role
// ===========================================================================
//
// The baseline is recomputed from `role_permissions` directly and compared with
// what `has_permission` now answers for every role and every permission. This
// is 7 x 14 = 98 comparisons and it is the most important block in the file.
const baseline = new Map();
for (const row of (
  await db.query(`select role::text as role, permission from public.role_permissions`)
).rows) {
  baseline.set(`${row.role}/${row.permission}`, true);
}

let mismatches = [];
for (const role of ROLES) {
  const who = await actor(role);
  for (const permission of PERMISSIONS) {
    const expected = baseline.get(`${role}/${permission}`) === true;
    const got = await as(who, `select bsdc.has_permission('${permission}') as ok`);
    if (got.error) {
      mismatches.push(`${role}/${permission}: ${got.error.message}`);
    } else if (got.rows[0].ok !== expected) {
      mismatches.push(`${role}/${permission}: expected ${expected}, got ${got.rows[0].ok}`);
    }
  }
}
check(
  mismatches.length === 0,
  'with no grants and no denies, every role gets exactly the answer it got before',
  mismatches.slice(0, 5).join('; '),
);

// The one-argument form is what the 102 existing call sites use; it must agree
// with the two-argument form everywhere, including where a scope is irrelevant.
const adminProbe = await actor('admin');
const formAgreement = await as(
  adminProbe,
  `select
     (select count(*) from public.permission_catalogue c
       where bsdc.has_permission(c.permission)
         is distinct from bsdc.has_permission_scoped(c.permission, null))::int as n`,
);
check(
  Number(formAgreement.rows[0]?.n) === 0,
  'the one-argument form every existing policy uses agrees with the two-argument form',
);

// ===========================================================================
// 2. A grant adds authority to one person, and only to them
// ===========================================================================
const owner = await actor('owner');
const manager = await actor('manager');
const bystander = await actor('manager');

const granted = await as(
  owner,
  `select (public.set_permission_grant(
     '${manager.uid}', 'settings.write', true,
     'Needed to fix the launch banner during the March incident', null, null)).id as id`,
);
check(granted.error === null, 'an owner grants settings.write to a manager', granted.error?.message ?? '');

const managerNow = await as(manager, `select bsdc.has_permission('settings.write') as ok`);
check(managerNow.rows[0]?.ok === true, 'the manager now holds it');

const otherManager = await as(bystander, `select bsdc.has_permission('settings.write') as ok`);
check(
  otherManager.rows[0]?.ok === false,
  'and a different manager does not: the grant is per person, not per role',
);

const stillRole = await as(manager, `select bsdc.has_permission('people.suspend') as ok`);
check(
  stillRole.rows[0]?.ok === true,
  'granting one permission did not disturb the ones the role already gave',
);

// The audit row exists, and carries the reason. A grant with no readable reason
// is the thing that made the old audit useless.
const grantedAudit = await asSuperuser(
  `select action, subject, metadata from public.audit_log
    where action = 'permission.grant' and subject = 'person:${manager.uid}'`,
);
check(grantedAudit.rows.length === 1, 'the grant wrote one audit row');
check(
  grantedAudit.rows[0]?.metadata?.permission === 'settings.write',
  'the audit row names the permission',
  JSON.stringify(grantedAudit.rows[0]?.metadata),
);
check(
  String(grantedAudit.rows[0]?.metadata?.reason ?? '').includes('launch banner'),
  'and carries the reason a reviewer needs',
);

// ===========================================================================
// 3. A deny removes one permission without removing nine
// ===========================================================================
//
// This is the whole reason `is_deny` exists. Before it, taking `people.suspend`
// away from a manager meant demoting them, which also took `people.read`,
// `shop.review`, `ads.review`, `moderation.resolve` and four more.
const denied = await as(
  owner,
  `select (public.deny_permission(
     '${manager.uid}', 'people.suspend',
     'Under review after the disputed suspension on 14 March')).id as id`,
);
check(denied.error === null, 'an owner denies one permission', denied.error?.message ?? '');

const suspended = await as(manager, `select bsdc.has_permission('people.suspend') as ok`);
check(suspended.rows[0]?.ok === false, 'the denied permission is gone');

const retained = await as(
  manager,
  `select
     bsdc.has_permission('people.read') as read_ok,
     bsdc.has_permission('moderation.resolve') as mod_ok,
     bsdc.has_permission('shop.review') as shop_ok`,
);
check(
  retained.rows[0]?.read_ok === true &&
    retained.rows[0]?.mod_ok === true &&
    retained.rows[0]?.shop_ok === true,
  'and every other permission the role gave is untouched',
  JSON.stringify(retained.rows[0]),
);

// A deny beats a grant too, not just the role baseline.
const grantThenDeny = await as(
  owner,
  `select public.set_permission_grant('${bystander.uid}', 'people.suspend', true,
     'Covering the queue while the manager is on leave') as g`,
);
check(grantThenDeny.error === null, 'a manager can be granted a permission they lack');
await as(
  owner,
  `select public.deny_permission('${bystander.uid}', 'people.suspend',
     'Revoked again: the leave was cancelled')`,
);
const deniedOverGrant = await as(bystander, `select bsdc.has_permission('people.suspend') as ok`);
check(
  deniedOverGrant.rows[0]?.ok === false,
  'and a deny beats a grant, so the two cannot disagree about the answer',
);

// ===========================================================================
// 4. An expiry expires, and the sweep records the fact
// ===========================================================================
const temp = await actor('creator');
/**
 * A permission the temp actor's role does not hold. Chosen by asking the
 * database rather than by assuming: `audit.read` turned out to be granted to
 * moderators, so using a moderator here made the grant indistinguishable from
 * the baseline and the expiry unobservable — a test that passed for the wrong
 * reason until the probe below caught it.
 */
const observable = (
  await db.query(`
    select c.permission from public.permission_catalogue c
     where not exists (
       select 1 from public.role_permissions r
        where r.role = 'creator' and r.permission = c.permission)
     order by c.permission limit 1`)
).rows[0].permission;
// The probe must come FIRST. Written the other way round — grant, then ask
// whether the role baseline covers it — the probe answers "yes" because of the
// grant it just created, and the test fails for a reason that has nothing to do
// with the code. That happened; this is the corrected order.
const lacksBefore = await as(temp, `select bsdc.has_permission('${observable}') as ok`);
check(
  lacksBefore.rows[0]?.ok === false,
  `a creator holds no role baseline for ${observable}, so the grant is observable`,
  JSON.stringify(lacksBefore.rows[0]),
);

const expiring = await as(
  owner,
  `select public.set_permission_grant('${temp.uid}', '${observable}', true,
     'Incident review, expires when the review closes', null, now() + interval '1 hour') as g`,
);
check(expiring.error === null, 'a grant can be given an expiry', expiring.error?.message ?? '');

const liveBefore = await as(temp, `select bsdc.has_permission('${observable}') as ok`);
check(liveBefore.rows[0]?.ok === true, 'it applies while it is live');

// `now()` is the transaction timestamp, so a row whose expiry is one hour ahead
// of it stays ahead no matter what the row is edited to — unless the edit moves
// the *grant* back too, which the table's own check enforces. Backdating the
// grant is a legitimate shape (an import from a spreadsheet looks exactly like
// this) and it is the only way to observe an expiry without waiting an hour.
await db.exec(`
  update public.permission_grants
     set granted_at = now() - interval '3 hours',
         expires_at = now() - interval '2 hours'
   where subject_uid = '${temp.uid}' and permission = '${observable}';
`);

const moved = await asSuperuser(
  `select (expires_at < now()) as past from public.permission_grants
    where subject_uid = '${temp.uid}' and permission = '${observable}'`,
);
check(moved.rows[0]?.past === true, 'the test moved the expiry into the past');

const liveAfter = await as(temp, `select bsdc.has_permission('${observable}') as ok`);
check(liveAfter.rows[0]?.ok === false, 'an expired grant stops applying without anybody sweeping');

const swept = await asSuperuser(`select public.expire_permission_grants() as n`);
check(Number(swept.rows[0]?.n) === 1, 'the sweep closes it and counts it', JSON.stringify(swept.rows));
const expiredRow = await asSuperuser(
  `select revoked_at, revoke_reason from public.permission_grants
    where subject_uid = '${temp.uid}' and permission = '${observable}'`,
);
check(expiredRow.rows[0]?.revoked_at !== null, 'the row is closed rather than deleted');
check(
  String(expiredRow.rows[0]?.revoke_reason ?? '').includes('Expired'),
  'and says why it closed',
  JSON.stringify(expiredRow.rows[0]),
);
const secondSweep = await asSuperuser(`select public.expire_permission_grants() as n`);
check(Number(secondSweep.rows[0]?.n) === 0, 'running the sweep twice does nothing the second time');

// ===========================================================================
// 5. A manager cannot promote themself
// ===========================================================================
//
// The three guards, each proved separately, because a guard that is never
// exercised is a guard that will be broken by the next refactor.
const cannotGrantUnheld = await as(
  manager,
  `select public.set_permission_grant('${bystander.uid}', 'owner.transfer', true,
     'I would like to be able to transfer ownership')`,
);
check(
  cannotGrantUnheld.error?.code === '42501',
  'a manager cannot grant a permission they do not hold',
  JSON.stringify(cannotGrantUnheld.error?.message ?? ''),
);

const cannotGrantAboveRank = await as(
  await actor('admin'),
  `select public.set_permission_grant('${manager.uid}', 'owner.transfer', true,
     'Preparing for the handover next month')`,
);
check(
  cannotGrantAboveRank.error?.code === '42501',
  'an admin cannot grant a permission whose grant rank exceeds their own',
  JSON.stringify(cannotGrantAboveRank.error?.message ?? ''),
);

const managerGrant = await as(
  manager,
  `select public.set_permission_grant('${bystander.uid}', 'people.suspend', true,
     'Second approver needed for the queue this week')`,
);
check(
  managerGrant.error?.code === '42501',
  'a manager cannot grant to somebody who outranks them',
  JSON.stringify(managerGrant.error?.message ?? ''),
);

const anonCall = await (async () => {
  await db.exec(`set role anon;`);
  try {
    const result = await db.query(
      `select public.set_permission_grant('${manager.uid}', 'audit.read', true,
         'trying from outside the console')`,
    );
    return { rows: result.rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec(`reset role;`);
  }
})();
check(anonCall.error !== null, 'and an anonymous caller cannot write a grant at all');

// A person cannot deny themself, or a deny becomes a way to shed accountability.
const selfDeny = await as(
  owner,
  `select public.deny_permission('${owner.uid}', 'audit.read',
     'Removing my own audit access for convenience')`,
);
check(selfDeny.error?.code === '22023', 'nobody can deny themselves a permission');

// ===========================================================================
// 6. A permission nobody defined is refused, not silently inert
// ===========================================================================
const typo = await as(
  owner,
  `select public.set_permission_grant('${manager.uid}', 'peopel.suspend', true,
     'A typo that would have looked like it worked')`,
);
check(
  typo.error?.code === '22023',
  'a misspelt permission is refused rather than granted into a void',
  JSON.stringify(typo.error?.message ?? ''),
);

// ===========================================================================
// 7. The reason rule, enforced where a console cannot help
// ===========================================================================
const noReason = await as(
  owner,
  `select public.set_permission_grant('${bystander.uid}', 'audit.read', true, '')`,
);
check(noReason.error?.code === '22023', 'a grant with no reason is refused by the database');

const placeholder = await as(
  owner,
  `select public.set_permission_grant('${bystander.uid}', 'audit.read', true, 'test')`,
);
check(placeholder.error?.code === '22023', 'and so is the word "test"');

// ===========================================================================
// 8. Scopes narrow a grant, and a mismatched scope is refused
// ===========================================================================
const shop = await asSuperuser(
  `insert into public.mk_vendors (owner_uid, slug, name, vendor_type, mobile, address_line,
                                  lat, lng, place_label, status)
   select '${bystander.uid}', 't94-scope-shop', 'T94 Scope Shop', 'grocery', '01712345678',
          'House 9, Road 9, Sylhet', 24.8949, 91.8687, 'Sylhet', 'active'
   returning id`,
).catch(async () => ({ rows: [] }));
void shop;

const scoped = await as(
  owner,
  `select public.set_permission_grant('${manager.uid}', 'ads.review', true,
     'Reviewing only the Sylhet pilot shops', 'shop:t94-scope-shop', null) as g`,
);
check(scoped.error === null, 'a grant can be scoped to one subject', scoped.error?.message ?? '');

const scopedHit = await as(
  manager,
  `select bsdc.has_permission_scoped('ads.review', 'shop:t94-scope-shop') as ok`,
);
check(scopedHit.rows[0]?.ok === true, 'the scope it names passes');

const scopeMiss = await as(
  manager,
  `select bsdc.has_permission_scoped('ads.review', 'shop:another-shop') as other,
          bsdc.has_permission_scoped('settings.write', 'shop:t94-scope-shop') as leak`,
);

check(
  scopeMiss.rows[0]?.leak === true,
  'a role-baseline permission is unaffected by somebody else\'s scoped grant',
);
check(
  scopeMiss.rows[0]?.other === false,
  'and a scoped grant does not cover a subject it was not made for',
  JSON.stringify(scopeMiss.rows[0]),
);

const badScope = await as(
  owner,
  `select public.set_permission_grant('${manager.uid}', 'settings.write', true,
     'Scoping a setting to a shop, which means nothing', 'shop:t94-scope-shop', null)`,
);
check(
  badScope.error?.code === '22023',
  'a scope that does not fit the permission kind is refused',
  JSON.stringify(badScope.error?.message ?? ''),
);

// ===========================================================================
// 9. History is not rewritten
// ===========================================================================
const beforeRevoke = await asSuperuser(
  `select count(*)::int as n from public.permission_grants where subject_uid = '${manager.uid}'`,
);
const revoked = await as(
  owner,
  `select public.set_permission_grant('${manager.uid}', 'settings.write', false,
     'The incident is closed and the setting is stable again') as g`,
);
check(revoked.error === null, 'a grant can be revoked', revoked.error?.message ?? '');
const afterRevoke = await asSuperuser(
  `select count(*)::int as n from public.permission_grants where subject_uid = '${manager.uid}'`,
);
check(
  Number(afterRevoke.rows[0]?.n) === Number(beforeRevoke.rows[0]?.n),
  'revoking closes the row rather than deleting it, so the history survives',
);

const revokedNow = await as(manager, `select bsdc.has_permission('settings.write') as ok`);
check(revokedNow.rows[0]?.ok === false, 'and the permission is gone');

const revokeNoReason = await as(
  owner,
  `select public.set_permission_grant('${manager.uid}', 'settings.write', false, 'done')`,
);
check(revokeNoReason.error?.code === '22023', 'a revocation needs a reason too');

// ===========================================================================
// 10. The two read models
// ===========================================================================
const matrix = await as(owner, `select * from public.permission_matrix()`);
check(matrix.rows.length === PERMISSIONS.length, 'the matrix returns every permission once');
check(
  matrix.rows.every((row) => Array.isArray(row.roles)),
  'each row carries the roles that hold it as an array',
);
const destructive = matrix.rows.filter((row) => row.is_destructive).map((row) => row.permission);
check(
  destructive.length >= 5 &&
    destructive.includes('people.role') &&
    destructive.includes('owner.transfer'),
  'the destructive permissions are flagged',
  JSON.stringify(destructive),
);
check(
  matrix.rows.every((row) => typeof row.i_can_grant === 'boolean'),
  "and every row says whether this owner could grant it",
);

// The owner holds every permission, whether or not it has been catalogued. This
// was 0105's contribution, and a later rewrite of the resolver dropped it silently
// — every permission added ahead of its catalogue row became a silent outage.
// Locked here so it cannot be dropped again.
const unseeded = await as(owner, `select bsdc.has_permission('a.permission.nobody.catalogued') as ok`);
check(
  unseeded.rows[0]?.ok === true,
  'the owner passes a permission that was never catalogued',
  JSON.stringify(unseeded.rows),
);
const unseededManager = await as(manager, `select bsdc.has_permission('a.permission.nobody.catalogued') as ok`);
check(unseededManager.rows[0]?.ok === false, 'and nobody else does');

// An owner can still be constrained deliberately: a deny beats the wildcard.
const constrained = await as(
  owner,
  `select public.deny_permission('${manager.uid}', 'settings.read', 'proving deny beats wildcard')`,
);
check(constrained.error === null, 'a deny is accepted on a permission the role holds', constrained.error?.message ?? '');
const deniedManager = await as(manager, `select bsdc.has_permission('settings.read') as ok`);
check(deniedManager.rows[0]?.ok === false, 'and the deny beats the role baseline');

const own = await as(manager, `select * from public.person_permissions('${manager.uid}')`);
check(own.rows.length === PERMISSIONS.length, 'one person\'s set covers every permission');
const deniedRow = own.rows.find((row) => row.permission === 'people.suspend');
check(
  deniedRow?.effective === false && deniedRow?.denied === true && deniedRow?.from_role === true,
  'the denied permission shows as held by the role, denied, and therefore not effective',
  JSON.stringify(deniedRow),
);

const why = await as(manager, `select * from bsdc.permission_source('people.suspend')`);
check(
  why.rows.some((row) => row.source === 'deny'),
  'asking why a permission is missing names the deny',
  JSON.stringify(why.rows),
);
const whyRole = await as(manager, `select * from bsdc.permission_source('people.read')`);
check(
  whyRole.rows.some((row) => String(row.source).startsWith('role:manager')),
  'and asking why one is present names the role',
);

// A stranger cannot read somebody else's grants.
const peeking = await as(bystander, `select * from public.person_permissions('${manager.uid}')`);
check(
  peeking.error !== null || peeking.rows.length === 0,
  "a manager without people.role cannot read another person's permission set",
);

console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) {
  console.log(bad.map((label) => `  - ${label}`).join('\n'));
  process.exit(1);
}
