/**
 * Proof for 0140: a receipt for every staff action.
 *
 * A receipt is evidence, so the proof is about what makes evidence hold up:
 *
 *   * it exists for the person the action landed on, and not for somebody else;
 *   * it says who did it by name, not by uuid;
 *   * it says why, and by which route — single or bulk — with the plan named;
 *   * a bulk apply writes one receipt per applied row and none for a skipped one,
 *     because a receipt for something that did not happen is worse than none;
 *   * it is kept ninety days and the purge honours that, and deletes nothing that
 *     is still inside the window;
 *   * a member cannot write one, and cannot read somebody else's.
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

const OWNER = '00000000-0000-4000-8000-000000000301';
const MEMBER = '00000000-0000-4000-8000-000000000302';
const OTHER = '00000000-0000-4000-8000-000000000303';

await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${OWNER}',  'receiptowner',  'Receipt Owner',  'owner',  'active'),
    ('${MEMBER}', 'receiptmember', 'Receipt Member', 'member', 'active'),
    ('${OTHER}',  'receiptother',  'Receipt Other',  'member', 'active')
  on conflict do nothing;
`);
await db.exec(`update public.admin_settings set value = 'false'::jsonb where key = 'ops.audit_trigger_disabled'`);

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
  // A security-definer trigger still reads `request.jwt.claims` to answer
  // current_uid(); leaving a previous caller's claim in place would attribute a
  // written receipt to the wrong person, which for this table is the whole point.
  await db.exec(`select set_config('request.jwt.claims', '{}', false);`);
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

const rows = async (sql) => (await asSystem(sql)).rows;

// ===========================================================================
// 1. The table refuses the ways a receipt becomes worthless
// ===========================================================================
const noActor = await asSystem(`
  insert into public.action_receipts (action, subject, about_uid, via)
  values ('account.suspend', 'account:${MEMBER}', '${MEMBER}', 'single')
`);
check(noActor.error !== null, 'a receipt with no actor is refused, unless the route was the system', noActor.error?.message ?? 'accepted');

const noPlan = await asSystem(`
  select bsdc.write_receipt('${MEMBER}', 'bulk.approve', 'shops:x', 'a reason', 'bulk', null)
`);
check(noPlan.error !== null, 'a bulk receipt must name the plan it came from', noPlan.error?.message ?? 'accepted');

const badRoute = await asSystem(`
  select bsdc.write_receipt('${MEMBER}', 'account.suspend', 'account:x', 'a reason', 'carrier-pigeon', null)
`);
check(badRoute.error !== null, 'an unknown route is refused rather than stored', badRoute.error?.message ?? 'accepted');

// ===========================================================================
// 2. A suspension writes a receipt the member can read
// ===========================================================================
const suspended = await as(
  OWNER,
  `select public.set_account_status('${MEMBER}', 'suspended',
     'Repeated spam in three channels after a warning')`,
);
check(suspended.error === null, 'an owner suspends the account', suspended.error?.message ?? '');

const mine = await as(MEMBER, `select * from public.my_receipts(30, null)`);
check(mine.rows.length === 1, 'the member has exactly one receipt', JSON.stringify(mine.rows.length));
const receipt = mine.rows[0];
check(receipt?.action === 'account.suspend', 'and it says what happened', receipt?.action);
check(
  String(receipt?.reason ?? '').includes('Repeated spam'),
  'and why, in the words the staff member used',
  receipt?.reason,
);
check(receipt?.via === 'single', 'and by which route', receipt?.via);
check(
  String(receipt?.actor_name ?? '').includes('Receipt Owner'),
  'and who did it, by name rather than by uuid',
  receipt?.actor_name,
);

// The other member sees nothing.
const theirs = await as(OTHER, `select * from public.my_receipts(30, null)`);
check(theirs.rows.length === 0, 'a receipt concerns one person and is not visible to another', JSON.stringify(theirs.rows.length));

// ===========================================================================
// 3. The detail is there, not only the summary
// ===========================================================================
const detail = await as(MEMBER, `select * from public.admin_receipt('${receipt?.id}')`);
check(detail.rows.length === 1, 'the member can open the receipt itself');
check(
  detail.rows[0]?.after_state?.status === 'suspended',
  'and it records the state that resulted, not only the words',
  JSON.stringify(detail.rows[0]?.after_state),
);

const notMine = await as(OTHER, `select * from public.admin_receipt('${receipt?.id}')`);
check(
  notMine.rows.length === 0,
  'somebody else asking gets no rows rather than a refusal, so the id tells them nothing',
  JSON.stringify(notMine.rows.length),
);

const staffRead = await as(OWNER, `select * from public.admin_receipt('${receipt?.id}')`);
check(staffRead.rows.length === 1, 'a reviewer with audit.read can read it');

// ===========================================================================
// 4. A member cannot write a receipt
// ===========================================================================
const forged = await as(
  MEMBER,
  `insert into public.action_receipts (actor_uid, action, subject, about_uid)
   values ('${OWNER}', 'account.restore', 'account:${MEMBER}', '${MEMBER}')`,
);
check(forged.error !== null, 'a member cannot write their own receipt', forged.error?.message ?? 'accepted');

const helperForge = await as(
  MEMBER,
  `select bsdc.write_receipt('${MEMBER}', 'account.restore', 'account:x', 'I said so')`,
);
check(helperForge.error !== null, 'and cannot call the writer directly', helperForge.error?.message ?? 'accepted');

// ===========================================================================
// 5. Retention is a promise the row keeps
// ===========================================================================
const window = await rows(`
  select created_at, purge_after,
         extract(day from (purge_after - created_at))::int as days
    from public.action_receipts where id = '${receipt?.id}'
`);
check(
  Number(window[0]?.days) === 90,
  'a receipt is kept ninety days, and the row says so itself',
  JSON.stringify(window[0]),
);

// A receipt dated past its window is purged; one inside it is kept.
await asSystem(`
  insert into public.action_receipts
    (actor_uid, action, subject, about_uid, via, created_at, purge_after)
  values
    ('${OWNER}', 'account.suspend', 'account:${OTHER}', '${OTHER}', 'single',
     now() - interval '91 days', now() - interval '1 day')
`);
const beforeCount = Number((await rows(`select count(*)::int as n from public.action_receipts`))[0]?.n ?? 0);
const purged = await asSystem(`select public.purge_action_receipts(5000) as n`);
check(Number(purged.rows[0]?.n) === 1, 'the purge deletes the receipt that is past its window', JSON.stringify(purged.rows[0]?.n));
const afterCount = Number((await rows(`select count(*)::int as n from public.action_receipts`))[0]?.n ?? 0);
check(afterCount === beforeCount - 1, 'and nothing inside the window', `${beforeCount} -> ${afterCount}`);

const purgeAgain = await asSystem(`select public.purge_action_receipts(5000) as n`);
check(Number(purgeAgain.rows[0]?.n) === 0, 'running the purge twice is safe and deletes nothing more', JSON.stringify(purgeAgain.rows[0]?.n));

const memberPurge = await as(MEMBER, `select public.purge_action_receipts(10)`);
check(memberPurge.error !== null, 'and a member cannot run it', memberPurge.error?.message ?? 'accepted');

const badLimit = await asSystem(`select public.purge_action_receipts(0)`);
check(badLimit.error !== null, 'a purge batch of zero is refused rather than silently doing nothing', badLimit.error?.message ?? 'accepted');

// ===========================================================================
// 6. A bulk apply writes one receipt per applied row, and none for a skip
// ===========================================================================
const APPLICANT_A = '00000000-0000-4000-8000-000000000304';
const APPLICANT_B = '00000000-0000-4000-8000-000000000305';
await asSystem(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${APPLICANT_A}', 'receiptshopa', 'Receipt Shop A', 'member', 'active'),
    ('${APPLICANT_B}', 'receiptshopb', 'Receipt Shop B', 'member', 'active')
  on conflict do nothing;
`);

async function submitApplication(uid, shopName, txn) {
  return as(uid, `select public.mk_submit_vendor_application($json$${JSON.stringify({
    full_name: 'Receipt Applicant',
    shop_name: shopName,
    nid_number: '1234567890123',
    mobile: '01712345678',
    vendor_type: 'grocery',
    address_line: '7 Receipt Road, Sylhet',
    lat: 24.9,
    lng: 91.87,
    place_label: 'Sylhet',
    package_code: '10',
    payment_sender: '01712345678',
    payment_holder: 'Receipt Applicant',
    payment_txn_id: txn,
    agreements: {
      terms: true, privacy: true, vendor_policy: true,
      cod_policy: true, self_delivery: true, accuracy: true,
    },
  })}$json$)`);
}

const subA = await submitApplication(APPLICANT_A, 'Receipt Shop A', `RCPT-A-${Date.now()}`);
check(subA.error === null, 'a first shop applies', subA.error?.message ?? '');
const subB = await submitApplication(APPLICANT_B, 'Receipt Shop B', `RCPT-B-${Date.now()}`);
check(subB.error === null, 'and a second', subB.error?.message ?? '');

const plan = await as(
  OWNER,
  `select * from public.bulk_plan('shops', 'approve',
     '{"status":"submitted"}'::jsonb,
     'Both applications checked against the trade licence on file')`,
);
check(plan.error === null && plan.rows.length === 1, 'an owner plans the approval', plan.error?.message ?? '');
const planId = plan.rows[0]?.id;

const applied = await as(OWNER, `select * from public.bulk_apply('${planId}')`);
check(applied.error === null, 'and applies it', applied.error?.message ?? '');
check(Number(applied.rows[0]?.applied) === 2, 'both rows applied', JSON.stringify(applied.rows[0]?.applied));

const bulkA = await as(APPLICANT_A, `select * from public.my_receipts(30, null)`);
check(bulkA.rows.length === 1, 'the first applicant has one receipt', JSON.stringify(bulkA.rows.length));
check(bulkA.rows[0]?.via === 'bulk', 'and it says the route was a bulk plan', bulkA.rows[0]?.via);
check(
  String(bulkA.rows[0]?.reason ?? '').includes('trade licence'),
  'and carries the plan reason, which is the one the reviewer gave',
  bulkA.rows[0]?.reason,
);

const bulkB = await as(APPLICANT_B, `select * from public.my_receipts(30, null)`);
check(bulkB.rows.length === 1, 'and the second applicant also has exactly one', JSON.stringify(bulkB.rows.length));

const planRef = await rows(
  `select plan_id, action from public.action_receipts where about_uid = '${APPLICANT_A}'`,
);
check(
  String(planRef[0]?.plan_id) === String(planId),
  'the receipt names the plan, so the preview it was based on can be found',
  JSON.stringify(planRef[0]),
);

// A plan where one row changes before apply: the changed row is skipped, and a
// skipped row must not produce a receipt.
const APPLICANT_C = '00000000-0000-4000-8000-000000000306';
await asSystem(`
  insert into public.profiles (uid, username, display_name, role, status)
  values ('${APPLICANT_C}', 'receiptshopc', 'Receipt Shop C', 'member', 'active')
  on conflict do nothing;
`);
await submitApplication(APPLICANT_C, 'Receipt Shop C', `RCPT-C-${Date.now()}`);

const plan2 = await as(
  OWNER,
  `select * from public.bulk_plan('shops', 'approve',
     '{"status":"submitted"}'::jsonb,
     'Another batch, planned before somebody else touched a row')`,
);
const plan2Id = plan2.rows[0]?.id;
// Move the row out from under the plan, so the fingerprint no longer matches.
await asSystem(`
  update public.mk_vendor_applications
     set review_note = 'edited by somebody else after the plan was made'
   where owner_uid = '${APPLICANT_C}'
`);
const partial = await as(OWNER, `select * from public.bulk_apply('${plan2Id}')`);
check(partial.error === null, 'the plan still applies', partial.error?.message ?? '');
check(Number(partial.rows[0]?.applied) === 0, 'with nothing applied, because the only row changed', JSON.stringify(partial.rows[0]?.applied));

const bulkC = await as(APPLICANT_C, `select * from public.my_receipts(30, null)`);
check(bulkC.rows.length === 0, 'a skipped row produces no receipt at all', JSON.stringify(bulkC.rows.length));

// ===========================================================================
// 7. A restore is a different receipt from the suspension
// ===========================================================================
const restored = await as(
  OWNER,
  `select public.set_account_status('${MEMBER}', 'active',
     'Appeal upheld after review of the channel logs')`,
);
check(restored.error === null, 'the owner restores the account', restored.error?.message ?? '');
const history = await as(MEMBER, `select action, reason from public.my_receipts(30, null)`);
check(history.rows.length === 2, 'the member now has two receipts, one per event', JSON.stringify(history.rows.length));
check(
  history.rows[0]?.action === 'account.restore' && history.rows[1]?.action === 'account.suspend',
  'the newest first, and they say different things',
  JSON.stringify(history.rows.map((r) => r.action)),
);

// ===========================================================================
// 8. Paging
// ===========================================================================
const pageOne = await as(MEMBER, `select * from public.my_receipts(1, null)`);
check(pageOne.rows.length === 1, 'a page of one returns one', JSON.stringify(pageOne.rows.length));
const pageTwo = await as(
  MEMBER,
  `select * from public.my_receipts(1, '${pageOne.rows[0]?.created_at?.toISOString?.() ?? pageOne.rows[0]?.created_at}')`,
);
check(
  pageTwo.rows.length === 1 && pageTwo.rows[0]?.id !== pageOne.rows[0]?.id,
  'and the next page starts after it rather than repeating it',
  JSON.stringify(pageTwo.rows.map((r) => r.action)),
);
const tooBig = await as(MEMBER, `select * from public.my_receipts(500, null)`);
check(tooBig.error !== null, 'a page larger than 200 is refused', tooBig.error?.message ?? 'accepted');

const anon = await asSystem(`set role anon; select * from public.my_receipts(10, null)`);
check(
  anon.error !== null || anon.rows.length === 0,
  'anon cannot read anybody’s receipts',
  anon.error?.message ?? JSON.stringify(anon.rows.length),
);

// ===========================================================================
// 9. The bulk trigger does not fire on an unrelated audit row
// ===========================================================================
const beforeUnrelated = Number((await rows(`select count(*)::int as n from public.action_receipts`))[0]?.n ?? 0);
await asSystem(`
  select bsdc.audit('people.status', '${OTHER}', jsonb_build_object('status', 'active'))
`);
const afterUnrelated = Number((await rows(`select count(*)::int as n from public.action_receipts`))[0]?.n ?? 0);
check(afterUnrelated === beforeUnrelated, 'an audit row that is not a bulk apply writes no receipt', `${beforeUnrelated} -> ${afterUnrelated}`);

console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) {
  console.log(bad.map((b) => `  - ${b}`).join('\n'));
  process.exitCode = 1;
}
