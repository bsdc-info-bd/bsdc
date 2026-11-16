// 0102: the event calendar returns each event's own time zone and keeps its grants.
import { makeDb } from './lib.mjs';

let pass = 0;
const bad = [];
function check(condition, label, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`ok    ${label}`);
  } else {
    bad.push(label);
    console.log(`FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

const db = await makeDb();
const host = 'cal-zone-host';
const reader = 'cal-zone-reader';

await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${host}', 'cal_zone_host', 'Calendar Host', 'member', 'active'),
    ('${reader}', 'cal_zone_reader', 'Calendar Reader', 'member', 'active');
  insert into public.events (slug, title, description, mode, venue, city, join_url, cover_url,
     starts_at, ends_at, timezone, capacity, host_uid)
  values ('dhaka-zone-check-q9w8e7', 'Dhaka zone check', '', 'in_person', 'Hall', 'Dhaka', '', '',
     now() + interval '2 days', now() + interval '2 days 2 hours', 'Asia/Dhaka', null, '${host}');
`);

async function run(sql, uid) {
  const claims = uid ? JSON.stringify({ sub: uid, role: 'authenticated' }) : '{}';
  const role = uid ? 'authenticated' : 'anon';
  await db.exec(
    `set role ${role}; select set_config('request.jwt.claims', $jwt$${claims}$jwt$, false);`,
  );
  try {
    const result = await db.query(sql);
    return { rows: result.rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec('reset role');
  }
}

const asMember = await run(
  `select slug, timezone from public.event_calendar(100) where slug = 'dhaka-zone-check-q9w8e7'`,
  reader,
);
check(!asMember.error, 'a member can read the calendar', asMember.error?.message ?? '');
check(
  asMember.rows[0]?.timezone === 'Asia/Dhaka',
  'the calendar returns the event time zone',
  JSON.stringify(asMember.rows[0] ?? null),
);

const asGuest = await run(`select count(*)::int as n from public.event_calendar(100)`, null);
check(
  !asGuest.error && asGuest.rows[0]?.n >= 1,
  'a guest can read the public calendar',
  asGuest.error?.message ?? '',
);

const priv = await db.query(
  `select has_function_privilege('public', 'public.event_calendar(integer)', 'execute') as p,
          has_function_privilege('anon', 'public.event_calendar(integer)', 'execute') as a,
          has_function_privilege('authenticated', 'public.event_calendar(integer)', 'execute') as u`,
);
check(priv.rows[0]?.p === false, 'PUBLIC has no execute on the calendar');
check(
  priv.rows[0]?.a === true && priv.rows[0]?.u === true,
  'anon and authenticated can execute it',
);

console.log(`\n${pass} checks passed, ${bad.length} failed`);
if (bad.length > 0) process.exit(1);
