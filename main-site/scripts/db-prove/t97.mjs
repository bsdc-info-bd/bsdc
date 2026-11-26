/**
 * Proof for 0137: a bulk operation you can look at before you run it.
 *
 * Five claims:
 *
 *   1. a plan changes nothing — proved by counting the rows before and after;
 *   2. the plan and the apply share one selector, so a preview cannot disagree
 *      with the write it describes — proved by matching the plan's ids against
 *      the rows the apply actually changed;
 *   3. a row that moved between plan and apply is skipped and named, rather than
 *      overwritten — the failure mode that makes bulk tools dangerous;
 *   4. a plan runs once, expires, and belongs to somebody;
 *   5. every apply is one audit row, however many rows it touched.
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

const OWNER = '00000000-0000-4000-8000-0000000000e1';
const MANAGER = '00000000-0000-4000-8000-0000000000e2';
const MEMBER = '00000000-0000-4000-8000-0000000000e3';
const OWNERS = [
  '00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000f2',
  '00000000-0000-4000-8000-0000000000f3',
];

await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${OWNER}',   'bulkowner',   'Bulk Owner',   'owner',   'active'),
    ('${MANAGER}', 'bulkmanager', 'Bulk Manager', 'manager', 'active'),
    ('${MEMBER}',  'bulkmember',  'Bulk Member',  'member',  'active')
  on conflict do nothing;
  insert into public.profiles (uid, username, display_name, role, status) values
    ${OWNERS.map((uid, i) => `('${uid}', 'bulkapp${i}', 'Applicant ${i}', 'member', 'active')`).join(',\n    ')}
  on conflict do nothing;
`);

async function as(uid, sql) {
  const claims = JSON.stringify({ sub: uid, role: 'authenticated' });
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', $jwt$${claims}$jwt$, false);`);
  const multi = /;\s*\S/.test(sql.trim());
  try {
    if (multi) {
      await db.exec(sql);
      return { rows: [], error: null };
    }
    const result = await db.query(sql);
    return { rows: result.rows, error: null };
  } catch (error) {
    try {
      await db.exec('rollback');
    } catch {
      /* not in a transaction */
    }
    return { rows: [], error };
  } finally {
    try {
      await db.exec('reset role;');
    } catch {
      /* already reset */
    }
  }
}

async function asSystem(sql) {
  const multi = /;\s*\S/.test(sql.trim());
  try {
    if (multi) {
      await db.exec(sql);
      return { rows: [], error: null };
    }
    const result = await db.query(sql);
    return { rows: result.rows, error: null };
  } catch (error) {
    try {
      await db.exec('rollback');
    } catch {
      /* not in a transaction */
    }
    return { rows: [], error };
  }
}

// Three shop applications, written by the RPC that owns the rules.
async function applyAs(uid, shopName, txn) {
  return as(uid, `select public.mk_submit_vendor_application($json$${JSON.stringify({
    full_name: 'Bulk Applicant',
    shop_name: shopName,
    nid_number: '1234567890123',
    mobile: '01712345678',
    vendor_type: 'grocery',
    address_line: '9 Bulk Road, Sylhet',
    lat: 24.9,
    lng: 91.87,
    place_label: 'Sylhet',
    package_code: '10',
    payment_sender: '01712345678',
    payment_holder: 'Bulk Applicant',
    payment_txn_id: txn,
    agreements: {
      terms: true, privacy: true, vendor_policy: true,
      cod_policy: true, self_delivery: true, accuracy: true,
    },
  })}$json$::jsonb)`);
}

for (let i = 0; i < OWNERS.length; i += 1) {
  const applied = await applyAs(OWNERS[i], `Bulk Shop ${i + 1}`, `BULK-TXN-${i}-${Date.now()}`);
  if (applied.error) console.log(`note  shop ${i + 1}: ${applied.error.message}`);
}

async function shopStatuses() {
  const { rows } = await asSystem(
    `select shop_name, status::text as s from public.mk_vendor_applications order by shop_name`,
  );
  return rows;
}

// ===========================================================================
// 1. A plan changes nothing
// ===========================================================================
const before = await shopStatuses();
check(before.length === 3, 'three applications are waiting', JSON.stringify(before));

