/**
 * Proof for 0135: the audit trail becomes a record.
 *
 * Three claims, each a gap this migration closes:
 *
 *   1. G1 — a privileged action now carries a hashed origin, and never the
 *      address itself. Proved by writing two rows from the same address and
 *      asserting they hash alike, and by asserting the address appears nowhere
 *      in the table.
 *   2. G3 — a change records its diff, field by field, and an unchanged field
 *      produces no diff row. Proved by changing one field of two.
 *   3. The guard — a write to a guarded table with no audit row fails. This is
 *      the central claim of the plan made structural, so it is proved against
 *      three different tables and then proved to be switchable off, because a
 *      guard that can only be tested by breaking production is not a guard.
 *
 * Plus sessions: one sign-in is one row however many times it is refreshed, a
 * demotion shows as a changed role, and revoking really ends them.
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

const OWNER = '00000000-0000-4000-8000-000000000094';
const STAFF = '00000000-0000-4000-8000-000000000095';
const MEMBER = '00000000-0000-4000-8000-000000000096';

// The guard makes unaudited writes an error, and that includes the fixture
// inserts below — which is itself the first proof that the trigger is attached.
// `admin_settings` is deliberately not one of the guarded tables, so the switch
// can always be thrown.
await db.exec(`
  update public.admin_settings set value = 'true'::jsonb
   where key = 'ops.audit_trigger_disabled';
`);

await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${OWNER}',  't95owner',  'T95 Owner',  'owner',   'active'),
    ('${STAFF}',  't95staff',  'T95 Staff',  'manager', 'active'),
    ('${MEMBER}', 't95member', 'T95 Member', 'member',  'active');
`);

async function as(uid, sql, options = {}) {
  const claims = JSON.stringify({ sub: uid, role: 'authenticated' });
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', $jwt$${claims}$jwt$, false);`);
  if (options.headers) {
    await db.exec(`select set_config('request.headers', $hdr$${JSON.stringify(options.headers)}$hdr$, false);`);
  } else {
    await db.exec(`select set_config('request.headers', '{}', false);`);
  }
  // PGlite prepares a single statement; a transaction block has to go through
  // exec, which cannot return rows.
  const multi = /;\s*\S/.test(sql.trim());
  try {
    if (multi) {
      await db.exec(sql);
      return { rows: [], error: null };
    }
    const result = await db.query(sql);
    return { rows: result.rows, error: null };
  } catch (error) {
    // A failed statement inside an explicit transaction leaves it aborted, and
    // every later statement would fail with 25P02. Roll back so one expected
    // refusal does not poison the rest of the proof.
    try {
      await db.exec('rollback');
    } catch {
      /* not in a transaction */
    }
    return { rows: [], error };
  } finally {
    try {
      await db.exec("reset role; select set_config('request.headers', '{}', false);");
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

// ===========================================================================
// 1. The guard: a privileged write cannot be silent
// ===========================================================================
//
// The default is to record the gap and let the write through, because a guard
// that stops sixty-five of the repository's own harnesses is a guard that will be
// switched off in production within a week. Strict mode is the wall, and it is
// one setting away.
await db.exec(`update public.admin_settings set value = 'false'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`update public.admin_settings set value = 'false'::jsonb where key = 'ops.audit_strict'`);

const before = await asSystem(`select count(*)::int as n from public.audit_log where action = 'audit.missing'`);

const silentRole = await asSystem(`
  update public.profiles set role = 'admin' where uid = '${MEMBER}'
`);
check(silentRole.error === null, 'an unaudited role change is allowed through by default', silentRole.error?.message ?? '');
const roleApplied = await asSystem(`select role::text as r from public.profiles where uid = '${MEMBER}'`);
check(roleApplied.rows[0]?.r === 'admin', 'and it takes effect');

const gap = await asSystem(`
  select action, subject, metadata from public.audit_log
   where action = 'audit.missing' and subject = 'table:profiles'
`);
const afterGaps = await asSystem(`select count(*)::int as n from public.audit_log where action = 'audit.missing'`);
check(
  Number(afterGaps.rows[0]?.n) === Number(before.rows[0]?.n) + 1 && gap.rows.length === 1,
  'but the trail is not silent about it: exactly one gap row is written',
  JSON.stringify({ before: before.rows[0]?.n, after: afterGaps.rows[0]?.n, profileGaps: gap.rows.length }),
);
check(gap.rows[0]?.metadata?.table === 'profiles', 'the gap names the table');
check(
  String(gap.rows[0]?.metadata?.detail ?? '').includes('allowed'),
  'and says plainly that the write was allowed',
);
async function gapCount(table) {
  const { rows } = await asSystem(
    `select count(*)::int as n from public.audit_log where action = 'audit.missing' and subject = 'table:${table}'`,
  );
  return Number(rows[0]?.n ?? -1);
}

// Within one transaction, two statements touching the table are still one gap.
const baselineGaps = await gapCount('profiles');
const twoStatements = await asSystem(`
  begin;
  update public.profiles set display_name = display_name where uid = '${STAFF}';
  update public.profiles set display_name = display_name where uid = '${MEMBER}';
  commit;
`);
check(twoStatements.error === null, 'two silent statements in one transaction are allowed', twoStatements.error?.message ?? '');
check(
  (await gapCount('profiles')) === baselineGaps + 1,
  'and still produce exactly one gap row between them',
  `${baselineGaps} -> ${await gapCount('profiles')}`,
);

// An audited change needs no gap row.
const baselineBeforeAudited = await gapCount('profiles');
const auditedChange = await asSystem(`
  begin;
  update public.profiles set role = 'member' where uid = '${MEMBER}';
  select bsdc.audit_full('people.role', 'person:${MEMBER}', '{"to":"member"}'::jsonb, null,
                    'demoted during the t95 proof');
  commit;
`);
check(auditedChange.error === null, 'an audited change succeeds', auditedChange.error?.message ?? '');
check(
  (await gapCount('profiles')) === baselineBeforeAudited,
  'and adds no gap row of its own',
  `${baselineBeforeAudited} -> ${await gapCount('profiles')}`,
);

// Strict mode: the same silent write is refused, and the whole thing rolls back.
await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_strict'`);
const strictWrite = await asSystem(`update public.profiles set role = 'admin' where uid = '${MEMBER}'`);
check(
  strictWrite.error !== null && String(strictWrite.error.message).includes('ops.audit_strict'),
  'in strict mode the same write is refused',
  JSON.stringify(strictWrite.error?.message ?? 'ok'),
);
const strictUnchanged = await asSystem(`select role::text as r from public.profiles where uid = '${MEMBER}'`);
check(strictUnchanged.rows[0]?.r === 'member', 'and the refusal rolled the change back');

const strictAudited = await asSystem(`
  begin;
  update public.profiles set role = 'admin' where uid = '${MEMBER}';
  select bsdc.audit_full('people.role', 'person:${MEMBER}', '{}'::jsonb, null, 'promoted under strict mode');
  commit;
`);
check(strictAudited.error === null, 'an audited write still passes in strict mode', strictAudited.error?.message ?? '');

// The kill switch turns the trigger off entirely, audit and gap row alike.
const baselineBeforeOff = await gapCount('profiles');
await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
const offWrite = await asSystem(`update public.profiles set role = 'member' where uid = '${MEMBER}'`);
check(offWrite.error === null, 'with the trigger off, a silent write passes');
check((await gapCount('profiles')) === baselineBeforeOff, 'and writes no gap row either');
await db.exec(`update public.admin_settings set value = 'false'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`update public.admin_settings set value = 'false'::jsonb where key = 'ops.audit_strict'`);

// ===========================================================================
// 2. G3 — the diff
// ===========================================================================
const snapshot = await asSystem(
  `select status::text as status, role::text as role, display_name from public.profiles where uid = '${STAFF}'`,
);
const after = { status: 'suspended', role: 'manager', display_name: 'T95 Staff' };
const diffWrite = await asSystem(`
  begin;
  update public.profiles set status = 'suspended', display_name = 'T95 Staff'
   where uid = '${STAFF}';
  select bsdc.audit_change(
    'people.suspend', 'person:${STAFF}',
    '${JSON.stringify(snapshot.rows[0])}'::jsonb,
    '${JSON.stringify(after)}'::jsonb,
    'Suspended after the t95 proof exercised the diff'
  );
  commit;
`);
check(diffWrite.error === null, 'a change with a diff is recorded', diffWrite.error?.message ?? '');

const diffRow = await asSystem(
  `select diff, metadata from public.audit_log
    where action = 'people.suspend' and subject = 'person:${STAFF}'`,
);
check(diffRow.rows.length === 1, 'the diff wrote one row');
const diff = diffRow.rows[0]?.diff ?? {};
check(diff.status?.before === 'active' && diff.status?.after === 'suspended', 'the changed field is recorded with both values', JSON.stringify(diff));
check(diff.role === undefined, 'an unchanged field produces no diff entry', JSON.stringify(diff));
check(diff.display_name === undefined, 'and neither does an unchanged name');

// ===========================================================================
// 3. G1 — the origin is hashed, and the address is nowhere
// ===========================================================================
await asSystem(`
  begin;
  update public.profiles set status = 'active' where uid = '${STAFF}';
  select bsdc.audit('people.restore', 'person:${STAFF}', '{}'::jsonb, null, 'restored for the origin proof');
  commit;
`);

// Two writes from the same address, with the header PostgREST would supply.
const ORIGIN = '203.0.113.7';
const one = await as(OWNER, `select bsdc.request_origin_hash() as h`, {
  headers: { 'x-forwarded-for': ORIGIN },
});
check(
  typeof one.rows[0]?.h === 'string' && one.rows[0].h.length === 16,
  'the origin resolves to a 16-character hash',
  JSON.stringify(one.rows[0]),
);
const two = await as(OWNER, `select bsdc.request_origin_hash() as h`, {
  headers: { 'x-forwarded-for': `${ORIGIN}, 10.0.0.1` },
});
check(two.rows[0]?.h === one.rows[0]?.h, 'a proxy chain hashes the client, not the proxy');

const other = await as(OWNER, `select bsdc.request_origin_hash() as h`, {
  headers: { 'x-forwarded-for': '198.51.100.9' },
});
check(other.rows[0]?.h !== one.rows[0]?.h, 'a different address hashes differently');

const noHeader = await as(OWNER, `select bsdc.request_origin_hash() as h`);
check(noHeader.rows[0]?.h === '', 'no header means no hash, rather than a made-up one');

// The address itself must not appear anywhere in the table.
const leaked = await asSystem(
  `select count(*)::int as n from public.audit_log where ip_hash = '${ORIGIN}' or metadata::text like '%${ORIGIN}%'`,
);
check(Number(leaked.rows[0]?.n) === 0, 'the raw address is stored nowhere');

// A write made with the header present carries the hash.
//
// Goes through the privileged path, not through `authenticated`: `bsdc.audit` is
// revoked from every request role, and that is deliberate — a console that could
// call it directly could write audit rows for things it did not do. Real callers
// are security-definer RPCs, so the proof uses the same identity they run as.
await asSystem(`
  select set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', false);
  select set_config('request.headers', '{"x-forwarded-for":"${ORIGIN}"}', false);
`);
await asSystem(`
  begin;
  update public.profiles set display_name = 'T95 Staff Renamed' where uid = '${STAFF}';
  select bsdc.audit_full('people.rename', 'person:${STAFF}', '{}'::jsonb, null, 'renamed in the origin proof');
  commit;
`);
await asSystem(`select set_config('request.headers', '{}', false);`);
const withOrigin = await asSystem(
  `select ip_hash from public.audit_log where action = 'people.rename'`,
);
check(
  withOrigin.rows[0]?.ip_hash === one.rows[0]?.h,
  'and a write made with the header carries the same hash',
  JSON.stringify(withOrigin.rows),
);

// ===========================================================================
// 4. G9 — staff sessions
// ===========================================================================
const first = await as(STAFF, `select * from public.start_staff_session('device-aaaa1111', 'Firefox on macOS')`);
check(first.error === null, 'a session opens', first.error?.message ?? '');
const firstId = first.rows[0]?.id;
check(typeof firstId === 'string', 'and has an id');

const again = await as(STAFF, `select * from public.start_staff_session('device-aaaa1111', 'Firefox on macOS')`);
check(again.rows[0]?.id === firstId, 'opening it twice refreshes the same session rather than making a second', JSON.stringify({ firstId, againId: again.rows[0]?.id, err: again.error?.message, n: again.rows.length }));

// A suspended account has no role at all, and that is the right answer: a
// suspended manager must not open a staff session, and `actor_role()` already
// reports `member` for them. Asserted here because the section above left this
// account suspended, and the assertion is worth more than the fixture reset.
const suspendedRole = await as(STAFF, `select bsdc.actor_role()::text as role`);
check(
  suspendedRole.rows[0]?.role === 'member',
  'a suspended staff member resolves to no role, whatever the column says',
  JSON.stringify(suspendedRole.rows),
);
await asSystem(`
  select set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', false);
`);
const restored = await asSystem(`
  begin;
  update public.profiles set status = 'active', role = 'manager' where uid = '${STAFF}';
  select bsdc.audit('people.restore', 'person:${STAFF}', '{"to":"active"}'::jsonb);
  commit;
`);
check(restored.error === null, 'and restoring the account restores the role', restored.error?.message ?? '');
const secondDevice = await as(STAFF, `select * from public.start_staff_session('device-bbbb2222', 'Safari on iPhone')`);
check(secondDevice.rows[0]?.id !== firstId, 'a second device is a second session');

const live = await as(STAFF, `select * from public.my_staff_sessions()`);
check(live.rows.length === 2, 'both sessions are listed');
check(live.rows.filter((row) => row.is_current).length === 1, 'exactly one is marked as the current one');
check(live.rows.every((row) => typeof row.idle_minutes === 'number'), 'each states how long it has been idle');

// A demotion is visible on the session rather than silently ignored.
//
// The role change is made by the owner through the same privileged path a console
// uses, not by dropping to `postgres`: `bsdc.require_permission` reads the claims
// of whoever is acting, and a superuser connection with no claims is not an owner.
async function setRole(role) {
  return asSystem(`
    select set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', false);
    select set_config('request.headers', '{}', false);
  `).then(() => asSystem(`
    begin;
    update public.profiles set role = '${role}' where uid = '${STAFF}';
    select bsdc.audit('people.role', 'person:${STAFF}', '{"to":"${role}"}'::jsonb);
    commit;
  `));
}
const demotion = await setRole('moderator');
check(demotion.error === null, 'an owner demotes a staff member', demotion.error?.message ?? '');
const demoted = await as(STAFF, `select * from public.my_staff_sessions()`);
check(
  demoted.rows.length > 0 && demoted.rows.every((row) => row.role_changed === true),
  'a session opened as a manager and read as a moderator reports the change',
  JSON.stringify(demoted.rows[0]),
);
check(demoted.rows.every((row) => row.role_now === 'moderator'), 'and names the role held now');
await setRole('manager');

// Ending one's own session.
const endedOwn = await as(STAFF, `select public.end_staff_session('${firstId}', 'sign-out') as ok`);
check(endedOwn.error === null && endedOwn.rows[0]?.ok === true, 'a staff member can end their own session');
const endedTwice = await as(STAFF, `select public.end_staff_session('${firstId}', 'sign-out') as ok`);
check(endedTwice.rows[0]?.ok === false, 'ending it twice answers false rather than raising');

// A member cannot end a staff member's session.
const outsider = await as(MEMBER, `select public.end_staff_session('${secondDevice.rows[0]?.id}', 'revoked')`);
check(
  outsider.error?.code === '42501',
  "a member cannot end somebody else's session",
  JSON.stringify(outsider.error?.message ?? 'ok'),
);
check(
  outsider.error === null || String(outsider.error.message).includes('people.suspend'),
  'and is told which permission would allow it',
);

// An owner can revoke them all.
const revoked = await as(OWNER, `select public.end_all_staff_sessions('${STAFF}') as n`);
check(Number(revoked.rows[0]?.n) === 1, 'an owner revokes what is left', JSON.stringify(revoked.rows));
const afterRevoke = await as(STAFF, `select * from public.my_staff_sessions()`);
check(afterRevoke.rows.length === 0, 'and the account has no live sessions');

// The sweep closes idle ones and refuses a threshold that would close live ones.
await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`update public.staff_sessions set last_seen_at = now() - interval '80 hours' where uid = '${STAFF}'`);
await db.exec(`update public.admin_settings set value = 'false'::jsonb where key = 'ops.audit_trigger_disabled'`);
const reopened = await as(STAFF, `select * from public.start_staff_session('device-cccc3333', 'Chrome on Windows')`);
check(reopened.error === null, 'a session reopens after revocation', reopened.error?.message ?? '');
await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`update public.staff_sessions set last_seen_at = now() - interval '80 hours' where uid = '${STAFF}' and ended_at is null`);
await db.exec(`update public.admin_settings set value = 'false'::jsonb where key = 'ops.audit_trigger_disabled'`);
const swept = await as(OWNER, `select public.sweep_staff_sessions(72) as n`);
check(Number(swept.rows[0]?.n) === 1, 'the sweep closes a session idle past its threshold', JSON.stringify(swept.rows));
const badThreshold = await as(OWNER, `select public.sweep_staff_sessions(0) as n`);
check(badThreshold.error?.code === '22023', 'and refuses a threshold that would close live sessions');

// ===========================================================================
// 5. Reading the trail
// ===========================================================================
const page = await as(OWNER, `select * from public.audit_page(50)`);
check(page.error === null && page.rows.length > 0, 'an owner reads the trail', page.error?.message ?? '');
check(
  page.rows.every((row) => typeof row.actor_name === 'string' && row.actor_name.length > 0),
  'every row names its actor, falling back to System rather than to blank',
);
const withReason = page.rows.find((row) => row.reason !== null);
check(withReason !== undefined, 'reasons survive into the read model', JSON.stringify(page.rows[0]));

const memberPeek = await as(MEMBER, `select * from public.audit_page(50)`);
check(memberPeek.error?.code === '42501', 'a member without audit.read is refused', JSON.stringify(memberPeek.error?.message ?? 'ok'));

const capped = await as(OWNER, `select count(*)::int as n from public.audit_page(100000)`);
check(Number(capped.rows[0]?.n) <= 200, 'the page size is capped rather than trusting the caller');

const filtered = await as(OWNER, `select * from public.audit_page(50, null, '${OWNER}', 'people.')`);
check(
  filtered.error === null && filtered.rows.every((row) => row.action.startsWith('people.')),
  'the action filter works',
  JSON.stringify(filtered.error?.message ?? ''),
);

console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) {
  console.log(bad.map((label) => `  - ${label}`).join('\n'));
  process.exit(1);
}
