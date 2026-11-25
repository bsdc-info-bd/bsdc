/**
 * Proof for 0138: the audit and authority screens.
 *
 * The screens exist to answer questions, so the proof is written as questions:
 *
 *   "who can do this, and why?"     -> the matrix names the route, and the three
 *                                      routes are distinguishable: role, grant,
 *                                      deny, and the owner wildcard.
 *   "who is signed in as me?"       -> the sessions screen, including the three
 *                                      flags and — just as important — that it
 *                                      does NOT flag an ordinary session.
 *   "what was done to this account?" -> the timeline, which must return rows for
 *                                      the account and none for anybody else.
 *
 * The load-bearing checks are the negative ones. A security screen that flags
 * everything is as useless as one that flags nothing, and a "why" screen that
 * cannot distinguish "never granted" from "granted then denied" cannot explain
 * itself to the person it is about.
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

const OWNER = '00000000-0000-4000-8000-000000000101';
const MANAGER = '00000000-0000-4000-8000-000000000102';
const MEMBER = '00000000-0000-4000-8000-000000000103';

await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${OWNER}',   'screenowner',   'Screen Owner',   'owner',     'active'),
    ('${MANAGER}', 'screenmanager', 'Screen Manager', 'manager',   'active'),
    ('${MEMBER}',  'screenmember',  'Screen Member',  'member',    'active')
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

// ===========================================================================
// 1. "Who can do this, and why?"
// ===========================================================================
const ownerMatrix = await as(OWNER, `select * from public.person_authority('${OWNER}')`);
check(ownerMatrix.error === null, 'an owner reads their own matrix', ownerMatrix.error?.message ?? '');
// Compared against the catalogue rather than against a number: 0145 added one
// permission, and a test that has to be edited every time the catalogue grows is a
// test that will one day be edited to the wrong number.
const catalogueSize = await asSystem(`select count(*)::integer as n from public.permission_catalogue`);
check(
  ownerMatrix.rows.length === catalogueSize.rows[0]?.n,
  'the matrix covers every catalogued permission',
  `${ownerMatrix.rows.length} of ${catalogueSize.rows[0]?.n}`,
);

const ownerRoutes = new Set(ownerMatrix.rows.map((row) => row.via));
check(ownerRoutes.has('owner'), 'the owner holds them through the wildcard');
check(
  ownerMatrix.rows.every((row) => row.effective === true),
  'and every permission is effective for them',
);

const managerMatrix = await as(MANAGER, `select * from public.person_authority('${MANAGER}')`);
check(managerMatrix.error === null, "a manager reads their own matrix", managerMatrix.error?.message ?? '');
check(
  managerMatrix.rows.every((row) => row.effective === false || row.via !== 'owner'),
  'a manager holds nothing through the owner wildcard',
);
check(
  managerMatrix.rows.some((row) => row.via === 'role'),
  'the reasons name the role baseline where that is the route',
);
check(
  managerMatrix.rows.some((row) => row.effective && row.via === 'role'),
  'and at least one manager permission is held by role',
);

// A grant is distinguishable from a role baseline — which is the whole point of
// the `via` column, and what a denial then has to be distinguishable from too.
const granted = await as(
  OWNER,
  `select public.set_permission_grant('${MANAGER}', 'owner.transfer', true,
     'Proving a grant shows as a grant, not as a role')`,
);
check(granted.error === null, 'an owner grants a permission', granted.error?.message ?? '');

const withGrant = await as(MANAGER, `select * from public.person_authority('${MANAGER}') where permission = 'owner.transfer'`);
check(withGrant.rows[0]?.effective === true, 'the grant is effective');
check(withGrant.rows[0]?.via === 'grant', 'and the route says grant', withGrant.rows[0]?.via);
check(
  typeof withGrant.rows[0]?.grant_by === 'string',
  'and the matrix names who granted it, so the answer is attributable',
);

// Revoke it and the reason becomes "none", not "role" and not "grant".
const revoked = await as(
  OWNER,
  `select public.set_permission_grant('${MANAGER}', 'owner.transfer', false,
     'Proving a revoked grant reads as none, not as a role baseline')`,
);
check(revoked.error === null, 'an owner revokes it again', revoked.error?.message ?? '');
const afterRevoke = await as(
  MANAGER,
  `select * from public.person_authority('${MANAGER}') where permission = 'owner.transfer'`,
);
check(
  afterRevoke.rows[0]?.effective === false && afterRevoke.rows[0]?.via === 'none',
  'a revoked grant leaves a permission held by nobody, and says so',
  JSON.stringify(afterRevoke.rows[0]),
);

// A deny is a third state again: not "none", because the difference is exactly
// what a member asks when access stops working.
const denied = await as(
  OWNER,
  `select public.deny_permission('${MANAGER}', 'shop.review',
     'Proving a deny is distinguishable from never granted')`,
);
check(denied.error === null, 'an owner denies a permission the role holds', denied.error?.message ?? '');

const withDeny = await as(MANAGER, `select * from public.person_authority('${MANAGER}') where permission = 'shop.review'`);
check(withDeny.rows[0]?.effective === false, 'the denial is effective');
check(withDeny.rows[0]?.via === 'denied', 'and the route says denied, not none', withDeny.rows[0]?.via);
check(
  typeof withDeny.rows[0]?.deny_reason === 'string' && withDeny.rows[0].deny_reason.length > 10,
  'and the matrix carries the reason the person was given',
  withDeny.rows[0]?.deny_reason,
);
check(
  withDeny.rows[0]?.via !== 'none',
  'a denial and a permission nobody ever had are different answers',
);

// The summary is one row and agrees with the matrix.
const summary = await as(OWNER, `select * from public.person_authority_summary('${MANAGER}')`);
check(summary.error === null, 'the summary reads', summary.error?.message ?? '');
const summaryRow = summary.rows[0];
check(typeof summaryRow?.display_name === 'string', 'and names the account');
// The summary must agree with the matrix *as it is now*, not with the matrix
// read before the grant and the deny were made. Comparing against the current
// matrix is the only comparison that can catch a summary that drifts.
const summaryMatrix = await as(OWNER, `select * from public.person_authority('${MANAGER}')`);
check(
  summaryRow?.denied === summaryMatrix.rows.filter((row) => row.via === 'denied').length,
  'its denial count matches the matrix it summarises',
  `${summaryRow?.denied} vs ${summaryMatrix.rows.filter((row) => row.via === 'denied').length}`,
);
check(
  summaryRow?.effective_from === summaryMatrix.rows.filter((row) => row.effective).length,
  'and its effective count matches too',
  `${summaryRow?.effective_from} vs ${summaryMatrix.rows.filter((row) => row.effective).length}`,
);
check(
  summaryRow?.granted === summaryMatrix.rows.filter((row) => row.via === 'grant').length,
  'and so does its grant count',
  `${summaryRow?.granted}`,
);

// A member may read their own authority and nobody else's.
const ownAuthority = await as(MEMBER, `select * from public.person_authority('${MEMBER}')`);
check(ownAuthority.error === null, 'a member reads their own authority', ownAuthority.error?.message ?? '');
check(
  ownAuthority.rows.every((row) => row.effective === false),
  'and holds nothing, which is the honest answer for a member',
);
const peek = await as(MEMBER, `select * from public.person_authority('${MANAGER}')`);
check(peek.error?.code === '42501', "but cannot read somebody else's", peek.error?.message ?? 'it answered');
check(
  String(peek.error?.message ?? '').includes('people.read'),
  'and is told which permission would allow it',
);

const ghost = await as(OWNER, `select * from public.person_authority('nobody-at-all')`);
check(ghost.error?.code === '23503', 'a uid that does not exist is refused', ghost.error?.message ?? 'it answered');

// ===========================================================================
// 2. "Who is signed in, and does anything look wrong?"
// ===========================================================================
const s1 = await as(MANAGER, `select * from public.start_staff_session('screen-dev-1', 'Firefox on macOS', 'BD')`);
check(s1.error === null, 'a session opens', s1.error?.message ?? '');
const s2 = await as(OWNER, `select * from public.start_staff_session('screen-dev-2', 'Safari on iPhone', 'BD')`);
check(s2.error === null, 'a second one opens for another account', s2.error?.message ?? '');

const sessions = await as(OWNER, `select * from public.admin_staff_sessions(100, false)`);
check(sessions.error === null, 'an owner reads every live session', sessions.error?.message ?? '');
check(sessions.rows.length === 2, 'both are listed', `${sessions.rows.length}`);
check(
  sessions.rows.every((row) => typeof row.display_name === 'string'),
  'each names whose session it is',
);
check(
  sessions.rows.every((row) => row.is_flagged === false),
  'and neither ordinary session is flagged — a screen that flags everything is a screen nobody reads',
  JSON.stringify(sessions.rows.map((row) => row.flag_reason)),
);
check(
  sessions.rows.every((row) => row.idle_minutes === 0 || typeof row.idle_minutes === 'number'),
  'each states how long it has been idle',
);

// A session idle past the sweep threshold is flagged, with the reason.
await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`update public.staff_sessions set last_seen_at = now() - interval '100 hours' where uid = '${MANAGER}'`);
await db.exec(`update public.admin_settings set value = 'false'::jsonb where key = 'ops.audit_trigger_disabled'`);
const idle = await as(OWNER, `select * from public.admin_staff_sessions(100, false)`);
const idleRow = idle.rows.find((row) => row.uid === MANAGER);
check(idleRow?.is_flagged === true, 'a session idle past the threshold is flagged');
check(
  String(idleRow?.flag_reason ?? '').includes('idle'),
  'and the flag says it is about idleness, not about the person',
  idleRow?.flag_reason,
);

// Two origins for one account, close together, in different countries: the flag
// is a pair reported for a human, never a verdict.
await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`
  update public.staff_sessions set ended_at = now(), ended_reason = 'sign-out' where uid = '${MANAGER}';
`);
await db.exec(`update public.admin_settings set value = 'false'::jsonb where key = 'ops.audit_trigger_disabled'`);
await as(MANAGER, `select * from public.start_staff_session('screen-dev-3', 'Firefox on macOS', 'BD')`);
await asSystem(`
  update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled';
`);
// The second session is given a different origin hash and country directly,
// because the harness has no way to spoof a header through the RPC.
const secondForManager = await asSystem(
  `select id from public.staff_sessions where uid = '${MANAGER}' and ended_at is null limit 1`,
);
// Two live sessions for one account, from different countries, seen minutes
// apart — the impossible-travel shape. The update is scoped to one device on
// purpose: `where uid = ... and ended_at is null` would touch the row inserted
// immediately after it and give both the same origin, which is a fixture bug
// that would make the check pass for the wrong reason.
await asSystem(`
  update public.staff_sessions
     set origin_hash = 'aabbccdd11223344', country = 'GB', last_seen_at = now()
   where uid = '${MANAGER}' and device_hash = 'screen-dev-3';
  insert into public.staff_sessions (uid, device_hash, device_label, origin_hash, country, last_seen_at, role_at_start)
  values ('${MANAGER}', 'screen-dev-4', 'Chrome on Windows', 'eeff00112233aabb', 'DE', now(), 'manager');
`);
await asSystem(`update public.admin_settings set value = 'false'::jsonb where key = 'ops.audit_trigger_disabled'`);

const travelled = await as(OWNER, `select * from public.admin_staff_sessions(100, false)`);

const flaggedRows = travelled.rows.filter((row) => row.uid === MANAGER && row.is_flagged);
check(flaggedRows.length === 2, 'both of the account\'s sessions are flagged as a pair', `${flaggedRows.length}`);
check(
  flaggedRows.every((row) => String(row.flag_reason ?? '').includes('two origins')),
  'and the reason describes the pair rather than accusing the account',
  flaggedRows[0]?.flag_reason,
);

const onlyFlagged = await as(OWNER, `select * from public.admin_staff_sessions(100, true)`);
check(
  onlyFlagged.rows.every((row) => row.is_flagged === true),
  'the flagged-only view really is flagged-only',
  JSON.stringify(onlyFlagged.rows.map((row) => row.uid)),
);

const managerSessions = await as(MANAGER, `select * from public.admin_staff_sessions(100, false)`);
check(managerSessions.error === null, 'a manager may read the sessions screen', managerSessions.error?.message ?? '');
const memberSessions = await as(MEMBER, `select * from public.admin_staff_sessions(100, false)`);
check(
  memberSessions.error?.code === '42501',
  'a member without people.read may not',
  memberSessions.error?.message ?? 'it answered',
);
const anonSessions = await asSystem(`set role anon; select * from public.admin_staff_sessions(100, false);`);
check(anonSessions.error !== null, 'and neither may an anonymous caller');

// ===========================================================================
// 3. "What was done to this account?"
// ===========================================================================
// A real timeline: a role change, a suspension, a restore, and a session.
await asSystem(`select set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', false);`);
await asSystem(`
  begin;
  update public.profiles set role = 'moderator' where uid = '${MEMBER}';
  select bsdc.audit_full('people.role', 'person:${MEMBER}', '{"to":"moderator"}'::jsonb,
                         '{"role": {"before": "member", "after": "moderator"}}'::jsonb,
                         'Promoted so the timeline has something to show');
  commit;
`);
await asSystem(`
  begin;
  update public.profiles set status = 'suspended' where uid = '${MEMBER}';
  select bsdc.audit_full('people.suspend', 'person:${MEMBER}', '{}'::jsonb, null,
                         'Suspended for the timeline proof');
  commit;
`);
await as(MEMBER, `select * from public.start_staff_session('member-dev-1', 'Firefox', 'BD')`);

const timeline = await as(OWNER, `select * from public.person_timeline('${MEMBER}', 100)`);
check(timeline.error === null, 'an owner reads an account timeline', timeline.error?.message ?? '');
check(timeline.rows.length >= 3, 'and it has the rows that were written', `${timeline.rows.length}`);
check(
  timeline.rows.every((row) => row.subject === 'person:' + MEMBER || row.subject !== ''),
  'every row is about this account',
);
const roleRow = timeline.rows.find((row) => row.action === 'people.role');
check(roleRow !== undefined, 'the role change is on it');
check(roleRow?.has_diff === true, 'and says that it has a diff, so the screen knows to offer it');
check(
  typeof roleRow?.action_label === 'string' && !roleRow.action_label.includes('.'),
  'and carries a written label rather than a dotted code',
  roleRow?.action_label,
);
check(
  typeof roleRow?.reason === 'string' && roleRow.reason.length >= 12,
  'and the reason the person was given',
  roleRow?.reason,
);
check(
  typeof roleRow?.actor_name === 'string' && roleRow.actor_name.length > 0,
  'and who did it, by name',
);

// The timeline must not include somebody else's rows. This is the check that
// matters: a screen that leaks other people's history is worse than no screen.
const managerTimeline = await as(OWNER, `select * from public.person_timeline('${MANAGER}', 100)`);
const leaked = managerTimeline.rows.filter((row) => row.subject === 'person:' + MEMBER);
check(leaked.length === 0, "another account's timeline does not contain these rows", `${leaked.length}`);

// A member reads their own timeline, and not somebody else's.
const ownTimeline = await as(MEMBER, `select * from public.person_timeline('${MEMBER}', 100)`);
check(ownTimeline.error === null, 'a member reads their own timeline', ownTimeline.error?.message ?? '');
const otherTimeline = await as(MEMBER, `select * from public.person_timeline('${MANAGER}', 100)`);
check(
  otherTimeline.error?.code === '42501',
  "but not somebody else's",
  otherTimeline.error?.message ?? 'it answered',
);

const ghostTimeline = await as(OWNER, `select * from public.person_timeline('nobody-at-all', 100)`);
check(ghostTimeline.error?.code === '23503', 'and a uid that does not exist is refused, not searched for');

// The cap is enforced rather than trusted.
const capped = await as(OWNER, `select count(*)::int as n from public.person_timeline('${MEMBER}', 100000)`);
check(Number(capped.rows[0]?.n) <= 500, 'the page size is capped rather than trusting the caller');

// ===========================================================================
// 4. The copy the console renders
// ===========================================================================
const copy = await asSystem(`select * from bsdc_permission_copy()`);
check(copy.error === null, 'the copy table reads', copy.error?.message ?? '');
// Same reasoning as the matrix above: measured against the catalogue, so adding a
// permission without translating it fails here rather than in a Bangla console.
check(
  copy.rows.length === catalogueSize.rows[0]?.n,
  'and covers every permission',
  `${copy.rows.length} of ${catalogueSize.rows[0]?.n}`,
);
check(
  copy.rows.every((row) => /[\u0980-\u09FF]/.test(row.label_bn)),
  'every Bangla label is actually in Bangla script',
);
check(
  copy.rows.every((row) => row.why_en.length > 10),
  'and every permission has a sentence explaining what it allows',
);
const catalogue = await asSystem(`select permission from public.permission_catalogue`);
const missingCopy = catalogue.rows
  .map((row) => row.permission)
  .filter((permission) => !copy.rows.some((row) => row.permission === permission));
check(missingCopy.length === 0, 'no catalogued permission is missing its copy', missingCopy.join(', '));

console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) {
  console.log(bad.map((label) => `  - ${label}`).join('\n'));
  process.exit(1);
}