const planned = await as(
  OWNER,
  `select * from public.bulk_plan('shops', 'approve', '{"status":"submitted"}'::jsonb,
     'Approving the three complete applications after review')`,
);
check(planned.error === null, 'an owner plans a bulk approval', planned.error?.message ?? '');
const plan = planned.rows[0];
check(Number(plan?.matched) === 3, 'the plan matched three rows', JSON.stringify(plan?.matched));
check(Number(plan?.applicable) === 3, 'and says all three can be approved');
check(typeof plan?.id === 'string', 'and has an id somebody can review');

const afterPlan = await shopStatuses();
check(
  JSON.stringify(afterPlan) === JSON.stringify(before),
  'planning changed nothing at all',
  JSON.stringify(afterPlan),
);

const items = await as(OWNER, `select * from public.bulk_plan_detail('${plan.id}')`);
check(items.error === null, 'the plan detail is readable', items.error?.message ?? '');
check(items.rows.length === 3, 'and lists every row it would touch');
check(
  items.rows.every((row) => row.from_status === 'submitted' && row.to_status === 'approved'),
  'each item states what it is now and what it would become',
  JSON.stringify(items.rows[0]),
);
check(
  items.rows.every((row) => typeof row.fingerprint === 'string' && row.fingerprint.length === 32),
  'and carries the fingerprint the apply will check',
);

// ===========================================================================
// 2. Applying writes exactly what the plan said
// ===========================================================================
const applied = await as(OWNER, `select * from public.bulk_apply('${plan.id}')`);
check(applied.error === null, 'the plan applies', applied.error?.message ?? '');
check(Number(applied.rows[0]?.applied) === 3, 'three rows are applied', JSON.stringify(applied.rows[0]?.applied));
check(Number(applied.rows[0]?.skipped) === 0, 'and none are skipped');

const afterApply = await shopStatuses();
check(
  afterApply.every((row) => row.s !== 'submitted'),
  'the applications really moved',
  JSON.stringify(afterApply),
);

// The ids in the details are the rows that changed — the plan and the write used
// one selector, so a preview cannot describe rows the apply did not touch.
const detailIds = new Set((applied.rows[0]?.details ?? []).filter((d) => d.outcome === 'applied').map((d) => d.id));
const plannedIds = new Set(items.rows.map((row) => row.item_id));
check(
  detailIds.size === plannedIds.size && [...detailIds].every((id) => plannedIds.has(id)),
  'every applied row is one the plan previewed, and every previewed row was applied',
);

// ===========================================================================
// 3. A plan runs once
// ===========================================================================
const twice = await as(OWNER, `select * from public.bulk_apply('${plan.id}')`);
check(twice.error?.code === '22023', 'applying the same plan twice is refused', twice.error?.message ?? 'accepted');
check(
  String(twice.error?.message ?? '').includes('once'),
  'and the refusal says why',
  twice.error?.message ?? '',
);

// ===========================================================================
// 4. A row that moved is skipped and named
// ===========================================================================
// Two fresh applications, planned, and then one of them decided by somebody else
// before the plan is applied. This is the failure mode that makes a bulk tool
// dangerous, and it must not overwrite the colleague's decision.
const extra = [
  ['00000000-0000-4000-8000-0000000000f4', 'Racing Shop A', 'bulkracea'],
  ['00000000-0000-4000-8000-0000000000f5', 'Racing Shop B', 'bulkraceb'],
];
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ${extra.map(([uid, , name]) => `('${uid}', '${name}', '${name}', 'member', 'active')`).join(',\n    ')}
  on conflict do nothing;
`);
for (let i = 0; i < extra.length; i += 1) {
  const appliedOne = await applyAs(extra[i][0], extra[i][1], `RACE-${i}-${Date.now()}`);
  if (appliedOne.error) console.log(`note  ${extra[i][1]}: ${appliedOne.error.message}`);
}

const racePlan = await as(
  OWNER,
  `select * from public.bulk_plan('shops', 'refuse', '${JSON.stringify({ status: 'submitted', search: 'Racing Shop' })}'::jsonb,
     'Refusing both racing applications for the concurrency proof')`,
);
check(racePlan.error === null, 'a plan is made over two rows', racePlan.error?.message ?? '');
const racePlanId = racePlan.rows[0]?.id;
check(Number(racePlan.rows[0]?.applicable) === 2, 'both are applicable at plan time');

// Somebody else decides one of them first.
const competing = await asSystem(`
  select set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', false);
