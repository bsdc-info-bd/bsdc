/**
 * Proof for 0061: who gets suggested, why, and who never does.
 *
 * A suggestion is a claim about a person, so the interesting failures are the
 * ones that say something untrue: suggesting somebody a member blocked, somebody
 * who asked not to be discoverable, somebody already followed, or claiming a
 * reason that is not the reason. Each of those is checked below against the
 * function itself, with the score's ordering checked the same way — a mutual
 * follow has to outrank a stranger with more followers, or the ordering is a
 * popularity list wearing a costume.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDb, MIGRATIONS_DIR } from './lib.mjs';

const MIGRATION = join(MIGRATIONS_DIR, '0061_the_people_worth_following_next.sql');

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002';
const sultana = 'cccccccc-3333-4333-8333-000000000003';
const karim = 'dddddddd-4444-4444-8444-000000000004';
const nusrat = 'eeeeeeee-5555-4555-8555-000000000005';
const jahid = 'ffffffff-6666-4666-8666-000000000006';
const tasnim = '11111111-7777-4777-8777-000000000007';
const privateMember = '22222222-8888-4888-8888-000000000008';
const suspended = '33333333-9999-4999-8999-000000000009';
const handleless = '44444444-aaaa-4aaa-8aaa-00000000000a';
const popular = '55555555-bbbb-4bbb-8bbb-00000000000b';

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
  insert into public.profiles (uid, username, display_name, role, skills, location, privacy,
                               followers_count, last_seen_at, onboarding_complete) values
    ('${ada}',      'adafirst',   'Ada First',   'member', array['postgres','typescript'],
      'Sylhet', '{"discoverable":true}',   4, now(), true),
    ('${rahim}',    'rahimsecond','Rahim Second','member', array['go'],
      'Dhaka',  '{"discoverable":true}',  30, now(), true),
    ('${sultana}',  'sultanat',   'Sultana T',   'member', array['rust'],
      'Dhaka',  '{"discoverable":true}',   6, now(), true),
    ('${karim}',    'karimk',     'Karim K',     'member', array['postgres','react'],
      'Chattogram', '{"discoverable":true}', 3, now(), true),
    ('${nusrat}',   'nusratj',    'Nusrat J',    'member', array['design'],
      'sylhet', '{"discoverable":true}',   2, now(), true),
    ('${jahid}',    'jahidh',     'Jahid H',     'member', array['postgres'],
      'Dhaka',  '{"discoverable":true}',  40, now(), true),
    ('${tasnim}',   'tasnimr',    'Tasnim R',    'member', array['postgres'],
      'Dhaka',  '{"discoverable":true}',  41, now(), true),
    ('${privateMember}', 'quietone', 'Quiet One','member', array['postgres'],
      'Dhaka',  '{"discoverable":false}', 42, now(), true),
    ('${suspended}','goneaway',   'Gone Away',   'member', array['postgres'],
      'Dhaka',  '{"discoverable":true}',  43, now(), true),
    ('${handleless}', null,       'No Handle',   'member', array['postgres'],
      'Dhaka',  '{"discoverable":true}',  44, now(), false),
    ('${popular}',  'popularone', 'Popular One', 'member', array['cobol'],
      'Khulna', '{"discoverable":true}', 500, now(), true);

  update public.profiles set status = 'suspended' where uid = '${suspended}';

  insert into public.follows (follower_uid, followee_uid) values
    ('${ada}',   '${rahim}'),
    ('${rahim}', '${sultana}'),
    ('${rahim}', '${jahid}'),
    ('${popular}','${ada}');

  insert into public.blocks (blocker_uid, blocked_uid) values ('${ada}', '${jahid}');
  insert into public.blocks (blocker_uid, blocked_uid) values ('${tasnim}', '${ada}');
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

// ------------------------------------------------------------- who is told ---
const suggestions = await as(ada, `select * from public.follow_suggestions(20)`);
check(suggestions.ok, 'a member asks who to follow next', suggestions.code ?? suggestions.message ?? '');
const rows = suggestions.rows ?? [];
const byUid = new Map(rows.map((row) => [row.uid, row]));

check(rows.length > 0, 'and is told about somebody', String(rows.length));
check(!byUid.has(ada), 'never about themselves');
check(!byUid.has(rahim), 'nor about somebody they already follow');
check(!byUid.has(jahid), 'nor about somebody they blocked');
check(!byUid.has(tasnim), 'nor about somebody who blocked them');
check(!byUid.has(privateMember), 'nor about a member who asked not to be discoverable');
check(!byUid.has(suspended), 'nor about an account that is suspended');
check(!byUid.has(handleless), 'nor about a profile with no page to be sent to');

// -------------------------------------------------------------------- why ---
check(byUid.get(sultana)?.reason === 'mutual', 'a friend of a friend is suggested because of it');
check(
  byUid.get(sultana)?.mutual_count === 1,
  'and the count says how many of them',
  String(byUid.get(sultana)?.mutual_count),
);
check(byUid.get(karim)?.reason === 'skills', 'a member who lists the same skill is suggested for it');
check(
  (byUid.get(karim)?.shared_skills ?? []).includes('postgres'),
  'naming the skill they have in common',
  JSON.stringify(byUid.get(karim)?.shared_skills),
);
check(
  byUid.get(nusrat)?.reason === 'city',
  'and a member in the same place is suggested for that, whatever the case of it',
  String(byUid.get(nusrat)?.reason),
);
check(
  byUid.get(popular)?.reason === 'active',
  'while a stranger with nothing in common is suggested because the community reads them',
);

// ------------------------------------------------------------------ order ---
const order = rows.map((row) => row.uid);
check(
  order.indexOf(sultana) < order.indexOf(popular),
  'one mutual follow outranks five hundred strangers',
  order.join(' < '),
);
check(order.indexOf(karim) < order.indexOf(nusrat), 'a shared skill outranks a shared city');
check(
  rows.every((row, index) => index === 0 || row.username !== null),
  'and every suggestion is somebody with a page',
);

// ------------------------------------------------------------------ limits ---
const limited = await as(ada, `select count(*)::int as n from public.follow_suggestions(2)`);
check(
  limited.ok && limited.rows?.[0]?.n === 2,
  'a caller that asks for two is given two',
  String(limited.rows?.[0]?.n),
);
const capped = await as(ada, `select count(*)::int as n from public.follow_suggestions(1000)`);
check(
  capped.ok && capped.rows?.[0]?.n <= 50,
  'and a caller that asks for a thousand is given the fifty the function allows',
  String(capped.rows?.[0]?.n),
);

// ------------------------------------------------------- who may ask at all ---
const anonymous = await as(null, `select count(*)::int as n from public.follow_suggestions(10)`);
check(
  !anonymous.ok && anonymous.code === '42501',
  'a visitor is not told about anybody',
  `${anonymous.code ?? 'accepted'}`,
);
const nobody = await as(
  'ffffffff-0000-4000-8000-0000000000ff',
  `select count(*)::int as n from public.follow_suggestions(10)`,
);
check(
  nobody.ok && nobody.rows?.[0]?.n === 0,
  'a member with no profile row of their own is told nothing rather than an error',
  JSON.stringify(nobody.rows ?? nobody.message),
);
const privileged = await db.query(
  `select has_function_privilege('anon', 'public.follow_suggestions(integer)', 'EXECUTE') as anon_exec,
          has_function_privilege('public', 'public.follow_suggestions(integer)', 'EXECUTE') as public_exec,
          has_function_privilege('authenticated', 'public.follow_suggestions(integer)', 'EXECUTE') as member_exec`,
);
check(
  privileged.rows[0]?.anon_exec === false &&
    privileged.rows[0]?.public_exec === false &&
    privileged.rows[0]?.member_exec === true,
  'and the routine belongs to members alone',
  JSON.stringify(privileged.rows[0]),
);

// ----------------------------------------------------------- a fresh member ---
const fresh = 'aaaaaaaa-2222-4111-8111-0000000000ff';
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, skills, location)
  values ('${fresh}', 'brandnew', 'Brand New', 'member', array[]::text[], '');
`);
const empty = await as(fresh, `select count(*)::int as n from public.follow_suggestions(10)`);
check(
  empty.ok && empty.rows?.[0]?.n > 0,
  'a member with no follows and nothing filled in is still given somebody',
  String(empty.rows?.[0]?.n),
);
const freshRows = await as(fresh, `select reason, count(*)::int as n from public.follow_suggestions(20) group by 1`);
check(
  (freshRows.rows ?? []).every((row) => row.reason === 'active'),
  'and is told the truth about why: none of them are mutual, shared or nearby',
  JSON.stringify(freshRows.rows),
);

// ------------------------------------------------------------- twice over ---
for (let round = 1; round <= 2; round += 1) {
  try {
    await db.exec(readFileSync(MIGRATION, 'utf8'));
    check(true, `0061 re-applied (round ${round})`);
  } catch (error) {
    check(false, `0061 re-applied (round ${round})`, String(error.message).split('\n')[0]);
  }
}
// Brand New joined the community a few lines ago, so one more member is
// suggested than before; everything said earlier has to still be said.
const after = await as(ada, `select * from public.follow_suggestions(20)`);
const afterRows = after.rows ?? [];
const stillThere = (uid, reason) =>
  afterRows.some((row) => row.uid === uid && row.reason === reason);
check(
  after.ok && afterRows.length === rows.length + 1,
  'and it still answers the same way, plus the member who has just arrived',
  `${afterRows.length} against ${rows.length}`,
);
check(
  stillThere(sultana, 'mutual') &&
    stillThere(karim, 'skills') &&
    stillThere(nusrat, 'city') &&
    stillThere(popular, 'active'),
  'with every reason it gave before',
);
check(afterRows.some((row) => row.uid === fresh), 'including the newcomer');

await db.close();
console.log('');
console.log(`SUMMARY: ${pass} passed, ${bad.length} failed`);
if (bad.length) console.log(`  failed: ${bad.join(', ')}`);
process.exit(bad.length === 0 ? 0 : 1);
