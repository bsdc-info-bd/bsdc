/**
 * Proof for the avatar and profile-row half of report #1: a saved picture is
 * a row column that stays where it was written, a member may write their own
 * row and nobody else's, and a row whose handle has not been claimed yet is
 * still a readable row — which is the condition the client used to fail on,
 * making a picture that was safely in the database look lost.
 */
import { makeDb, as, summary } from './lib.mjs';

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002';

let pass = 0;
const bad = [];
async function check(db, sql, expected, label, params) {
  try {
    const result = params ? await db.query(sql, params) : await db.query(sql);
    const got = result.rows[0] ? Object.values(result.rows[0])[0] : undefined;
    if (String(got) === String(expected)) {
      pass += 1;
      console.log(`ok    ${label}`);
    } else {
      bad.push(label);
      console.log(
        `FAIL  ${label}  -> got ${JSON.stringify(got)}, wanted ${JSON.stringify(expected)}`,
      );
    }
  } catch (e) {
    bad.push(label);
    console.log(`FAIL  ${label}  -> [${e.code ?? '?'}] ${String(e.message).split('\n')[0]}`);
  }
}

async function checkAs(db, uid, sql, expected, label) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claims', ` +
      `'{"sub":"${uid}","role":"authenticated","bsdc_role":"member"}', false);`,
  );
  try {
    const result = await db.query(sql);
    const got = result.rows[0] ? Object.values(result.rows[0])[0] : undefined;
    if (String(got) === String(expected)) {
      pass += 1;
      console.log(`ok    ${label}`);
    } else {
      bad.push(label);
      console.log(
        `FAIL  ${label}  -> got ${JSON.stringify(got)}, wanted ${JSON.stringify(expected)}`,
      );
    }
  } catch (e) {
    bad.push(label);
    console.log(`FAIL  ${label}  -> [${e.code ?? '?'}] ${String(e.message).split('\n')[0]}`);
  } finally {
    await db.exec('reset role;');
  }
}

const db = await makeDb();

// The first sign-in: a bare bootstrap row, created by the app's own upsert.
await db.exec(`
  insert into public.profiles (uid, username, display_name) values
    ('${ada}', null, 'Ada Lovelace');
`);
await check(
  db,
  `select count(*)::int from public.profiles where uid = '${ada}' and username is null`,
  1,
  'a member can exist before choosing a handle',
);

// The member's own read: the row the client used to reject.
await checkAs(
  db,
  ada,
  `select display_name from public.profiles where uid = '${ada}' and username is null`,
  'Ada Lovelace',
  'the owner reads their own row with no handle yet',
);

// Reading a row without a handle is not a privilege of the owner alone: the
// row is public data because the account is active.
await checkAs(
  db,
  rahim,
  `select count(*)::int from public.profiles where uid = '${ada}'`,
  1,
  'another member reads that row too, because the account is active',
);

// Claiming the handle during onboarding.
await as(
  db,
  ada,
  `select public.claim_username('ada') is not null as claimed`,
  'ada claims her handle',
);
await check(
  db,
  `select username from public.profiles where uid = '${ada}'`,
  'ada',
  'the handle is on the row that already existed',
);

// Saving a picture: the column grant allows it, the write lands, the value
// survives a fresh read — which is what the next sign-in performs.
const avatar = 'https://res.cloudinary.com/bsdc/image/upload/v1/avatars/ada.jpg';
await check(
  db,
  `select has_column_privilege('authenticated', 'public.profiles', 'avatar_url', 'update')`,
  true,
  'authenticated members hold update on avatar_url',
);
await as(
  db,
  ada,
  `update public.profiles set avatar_url = '${avatar}' where uid = '${ada}'`,
  'ada saves her picture',
);
await checkAs(
  db,
  ada,
  `select avatar_url from public.profiles where uid = '${ada}'`,
  avatar,
  'the picture is what the next sign-in reads back',
);

// The write-proof the client now performs: an update that matches no row is
// zero rows, not an error, and a request for the changed rows shows it.
await check(
  db,
  `with written as (
     update public.profiles set avatar_url = 'https://cdn.example.com/x.jpg'
     where uid = '${ada}' and uid = 'nobody'
     returning uid
   ) select count(*)::int from written`,
  0,
  'a write that matches no row reports zero rows, not an error',
);
await check(
  db,
  `select avatar_url from public.profiles where uid = '${ada}'`,
  avatar,
  'and it changed nothing',
);

// Nobody else's picture.
await as(
  db,
  rahim,
  `insert into public.profiles (uid, display_name) values ('${rahim}', 'Rahim Uddin')`,
  'rahim gets a row',
);
await as(
  db,
  ada,
  `update public.profiles set avatar_url = 'https://cdn.example.com/stolen.jpg' where uid = '${rahim}'`,
  'ada tries to overwrite his picture',
);
await check(
  db,
  `select avatar_url from public.profiles where uid = '${rahim}'`,
  '',
  'his picture is untouched',
);
await checkAs(
  db,
  ada,
  `select count(*)::int from public.profiles where uid = '${rahim}' and avatar_url <> ''`,
  0,
  'and a filtered update would not have been able to write it either',
);

// Anonymous callers hold no write grant at all.
try {
  await db.exec(
    `set role anon; select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', false);`,
  );
  await db.query(`update public.profiles set avatar_url = 'x' where uid = '${ada}'`);
  bad.push('anonymous cannot write a profile row');
  console.log('FAIL  anonymous cannot write a profile row  -> the statement succeeded');
} catch {
  console.log('ok    anonymous cannot write a profile row  (42501)');
} finally {
  await db.exec('reset role;');
}

console.log('');
const libFails = summary();
console.log(`t22 checks: ${pass} passed, ${bad.length + libFails} failed`);
process.exit(bad.length + libFails === 0 ? 0 : 1);