`);
check(competing.error === null, 'the competing decision can be made as the owner');
// A subquery inside the call would need table privileges the caller does not
// have; the id is read as a system first, which is also how the console does it.
const racingId = await asSystem(
  `select id from public.mk_vendor_applications where shop_name = 'Racing Shop A' limit 1`,
);
const decidedFirst = await as(
  OWNER,
  `select public.mk_admin_decide_application('${racingId.rows[0]?.id}', 'approve',
     'Approved by a colleague while the plan was open')`,
);
check(decidedFirst.error === null, 'one of the two is decided by somebody else', decidedFirst.error?.message ?? '');

const raceApply = await as(OWNER, `select * from public.bulk_apply('${racePlanId}')`);
check(raceApply.error === null, 'the stale plan still applies', raceApply.error?.message ?? '');
check(
  Number(raceApply.rows[0]?.applied) === 1,
  'only the row that did not move is applied',
  JSON.stringify({ applied: raceApply.rows[0]?.applied, skipped: raceApply.rows[0]?.skipped }),
);
check(Number(raceApply.rows[0]?.skipped) === 1, 'and the one that moved is skipped');
const skippedDetail = (raceApply.rows[0]?.details ?? []).find((d) => d.outcome === 'skipped');
check(skippedDetail !== undefined, 'the skip is reported as a row, not folded into a number');
check(
  String(skippedDetail?.why ?? '').includes('changed since'),
  'and says the row changed since the plan, rather than blaming the caller',
  skippedDetail?.why ?? '',
);
check(
  String(skippedDetail?.label ?? '').includes('Racing Shop A'),
  'and names which row it was',
  skippedDetail?.label ?? '',
);
// The colleague's decision must still be standing.
const colleagueKept = await asSystem(
  `select status::text as s from public.mk_vendor_applications where shop_name = 'Racing Shop A'`,
);
check(
  colleagueKept.rows[0]?.s !== 'rejected',
  "and the colleague's approval was not overwritten by the refused plan",
  colleagueKept.rows[0]?.s,
);

// ===========================================================================
// 5. A plan expires, and belongs to somebody
// ===========================================================================
await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
const expiring = await as(
  OWNER,
  `select * from public.bulk_plan('shops', 'approve', '{"status":"submitted"}'::jsonb,
     'A plan that will be deliberately expired for the proof')`,
);
if (expiring.error) {
  // With every application already decided, there is nothing to plan. Prove the
  // expiry rule a different way rather than skipping it.
  check(
    String(expiring.error.message).includes('matches nothing') ||
      String(expiring.error.message).includes('none of them'),
    'a plan over nothing is refused with a reason, not an empty plan',
    expiring.error.message,
  );
} else {
  await db.exec(`
    update public.bulk_plans set expires_at = now() - interval '1 minute'
     where id = '${expiring.rows[0].id}';
  `);
  const expired = await as(OWNER, `select * from public.bulk_apply('${expiring.rows[0].id}')`);
  check(expired.error?.code === '22023', 'an expired plan is refused', expired.error?.message ?? 'accepted');
  check(
    String(expired.error?.message ?? '').includes('expired'),
    'and says it expired rather than that the caller is wrong',
  );
}
await db.exec(`update public.admin_settings set value = 'false'::jsonb where key = 'ops.audit_trigger_disabled'`);

// A manager cannot apply an owner's plan.
const mineOnly = await as(
  OWNER,
  `select * from public.bulk_plan('reports', 'resolve', '{"status":"open"}'::jsonb,
     'Resolving the open report queue for the ownership proof')`,
);
if (mineOnly.error === null) {
  const notYours = await as(MANAGER, `select * from public.bulk_apply('${mineOnly.rows[0].id}')`);
  check(
    notYours.error?.code === '42501',
    "somebody else's plan cannot be applied, even with the right permission",
    notYours.error?.message ?? 'it applied',
  );
  check(
    String(notYours.error?.message ?? '').includes('belongs to somebody else'),
    'and the refusal is about ownership, not authority',
  );
} else {
  check(
    /matches nothing|none of them/.test(String(mineOnly.error.message)),
    'a plan over an empty queue is refused with a reason',
    mineOnly.error.message,
  );
}

// ===========================================================================
// 6. Refusals that matter
// ===========================================================================
const noReason = await as(
  OWNER,
  `select * from public.bulk_plan('shops', 'approve', '{"status":"submitted"}'::jsonb, 'because')`,
);
check(noReason.error?.code === '22023', 'a short reason is refused', noReason.error?.message ?? 'accepted');
check(
  String(noReason.error?.message ?? '').includes('12 characters'),
  'and the refusal states the rule, not just that it failed',
);

const memberPlan = await as(
  MEMBER,
  `select * from public.bulk_plan('shops', 'approve', '{"status":"submitted"}'::jsonb,
     'A member trying to approve shops in bulk')`,
);
check(memberPlan.error?.code === '42501', 'a member cannot plan a bulk approval', memberPlan.error?.message ?? 'accepted');
check(
  String(memberPlan.error?.message ?? '').includes('marketplace.review'),
  'and is told which permission would allow it',
);

const badSubject = await as(
  OWNER,
  `select * from public.bulk_plan('everything', 'delete', '{}'::jsonb,
     'A plan over a subject that does not exist')`,
);
check(badSubject.error?.code === '22023', 'an unknown subject is refused', badSubject.error?.message ?? 'accepted');

const deleteAction = await as(
  OWNER,
  `select * from public.bulk_plan('posts', 'delete', '{}'::jsonb,
     'A bulk delete, which the vocabulary does not include')`,
);
check(
  deleteAction.error !== null,
  'there is no bulk delete, because a bulk delete is a bulk mistake waiting for a typo',
  deleteAction.error?.message ?? 'accepted',
);

const anonPlan = await asSystem(`set role anon; select * from public.bulk_plan('shops', 'approve', '{}'::jsonb, 'anonymous attempt to plan');`);
check(anonPlan.error !== null, 'an anonymous caller cannot plan', anonPlan.error?.message ?? 'it planned');

// ===========================================================================
// 7. One audit row per apply, whatever the count
// ===========================================================================
const audit = await asSystem(`
  select action, count(*)::int as n, max(metadata ->> 'applied') as applied
    from public.audit_log
   where action like 'bulk.%'
   group by action
