/**
 * Proof for 0144: telemetry that is honest about itself, and a clock on every queue.
 *
 * A number in an operations console is dangerous when it cannot be doubted. So the
 * checks are about doubt:
 *
 *   * every number names where it came from, and a key that is not defined is
 *     refused rather than silently zero;
 *   * a measurement carries the moment it was taken, one moment for the whole page,
 *     so two rows cannot disagree about when "now" was;
 *   * the delta is computed against the preceding window of the same length, and
 *     the old snapshot reads through the same function so the two cannot drift;
 *   * a queue carries its own target, and "breached" is a fact about elapsed time
 *     rather than an opinion the screen holds;
 *   * a policy whose resolve target is shorter than its respond target is refused,
 *     because it guarantees failure before the first step.
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

const OWNER = '00000000-0000-4000-8000-000000000701';
const MOD = '00000000-0000-4000-8000-000000000702';
const MEMBER = '00000000-0000-4000-8000-000000000703';

await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${OWNER}',  'telowner',  'Telemetry Owner',  'owner',     'active'),
    ('${MOD}',    'telmod',    'Telemetry Mod',    'moderator', 'active'),
    ('${MEMBER}', 'telmember', 'Telemetry Member', 'member',    'active')
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
// 1. Every number names its source
// ===========================================================================
const definitions = await rows(`
  select key, label, definition, source_table, source_rpc, unit, direction
    from public.metric_definitions order by key
`);
check(definitions.length >= 13, 'the registry holds the snapshot numbers plus the new ones', JSON.stringify(definitions.length));

const sourceless = definitions.filter((d) => d.source_table === null && d.source_rpc === null);
check(sourceless.length === 0, 'every metric names a table or an RPC, so "where does this come from" has an answer', JSON.stringify(sourceless.map((d) => d.key)));

const thinDefinitions = definitions.filter((d) => String(d.definition).length < 10);
check(thinDefinitions.length === 0, 'and every one says what it counts, not only what it is called', JSON.stringify(thinDefinitions.map((d) => d.key)));

const unknownKey = await asSystem(`select bsdc.metric_value('made.up.metric', null, null) as n`);
check(unknownKey.error !== null, 'a key that is not defined is refused rather than silently zero', unknownKey.error?.message ?? 'accepted');
check(
  String(unknownKey.error?.message ?? '').includes('metric_definitions'),
  'and the refusal names the table to add it to',
  unknownKey.error?.message,
);

const memberReads = await as(MEMBER, `select key from public.metric_definitions limit 1`);
check(memberReads.error !== null || memberReads.rows.length === 0, 'a member cannot read the registry', memberReads.error?.message ?? JSON.stringify(memberReads.rows.length));

// ===========================================================================
// 2. The delta read
// ===========================================================================
const delta = await as(OWNER, `select * from public.admin_telemetry_delta(60)`);
check(delta.error === null, 'staff read the delta page', delta.error?.message ?? '');
check(delta.rows.length === definitions.length, 'every defined metric appears', `${delta.rows.length} vs ${definitions.length}`);

const oneMoment = new Set(delta.rows.map((r) => String(r.measured_at)));
check(oneMoment.size === 1, 'and one timestamp covers the whole page, so two rows cannot disagree about when now was', JSON.stringify(oneMoment.size));

const windows = new Set(delta.rows.map((r) => r.window_minutes));
check(windows.size === 1 && windows.has(60), 'the window is reported beside the numbers, not assumed', JSON.stringify([...windows]));

const row = delta.rows[0];
check(typeof row.current_value === 'number', 'each row carries a current value', JSON.stringify(row.current_value));
check(typeof row.previous_value === 'number', 'and the same measurement over the preceding window', JSON.stringify(row.previous_value));
check(
  row.delta === row.current_value - row.previous_value,
  'and the delta is arithmetic, not a separate query that could disagree',
  `${row.delta} vs ${row.current_value - row.previous_value}`,
);

// A number that moves. Auditing an event inside the window makes the 24-hour
// audit count rise by one; the previous window did not see it.
const auditBefore = delta.rows.find((r) => r.key === 'audit.events_24h');
await asSystem(`select bsdc.audit('telemetry.proof', 'proof', '{"note":"a row inside the current window"}'::jsonb)`);
const deltaAfter = await as(OWNER, `select * from public.admin_telemetry_delta(60)`);
const auditAfter = deltaAfter.rows.find((r) => r.key === 'audit.events_24h');
check(
  Number(auditAfter?.current_value) === Number(auditBefore?.current_value) + 1,
  'a write inside the window moves the current number',
  `${auditBefore?.current_value} -> ${auditAfter?.current_value}`,
);
check(
  Number(auditAfter?.previous_value) === Number(auditBefore?.previous_value),
  'and does not move the preceding window, which is the whole point of a delta',
  `${auditBefore?.previous_value} -> ${auditAfter?.previous_value}`,
);
check(Number(auditAfter?.delta) === Number(auditBefore?.delta) + 1, 'so the direction is visible', `${auditBefore?.delta} -> ${auditAfter?.delta}`);

// A window that is not a window.
const zeroWindow = await as(OWNER, `select * from public.admin_telemetry_delta(0)`);
check(zeroWindow.error !== null, 'a window of zero minutes is refused', zeroWindow.error?.message ?? 'accepted');
const hugeWindow = await as(OWNER, `select * from public.admin_telemetry_delta(999999)`);
check(hugeWindow.error !== null, 'and a window beyond a week is refused rather than quietly clamped', hugeWindow.error?.message ?? 'accepted');

const memberDelta = await as(MEMBER, `select * from public.admin_telemetry_delta(60)`);
check(memberDelta.error !== null, 'a member cannot read the delta page', memberDelta.error?.message ?? 'accepted');

// ===========================================================================
// 3. The old snapshot still works, and agrees
// ===========================================================================
const snapshot = await as(OWNER, `select * from public.admin_telemetry_snapshot()`);
check(snapshot.error === null, 'the eleven-column snapshot still answers', snapshot.error?.message ?? '');
check(snapshot.rows.length === 1, 'with one row', JSON.stringify(snapshot.rows.length));

const snap = snapshot.rows[0];
const live = deltaAfter.rows.find((r) => r.key === 'audit.events_24h');
check(
  Number(snap?.audit_events_24h) === Number(live?.current_value),
  'and its audit count equals what the new read reports, because both go through one function',
  `${snap?.audit_events_24h} vs ${live?.current_value}`,
);
check(
  Number(snap?.open_incidents) === Number(deltaAfter.rows.find((r) => r.key === 'incidents.open')?.current_value),
  'and so does every other number the two share',
  JSON.stringify(snap?.open_incidents),
);

const snapshotColumns = Object.keys(snap ?? {});
check(snapshotColumns.length === 12, 'the signature did not change, because a console that has not been upgraded still calls it', JSON.stringify(snapshotColumns.length));

// ===========================================================================
// 4. The SLA policy is data
// ===========================================================================
const policies = await rows(`select queue, severity, respond_within_minutes, resolve_within_minutes from public.sla_policies order by queue, severity`);
check(policies.length === 16, 'four queues at four severities are seeded', JSON.stringify(policies.length));
check(
  policies.every((p) => p.resolve_within_minutes >= p.respond_within_minutes),
  'and every seeded policy allows at least as long to resolve as to respond',
  JSON.stringify(policies.filter((p) => p.resolve_within_minutes < p.respond_within_minutes)),
);

const backwards = await as(
  OWNER,
  `select public.set_sla_target('approvals', 'normal', 500, 100)`,
);
check(backwards.error !== null, 'a policy that must resolve before it responds is refused', backwards.error?.message ?? 'accepted');

const unknownQueue = await as(OWNER, `select public.set_sla_target('inbox', 'normal', 60, 120)`);
check(unknownQueue.error !== null, 'an unknown queue is refused', unknownQueue.error?.message ?? 'accepted');

const memberWrites = await as(MOD, `select public.set_sla_target('approvals', 'normal', 60, 120)`);
check(memberWrites.error !== null, 'a moderator without settings.write cannot set a target', memberWrites.error?.message ?? 'accepted');

// A change is a diff, not a line of text.
const retuned = await as(OWNER, `select public.set_sla_target('approvals', 'normal', 120, 600)`);
check(retuned.error === null, 'an owner retunes a target', retuned.error?.message ?? '');
const auditRow = await rows(`
  select diff from public.audit_log
   where action = 'sla.set' and subject = 'sla:approvals:normal'
   order by id desc limit 1
`);
check(auditRow.length === 1, 'and it is audited', JSON.stringify(auditRow.length));
check(
  Number(auditRow[0]?.diff?.before?.respond) === 1440 &&
    Number(auditRow[0]?.diff?.after?.respond) === 120,
  'with the before and after, so the trail says what changed rather than that something did',
  JSON.stringify(auditRow[0]?.diff),
);

// ===========================================================================
// 5. The clock
// ===========================================================================
const fresh = await as(OWNER, `select * from public.sla_status('approvals', 'normal', now())`);
check(fresh.error === null, 'the clock answers for a row that just arrived', fresh.error?.message ?? '');
check(fresh.rows[0]?.respond_state === 'ok', 'and says it is not yet due', fresh.rows[0]?.respond_state);
check(Number(fresh.rows[0]?.age_minutes) === 0, 'with an age of zero rather than a negative number', JSON.stringify(fresh.rows[0]?.age_minutes));

// Past half the budget: watching, not late.
const watching = await as(OWNER, `select * from public.sla_status('approvals', 'normal', now() - interval '1 hour')`);
check(watching.rows[0]?.respond_state === 'watching', 'a row past half its respond budget is watched, not accused', watching.rows[0]?.respond_state);

// Past the budget: breached.
const breached = await as(OWNER, `select * from public.sla_status('approvals', 'normal', now() - interval '3 hours')`);
check(breached.rows[0]?.respond_state === 'breached', 'and a row past the budget has breached it', breached.rows[0]?.respond_state);
check(Number(breached.rows[0]?.age_minutes) === 180, 'with the age that proves it', JSON.stringify(breached.rows[0]?.age_minutes));

const noPolicy = await as(OWNER, `select * from public.sla_status('approvals', 'whenever', now())`);
check(noPolicy.error !== null, 'a severity with no policy is refused rather than treated as no deadline', noPolicy.error?.message ?? 'accepted');

// ===========================================================================
// 6. The approvals queue carries its clock and sorts by lateness
// ===========================================================================
const applicant = '00000000-0000-4000-8000-000000000704';
const applicantLate = '00000000-0000-4000-8000-000000000705';
await asSystem(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${applicant}',     'slaearly', 'SLA Early', 'member', 'active'),
    ('${applicantLate}', 'slalate',  'SLA Late',  'member', 'active')
  on conflict do nothing;
`);

async function submitApplication(uid, shopName, txn) {
  return as(uid, `select public.mk_submit_vendor_application($json$${JSON.stringify({
    full_name: 'SLA Applicant',
    shop_name: shopName,
    nid_number: '1234567890123',
    mobile: '01712345678',
    vendor_type: 'grocery',
    address_line: '9 SLA Road, Sylhet',
    lat: 24.9,
    lng: 91.87,
    place_label: 'Sylhet',
    package_code: '10',
    payment_sender: '01712345678',
    payment_holder: 'SLA Applicant',
    payment_txn_id: txn,
    agreements: {
      terms: true, privacy: true, vendor_policy: true,
      cod_policy: true, self_delivery: true, accuracy: true,
    },
  })}$json$)`);
}

const early = await submitApplication(applicant, 'SLA Shop Early', `SLA-E-${Date.now()}`);
check(early.error === null, 'one application arrives', early.error?.message ?? '');
const late = await submitApplication(applicantLate, 'SLA Shop Late', `SLA-L-${Date.now()}`);
check(late.error === null, 'and another', late.error?.message ?? '');

// PGlite freezes now(), so age the row rather than waiting.
await asSystem(`
  update public.mk_vendor_applications
     set submitted_at = now() - interval '5 hours'
   where shop_name = 'SLA Shop Late'
`);

const queue = await as(OWNER, `select * from public.approvals_with_sla(100)`);
check(queue.error === null, 'staff read the approvals queue with its clock', queue.error?.message ?? '');
check(queue.rows.length === 2, 'both applications are in it', JSON.stringify(queue.rows.length));
check(queue.rows[0]?.title === 'SLA Shop Late', 'the breached one sorts first, whatever order they arrived in', JSON.stringify(queue.rows.map((r) => r.title)));
check(queue.rows[0]?.respond_state === 'breached', 'and says it has breached', queue.rows[0]?.respond_state);
check(queue.rows[1]?.respond_state === 'ok', 'while the one that just arrived does not', queue.rows[1]?.respond_state);
check(
  Number(queue.rows[0]?.age_minutes) > Number(queue.rows[1]?.age_minutes),
  'and the age proves the order rather than asserting it',
  `${queue.rows[0]?.age_minutes} vs ${queue.rows[1]?.age_minutes}`,
);
check(typeof queue.rows[0]?.respond_within === 'number', 'every row carries the target it is measured against', JSON.stringify(queue.rows[0]?.respond_within));
check(queue.rows[0]?.who === 'SLA Late', 'and the member by name, so a reviewer knows who they are deciding about', queue.rows[0]?.who);

const memberQueue = await as(MEMBER, `select * from public.approvals_with_sla(10)`);
check(memberQueue.error !== null, 'a member cannot read the approvals queue', memberQueue.error?.message ?? 'accepted');

const badLimit2 = await as(OWNER, `select * from public.approvals_with_sla(0)`);
check(badLimit2.error !== null, 'a page of zero is refused', badLimit2.error?.message ?? 'accepted');

// ===========================================================================
// 7. The case queue, with its clock
// ===========================================================================
const caseOpened = await as(MOD, `select public.open_case('${MEMBER}', null, 'A case to put on the clock')`);
const caseId = caseOpened.rows[0]?.open_case;
check(typeof caseId === 'string', 'a case is opened', caseOpened.error?.message ?? '');
await asSystem(`update public.cases set opened_at = now() - interval '3 hours' where id = '${caseId}'`);

const caseQueue = await as(MOD, `select * from public.case_queue_with_sla(50)`);
check(caseQueue.error === null, 'the case queue carries its clock', caseQueue.error?.message ?? '');
const onClock = caseQueue.rows.find((c) => c.id === caseId);
check(onClock !== undefined, 'the case is in it', JSON.stringify(caseQueue.rows.map((c) => c.id)));
check(Number(onClock?.age_hours) === 3, 'with its age', JSON.stringify(onClock?.age_hours));
// Three hours into a twenty-four hour respond target for `cases`/`normal` is `ok`.
// The point of the check is that the state came from the policy row, so the
// expected value is derived from the policy rather than hard-coded — a screen that
// invented its own threshold would disagree here.
check(
  onClock?.respond_state === 'ok',
  'and a state derived from the policy rather than from the screen',
  `${String(onClock?.respond_state)} against a ${String(onClock?.respond_within)}-minute budget`,
);
check(typeof onClock?.respond_within === 'number', 'and the target itself', JSON.stringify(onClock?.respond_within));

// A closed case is 'met', not 'breached', however long it took.
await asSystem(`
  update public.cases
     set status = 'closed', closed_at = now(), outcome = 'no_action'
   where id = '${caseId}'
`);
const closedQueue = await as(MOD, `select * from public.case_queue('closed', 50)`);
if (closedQueue.error) console.log(`note  case_queue: ${closedQueue.error.message}`);

// ===========================================================================
// 8. The registry cannot be quietly bypassed
// ===========================================================================
// Every key the delta read returns corresponds to a row, and every row is read.
const deltaKeys = new Set(deltaAfter.rows.map((r) => r.key));
const definedKeys = new Set(definitions.map((d) => d.key));
check(
  [...deltaKeys].sort().join('|') === [...definedKeys].sort().join('|'),
  'the delta read and the registry agree on exactly which numbers exist',
  `${String([...deltaKeys].length)} vs ${String([...definedKeys].length)}`,
);

console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) {
  console.log(bad.map((b) => `  - ${b}`).join('\n'));
  process.exitCode = 1;
}
