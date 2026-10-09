/**
 * Proof for 0062: changing a handle is not claiming one.
 *
 * The interesting failures here are the ones a member would notice later rather
 * than now: a link they shared a year ago that stops working, a handle they let
 * go of that sends its old visitors to somebody else, and a rule about waiting
 * that either does not apply to the first claim or can be walked around by asking
 * for the handle you already have. Each is checked below, through the same
 * `follow_redirect` the edge answers from, so the redirect is proved as the thing
 * that actually serves a request rather than as a row in a table.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDb, MIGRATIONS_DIR } from './lib.mjs';

const MIGRATION = join(MIGRATIONS_DIR, '0062_changing_a_handle_is_not_claiming_one.sql');

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002';

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
await db.exec(`
  insert into public.profiles (uid, display_name, role) values
    ('${ada}',   'Ada First',   'member'),
    ('${rahim}', 'Rahim Second', 'member');
  -- 'admin' is already reserved by the schema's own seed, which is the point:
  -- the reserved list is not this migration's to fill.
`);

async function as(sub, sql) {
  const payload =
    sub === null
      ? JSON.stringify({ role: 'anon' })
      : JSON.stringify({
          sub,
          role: 'authenticated',
          bsdc_role: 'member',
          email: `${sub.slice(0, 8)}@bsdc.info.bd`,
          email_verified: true,
        });
  try {
    await db.exec(
      `set role ${sub === null ? 'anon' : 'authenticated'}; ` +
        `select set_config('request.jwt.claims', $jwt$${payload}$jwt$, false);`,
    );
    return { ok: true, rows: (await db.query(sql)).rows };
  } catch (error) {
    return { ok: false, code: error.code, message: String(error.message).split('\n')[0] };
  } finally {
    await db.exec('reset role;');
  }
}

function messageOf(result) {
  return result.message ?? '';
}

// ------------------------------------------------------------- the first one ---
check(
  (await as(ada, `select public.next_username_change() as next`)).rows?.[0]?.next === null,
  'a member with no handle is not waiting for anything',
);

const claimed = await as(ada, `select username from public.claim_username('adafirst')`);
check(claimed.ok, 'a member arriving takes a handle at once', claimed.code ?? messageOf(claimed));
check(claimed.rows?.[0]?.username === 'adafirst', 'and it is the one they asked for');

const stamped = await db.query(
  `select username_changed_at is not null as stamped from public.profiles where uid = '${ada}'`,
);
check(stamped.rows[0]?.stamped === true, 'the moment is recorded, so the next change waits');

const noRedirect = await db.query(`select count(*)::int as n from public.redirects`);
check(noRedirect.rows[0]?.n === 0, 'and a first claim redirects nothing, because nothing pointed at it');

const claimAudit = await db.query(
  `select action, metadata->>'from' as from_handle, metadata->>'to' as to_handle
     from public.audit_log where actor_uid = '${ada}' order by id desc limit 1`,
);
check(
  claimAudit.rows[0]?.action === 'people.username.claim' &&
    claimAudit.rows[0]?.from_handle === null &&
    claimAudit.rows[0]?.to_handle === 'adafirst',
  'and the audit log says a handle was claimed, not changed',
  JSON.stringify(claimAudit.rows[0]),
);

const waiting = await as(ada, `select public.next_username_change() as next`);
const waitUntil = waiting.rows?.[0]?.next;
const daysAway =
  waitUntil instanceof Date ? (waitUntil.getTime() - Date.now()) / 86_400_000 : Number.NaN;
check(
  daysAway > 29 && daysAway <= 30,
  'a member who has just taken a handle is told to come back in thirty days',
  String(waitUntil),
);

// ---------------------------------------------------------------- the rules ---
const same = await as(ada, `select username from public.claim_username('adafirst')`);
check(
  same.ok && same.rows?.[0]?.username === 'adafirst',
  'asking for the handle they already have is answered, not refused',
  same.code ?? messageOf(same),
);
const afterSame = await db.query(
  `select count(*)::int as n from public.audit_log where actor_uid = '${ada}'`,
);
check(afterSame.rows[0]?.n === 1, 'and is not written to the audit log as a change');

const tooSoon = await as(ada, `select public.claim_username('adanew')`);
check(
  !tooSoon.ok &&
    tooSoon.code === '22023' &&
    messageOf(tooSoon).includes('profile/username-cooldown'),
  'changing it again the same day is refused with the reason named',
  `${tooSoon.code ?? 'accepted'} ${messageOf(tooSoon)}`,
);

const short = await as(rahim, `select public.claim_username('ab')`);
check(
  !short.ok && short.code === '22023' && messageOf(short).includes('profile/username-invalid'),
  'two characters is still not a handle',
  `${short.code ?? 'accepted'} ${messageOf(short)}`,
);
const leading = await as(rahim, `select public.claim_username('_rahim')`);
check(
  !leading.ok && messageOf(leading).includes('profile/username-invalid'),
  'and neither is one that starts with an underscore',
  messageOf(leading),
);
const reserved = await as(rahim, `select public.claim_username('admin')`);
check(
  !reserved.ok && messageOf(reserved).includes('profile/username-reserved'),
  'a reserved word is still reserved',
  messageOf(reserved),
);

await as(rahim, `select public.claim_username('rahimsecond')`);
const taken = await as(ada, `select public.claim_username('rahimsecond')`);
check(
  !taken.ok && taken.code === '23505' && messageOf(taken).includes('profile/username-taken'),
  'and somebody else\u2019s handle is still somebody else\u2019s',
  `${taken.code ?? 'accepted'} ${messageOf(taken)}`,
);

// ------------------------------------------------------------- the change ---
// Thirty-one days later.
await db.exec(`update public.profiles set username_changed_at = now() - interval '31 days' where uid = '${ada}'`);
check(
  (await as(ada, `select public.next_username_change() as next`)).rows?.[0]?.next === null,
  'once the wait is over, the member is told there is nothing to wait for',
);

const changed = await as(ada, `select username from public.claim_username('adabuilds')`);
check(changed.ok, 'the change goes through', changed.code ?? messageOf(changed));
check(changed.rows?.[0]?.username === 'adabuilds', 'and the handle is the new one');

const redirect = await db.query(
  `select from_path, to_path, status, is_enabled from public.redirects`,
);
check(
  redirect.rows.length === 1 &&
    redirect.rows[0].from_path === '/@adafirst' &&
    redirect.rows[0].to_path === '/@adabuilds' &&
    redirect.rows[0].status === 301 &&
    redirect.rows[0].is_enabled === true,
  'the old address is written down as a permanent move to the new one',
  JSON.stringify(redirect.rows),
);

const followed = await as(null, `select * from public.follow_redirect('/@adafirst')`);
check(
  followed.ok &&
    (followed.rows?.[0]?.target === '/@adabuilds' || followed.rows?.[0]?.to_path === '/@adabuilds'),
  'and the edge function that answers a moved URL serves it',
  JSON.stringify(followed.rows ?? followed.message),
);

const changeAudit = await db.query(
  `select action, metadata->>'from' as from_handle, metadata->>'to' as to_handle
     from public.audit_log where actor_uid = '${ada}' order by id desc limit 1`,
);
check(
  changeAudit.rows[0]?.action === 'people.username.change' &&
    changeAudit.rows[0]?.from_handle === 'adafirst' &&
    changeAudit.rows[0]?.to_handle === 'adabuilds',
  'with both halves of the change in the audit log',
  JSON.stringify(changeAudit.rows[0]),
);

const cooling = await as(ada, `select public.claim_username('adafirst')`);
check(
  !cooling.ok && messageOf(cooling).includes('profile/username-cooldown'),
  'and changing straight back is another change, not an undo',
  messageOf(cooling),
);

// --------------------------------------------------- a handle that is freed ---
await db.exec(`update public.profiles set username_changed_at = now() - interval '31 days' where uid = '${rahim}'`);
const tookOld = await as(rahim, `select username from public.claim_username('adafirst')`);
check(
  tookOld.ok && tookOld.rows?.[0]?.username === 'adafirst',
  'a handle nobody holds can be taken by somebody else',
  tookOld.code ?? messageOf(tookOld),
);
const afterTakeover = await db.query(`select from_path, to_path from public.redirects`);
const rowsNow = afterTakeover.rows ?? [];
check(
  !rowsNow.some((row) => row.from_path === '/@adafirst'),
  'and the redirect pointing at the freed handle is taken down, because it is a live page again',
  JSON.stringify(rowsNow),
);
// Rahim did not claim a handle here, he changed his, so his own old address is
// still a move — and it now points at the handle he is holding.
check(
  rowsNow.some((row) => row.from_path === '/@rahimsecond' && row.to_path === '/@adafirst'),
  'while the address Rahim let go of still leads to where he went',
  JSON.stringify(rowsNow),
);

// A member who changes back and forth does not leave two redirects pointing at
// each other: the deletion happens before the insertion.
await db.exec(`update public.profiles set username_changed_at = now() - interval '31 days' where uid = '${ada}'`);
await db.exec(`update public.profiles set username_changed_at = now() - interval '31 days' where uid = '${rahim}'`);
await as(rahim, `select public.claim_username('rahimsecond')`);
const back = await as(ada, `select username from public.claim_username('adafirst')`);
check(back.ok, 'and a member can take back a handle that has been let go', back.code ?? messageOf(back));
const chain = await db.query(`select from_path, to_path from public.redirects order by from_path`);
check(
  chain.rows.every((row) => row.from_path !== row.to_path) &&
    !chain.rows.some(
      (row) => chain.rows.some((other) => other.from_path === row.to_path && other.to_path === row.from_path),
    ),
  'without leaving two redirects pointing at each other',
  JSON.stringify(chain.rows),
);

// --------------------------------------------------------------- nobody else ---
const anonymous = await as(null, `select public.claim_username('whoever')`);
check(!anonymous.ok, 'a visitor cannot take a handle', anonymous.code ?? 'accepted');
const privileged = await db.query(
  `select has_function_privilege('anon', 'public.claim_username(citext)', 'EXECUTE') as anon_claim,
          has_function_privilege('anon', 'public.next_username_change()', 'EXECUTE') as anon_next,
          has_function_privilege('authenticated', 'public.next_username_change()', 'EXECUTE') as member_next`,
);
// `claim_username` stays callable by the anonymous role, as it has been since
// 0002: onboarding claims a handle in the same request that creates the profile.
// What it refuses, as shown above, is anybody whose token holds no member.
check(
  privileged.rows[0]?.anon_next === false && privileged.rows[0]?.member_next === true,
  'and when a member may change their handle is a question only a member can ask',
  JSON.stringify(privileged.rows[0]),
);

// ------------------------------------------------------------- twice over ---
for (let round = 1; round <= 2; round += 1) {
  try {
    await db.exec(readFileSync(MIGRATION, 'utf8'));
    check(true, `0062 re-applied (round ${round})`);
  } catch (error) {
    check(false, `0062 re-applied (round ${round})`, String(error.message).split('\n')[0]);
  }
}
const stillThere = await db.query(
  `select username from public.profiles where uid = '${ada}'`,
);
check(stillThere.rows[0]?.username === 'adafirst', 'and the handle that was taken back is still held');

await db.close();
console.log('');
console.log(`SUMMARY: ${pass} passed, ${bad.length} failed`);
if (bad.length) console.log(`  failed: ${bad.join(', ')}`);
process.exit(bad.length === 0 ? 0 : 1);