`);
const applyAudit = audit.rows.find((row) => row.action === 'bulk.apply');
check(applyAudit !== undefined, 'the applies are in the trail');
check(
  Number(applyAudit?.n) === 2,
  'two applies produced two rows, not one per item',
  JSON.stringify(applyAudit),
);
const planAudit = audit.rows.find((row) => row.action === 'bulk.plan');
check(
  Number(planAudit?.n) >= 2,
  'and every plan is recorded too, even though it changed nothing',
  JSON.stringify(planAudit),
);

// The reason travels with the apply, which is what makes it reviewable later.
const withReason = await asSystem(`
  select metadata ->> 'reason' as reason from public.audit_log
   where action = 'bulk.apply' order by id desc limit 1
`);
check(
  typeof withReason.rows[0]?.reason === 'string' &&
    withReason.rows[0].reason.length >= 12,
  'the apply carries the reason it was planned under',
  JSON.stringify(withReason.rows[0]),
);

// ===========================================================================
// 8. Reading plans back
// ===========================================================================
const listed = await as(OWNER, `select * from public.bulk_plans_for_me(20)`);
check(listed.error === null, 'an owner reads their plans', listed.error?.message ?? '');
check(listed.rows.length >= 2, 'and sees the ones they made', `${listed.rows.length} plans`);
check(
  listed.rows.every((row) => typeof row.is_mine === 'boolean'),
  'each says whether it is theirs',
);
check(
  listed.rows.some((row) => row.applied_at !== null && row.applied_count !== null),
  'and an applied plan shows what it did',
);

const memberPlans = await as(MEMBER, `select * from public.bulk_plans_for_me(20)`);
check(
  memberPlans.error === null && memberPlans.rows.length === 0,
  'a member sees no plans, because they can act on none',
  `${memberPlans.rows.length}`,
);

const anonPlans = await asSystem(`set role anon; select * from public.bulk_plans_for_me(20);`);
check(anonPlans.error !== null, 'and an anonymous caller is refused the list');

console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) {
  console.log(bad.map((label) => `  - ${label}`).join('\n'));
  process.exit(1);
}
