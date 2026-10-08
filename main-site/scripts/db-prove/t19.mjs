/**
 * Proof for round 6, part 2: the internal `bsdc.*` helpers are no longer
 * executable by anonymous or member callers, and the features that legitimately
 * went through them still work.
 *
 * The failure case is the state before 0049: the same `has_function_privilege`
 * checks run against the database without 0049, and the same forgery attempt
 * succeeds.
 */
import { makeDb, expectFail, summary } from './lib.mjs';

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002';

const CLOSED = [
  'bsdc.notify(text,text,bsdc_notification_kind,uuid,uuid,text,uuid)',
  'bsdc.notification_allowed(text,bsdc_notification_kind)',
  'bsdc.require_permission(text)',
  'bsdc.direct_key(text,text)',
  'bsdc.group_role(uuid,text)',
  'bsdc.cart_for(text)',
  'bsdc.settle_order(uuid)',
  'bsdc.new_order_code()',
  'bsdc.new_certificate_code()',
  'bsdc.order_transition_allowed(bsdc_order_status,bsdc_order_status)',
  'bsdc.ad_event_cost(bsdc_ad_pricing,integer,bsdc_ad_event_kind)',
  'bsdc.ad_spend_today(uuid)',
  'bsdc.day_series(integer)',
  'bsdc.config_value_valid(bsdc_config_type,jsonb,numeric,numeric)',
  'bsdc.clip_text(text,integer)',
  'bsdc.check_theme_tokens(jsonb)',
  'bsdc.route_pattern(text)',
];

// Helpers that must keep working: policies, defaults and invoker callers name
// them, so a member session has to be able to execute them.
const KEPT = [
  'bsdc.current_uid()',
  'bsdc.is_staff()',
  'bsdc.actor_role()',
  'bsdc.has_permission(text)',
  'bsdc.can_read_post(text,bsdc_post_status,bsdc_visibility)',
  'bsdc.is_conversation_member(uuid,text)',
  'bsdc.is_group_member(uuid,text)',
  'bsdc.can_see_group(uuid,bsdc_group_privacy)',
  'bsdc.join_text(text[],text)',
  'bsdc.notify_follow()',
  'bsdc.notify_mention()',
];

let pass = 0;
const bad = [];
function ok(label) {
  pass += 1;
  console.log(`ok    ${label}`);
}
function fail(label, detail) {
  bad.push(label);
  console.log(`FAIL  ${label}  -> ${detail}`);
}

async function privilege(db, role, signature) {
  const { rows } = await db.query(
    `select has_function_privilege('${role}', '${signature}'::regprocedure, 'execute') as ok`,
  );
  return rows[0].ok;
}

// ---------------------------------------------------------------------------
// Before: the holes, on the database as it was
// ---------------------------------------------------------------------------
const before = await makeDb({ skip: ['0049_'] });
await before.exec(`
  insert into public.profiles (uid, display_name, username) values
    ('${ada}', 'Ada Lovelace', 'ada'), ('${rahim}', 'Rahim Uddin', 'rahim');
`);
const beforeOpen = [];
for (const sig of CLOSED) {
  if (await privilege(before, 'anon', sig)) beforeOpen.push(sig);
  else await before.query(`select '${sig}'`).catch(() => undefined);
}
console.log('--- BEFORE 0049 ---');
console.log(`helpers anon could execute: ${beforeOpen.length} of ${CLOSED.length}`);
for (const sig of beforeOpen) console.log('   open: ' + sig);
const forged = await (async () => {
  await before.exec(
    `set role anon; select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', false);`,
  );
  try {
    await before.query(
      `select bsdc.notify('${rahim}', null, 'follow', null, null, 'forged by a stranger', null)`,
    );
    return true;
  } catch {
    return false;
  } finally {
    await before.exec('reset role;');
  }
})();
const inbox = (
  await before.query(`select count(*)::int as n from public.notifications where uid = '${rahim}'`)
).rows[0].n;
console.log(`anonymous forgery succeeded: ${forged}; rows now in Rahim's inbox: ${inbox}`);
console.table(
  (await before.query(`select kind::text, body from public.notifications where uid = '${rahim}'`))
    .rows,
);
await before.close();

// ---------------------------------------------------------------------------
// After
// ---------------------------------------------------------------------------
const db = await makeDb();
await db.exec(`
  insert into public.profiles (uid, display_name, username) values
    ('${ada}', 'Ada Lovelace', 'ada'), ('${rahim}', 'Rahim Uddin', 'rahim');
`);

console.log('--- AFTER 0049 ---');
for (const sig of CLOSED) {
  const anon = await privilege(db, 'anon', sig);
  const member = await privilege(db, 'authenticated', sig);
  if (anon || member) {
    fail(`closed to callers: ${sig}`, `anon=${anon} authenticated=${member}`);
  } else {
    ok(`closed to callers: ${sig}`);
  }
}
for (const sig of KEPT) {
  const member = await privilege(db, 'authenticated', sig);
  const anon = await privilege(db, 'anon', sig);
  if (!member) fail(`still callable by a member: ${sig}`, 'authenticated lost the grant');
  else ok(`still callable: ${sig} (anon=${anon})`);
}

// The forgery no longer lands, and the inbox stays empty.
await expectFail(
  db,
  '',
  `select bsdc.notify('${rahim}', null, 'follow', null, null, 'forged', null)`,
  '42501',
  'anon cannot forge a notification',
);
await db.exec(
  `set role authenticated; select set_config('request.jwt.claims', '{"sub":"${ada}","role":"authenticated","bsdc_role":"member"}', false);`,
);
await expectFail(
  db,
  ada,
  `select bsdc.notify('${rahim}', null, 'follow', null, null, 'forged', null)`,
  '42501',
  'a member cannot forge a notification either',
);
await db.exec('reset role;');

// But the features that used the triggers still notify, because the triggers
// now run as the owner.
const notifCount = async () =>
  (await db.query(`select count(*)::int as n from public.notifications where uid = '${rahim}'`))
    .rows[0].n;
const kinds = async () =>
  (
    await db.query(
      `select kind::text as kind from public.notifications where uid='${rahim}' order by created_at`,
    )
  ).rows.map((r) => r.kind);

await db.exec(
  `set role authenticated; select set_config('request.jwt.claims', '{"sub":"${ada}","role":"authenticated","bsdc_role":"member"}', false);`,
);
await db.query(
  `insert into public.follows (follower_uid, followee_uid) values ('${ada}', '${rahim}')`,
);
await db.exec('reset role;');
if ((await notifCount()) === 1 && (await kinds())[0] === 'follow')
  ok('a follow still notifies the followee');
else fail('a follow still notifies the followee', JSON.stringify(await kinds()));

const pid = (
  await db.query(`
    insert into public.posts (author_uid, kind, slug, title, body, status, published_at, visibility)
    values ('${ada}', 'post', 'ada-post', 'Ada post', 'body', 'published', now(), 'public')
    returning id`)
).rows[0].id;
await db.exec(
  `set role authenticated; select set_config('request.jwt.claims', '{"sub":"${ada}","role":"authenticated","bsdc_role":"member"}', false);`,
);
await db.query(
  `insert into public.post_mentions (post_id, mentioned_uid) values ('${pid}', '${rahim}')`,
);
await db.exec('reset role;');
const after = await kinds();
if (after.includes('mention')) ok('a mention still notifies the mentioned member');
else fail('a mention still notifies the mentioned member', JSON.stringify(after));

// And a message, end to end, still arrives with the right kind.
const cid = (await db.query(`select public.open_direct_conversation('${rahim}') as id`)).rows[0].id;
await db.exec(
  `set role authenticated; select set_config('request.jwt.claims', '{"sub":"${ada}","role":"authenticated","bsdc_role":"member"}', false);`,
);
await db.query(`select public.send_message('${cid}', 'the realtime work starts now')`);
await db.exec('reset role;');
const messageRow = (
  await db.query(
    `select kind::text as kind from public.notifications where uid='${rahim}' and kind='message'`,
  )
).rows;
if (messageRow.length === 1) ok('a message still notifies, as a message');
else fail('a message still notifies, as a message', JSON.stringify(await kinds()));

await db.close();
const libFails = summary();
console.log(`t19 SUMMARY: ${pass} passed, ${bad.length + libFails} failed`);
for (const f of bad) console.log('  failed: ' + f);
process.exit(bad.length + libFails === 0 ? 0 : 1);
