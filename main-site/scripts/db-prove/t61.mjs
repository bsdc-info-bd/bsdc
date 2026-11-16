/**
 * Proof for 0090: per-device Web Push & FCM delivery receipts, partial failure
 * isolation across multiple devices, re-arm clearance on repeat notifications,
 * dead-device retirement finalization, push_content lookback window, and
 * trigger scoping strictly to INSERT / UPDATE OF seq.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeDb, MIGRATIONS_DIR } from './lib.mjs';

const M90 = join(MIGRATIONS_DIR, '0090_push_per_device_delivery_and_instant_dispatch.sql');

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002';
const secret = 'flush-secret-0123456789abcdefghijklmnopqrstuvwxyz';

const webA = 'https://push.example/device-a-0123456789abcdef';
const webB = 'https://push.example/device-b-0123456789abcdef';
const fcmA = 'fcm-token-device-a-0123456789abcdefghijklmnopqrstuvwxyz';
const fcmB = 'fcm-token-device-b-0123456789abcdefghijklmnopqrstuvwxyz';

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
  insert into bsdc.push_settings (name, value) values ('flush_secret', '${secret}')
    on conflict (name) do update set value = excluded.value;

  insert into public.profiles (uid, username, display_name, role, status) values
    ('${ada}',   'adafirst',    'Ada First',    'member', 'active'),
    ('${rahim}', 'rahimsecond', 'Rahim Second', 'member', 'active');
`);

async function as(uid, sql, params = []) {
  if (uid === null) {
    await db.exec(`set role anon; select set_config('request.jwt.claims', '{"role":"anon"}', false);`);
  } else {
    const claims = JSON.stringify({
      sub: uid,
      role: 'authenticated',
      bsdc_role: 'member',
      email_verified: true,
    });
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claims', $jwt$${claims}$jwt$, false);`,
    );
  }
  try {
    const res = await db.query(sql, params);
    return { rows: res.rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec('reset role;');
  }
}

// Register two Web Push subscriptions & two FCM tokens for Ada
await as(ada, `select public.register_push_subscription($1, 'k1', 'a1', 'Chrome', 'en')`, [webA]);
await as(ada, `select public.register_push_subscription($1, 'k2', 'a2', 'Firefox', 'bn')`, [webB]);
await as(ada, `select public.register_fcm_token($1, 'android', 'Phone', 'en')`, [fcmA]);
await as(ada, `select public.register_fcm_token($1, 'android', 'Tablet', 'bn')`, [fcmB]);

// Rahim opens a DM and sends message 1
const convId = (
  await as(rahim, `select public.open_direct_conversation($1) as id`, [ada])
).rows[0].id;
await as(rahim, `select public.send_message($1, 'First DM across 4 devices')`, [convId]);

const webPending1 = (
  await as(null, `select * from public.push_pending_devices($1, 200, 72)`, [secret])
).rows;
check(
  webPending1.length === 2,
  'both Web Push devices are pending before delivery',
  `got ${webPending1.length}`,
);
const nid = webPending1[0].notification_id;

// Partial delivery: webA succeeds, webB had transient 503
await as(
  null,
  `select public.push_mark_device_deliveries($1, $2::jsonb)`,
  [secret, JSON.stringify([{ id: nid, endpoint: webA }])],
);

const webPending2 = (
  await as(null, `select endpoint from public.push_pending_devices($1, 200, 72)`, [secret])
).rows;
check(
  webPending2.length === 1 && webPending2[0].endpoint === webB,
  'partial Web Push mark hides device A without dropping device B',
  JSON.stringify(webPending2),
);

const notifMid = (
  await db.query(`select pushed_at is null as still_open from public.notifications where id = '${nid}'`)
).rows[0];
check(notifMid.still_open === true, 'notifications.pushed_at remains null until device B receives it');

// Complete Web Push delivery on webB
await as(
  null,
  `select public.push_mark_device_deliveries($1, $2::jsonb)`,
  [secret, JSON.stringify([{ id: nid, endpoint: webB }])],
);
const webPending3 = (
  await as(null, `select * from public.push_pending_devices($1, 200, 72)`, [secret])
).rows;
const notifDone = (
  await db.query(`select pushed_at is not null as closed from public.notifications where id = '${nid}'`)
).rows[0];
check(webPending3.length === 0 && notifDone.closed === true, 'completing webB finalizes pushed_at');

// Partial FCM delivery: fcmA succeeds, fcmB fails transiently
const fcmPending1 = (
  await as(null, `select * from public.fcm_pending_devices($1, 200, 72)`, [secret])
).rows;
check(fcmPending1.length === 2, 'both FCM devices are pending initially');

await as(
  null,
  `select public.fcm_mark_device_deliveries($1, $2::jsonb)`,
  [secret, JSON.stringify([{ id: nid, token: fcmA }])],
);

const fcmPending2 = (
  await as(null, `select token from public.fcm_pending_devices($1, 200, 72)`, [secret])
).rows;
check(
  fcmPending2.length === 1 && fcmPending2[0].token === fcmB,
  'partial FCM mark hides phone A without dropping tablet B',
);

// Re-arming via second DM clears per-device receipts so ALL 4 devices get notified again
await as(rahim, `select public.send_message($1, 'Second DM re-arms all devices')`, [convId]);

const webRearmed = (
  await as(null, `select endpoint from public.push_pending_devices($1, 200, 72)`, [secret])
).rows;
const fcmRearmed = (
  await as(null, `select token from public.fcm_pending_devices($1, 200, 72)`, [secret])
).rows;
check(
  webRearmed.length === 2 && fcmRearmed.length === 2,
  're-arming notification clears per-device marks so all devices get message 2',
  `web=${webRearmed.length} fcm=${fcmRearmed.length}`,
);

// Partial delivery to fcmA, then retiring dead fcmB finalizes fcm_pushed_at
await as(
  null,
  `select public.fcm_mark_device_deliveries($1, $2::jsonb)`,
  [secret, JSON.stringify([{ id: nid, token: fcmA }])],
);
await as(null, `select public.fcm_kill_device($1, $2)`, [secret, fcmB]);
const fcmFinal = (
  await db.query(`select fcm_pushed_at is not null as closed from public.notifications where id = '${nid}'`)
).rows[0];
check(fcmFinal.closed === true, 'retiring remaining dead FCM device finalizes fcm_pushed_at');

// push_content returns unread row even if last_used_at equals created_at, and dedupes on immediate repeat
await db.exec(`update public.push_subscriptions set last_used_at = (select created_at from public.notifications where id = '${nid}') where endpoint = '${webA}'`);
const contentRows = (
  await as(null, `select id from public.push_content($1, 5)`, [webA])
).rows;
check(
  contentRows.some((r) => r.id === nid),
  'push_content includes unread row on exact timestamp match',
);
const contentRepeat = (
  await as(null, `select id from public.push_content($1, 5)`, [webA])
).rows;
check(
  contentRepeat.length === 0,
  'calling push_content immediately a second time yields 0 duplicate rows',
);

// Retiring remaining dead Web Push device finalizes pushed_at too
await as(rahim, `select public.send_message($1, 'Third DM to test web kill finalize')`, [convId]);
const webPending4 = (
  await as(null, `select * from public.push_pending_devices($1, 200, 72)`, [secret])
).rows;
check(webPending4.length === 2, 'third DM queues both Web Push devices');
await as(
  null,
  `select public.push_mark_device_deliveries($1, $2::jsonb)`,
  [secret, JSON.stringify([{ id: nid, endpoint: webA }])],
);
await as(null, `select public.push_kill_device($1, $2)`, [secret, webB]);
const webFinal = (
  await db.query(`select pushed_at is not null as closed from public.notifications where id = '${nid}'`)
).rows[0];
check(webFinal.closed === true, 'retiring remaining dead Web Push device finalizes pushed_at');

// Strangers cannot execute per-device mark functions with a bad secret or reach internal tables
const badMark = await as(null, `select public.fcm_mark_device_deliveries('wrong', '[]'::jsonb)`);
check(badMark.error !== null, 'fcm_mark_device_deliveries rejects wrong secret');

const badWebMark = await as(null, `select public.push_mark_device_deliveries('wrong', '[]'::jsonb)`);
check(badWebMark.error !== null, 'push_mark_device_deliveries rejects wrong secret');

for (const signature of [
  'public.push_mark_device_deliveries(text, jsonb)',
  'public.fcm_mark_device_deliveries(text, jsonb)',
]) {
  const pubGrant = (
    await db.query(`select has_function_privilege('public', '${signature}', 'execute') as pub_can`)
  ).rows[0];
  check(pubGrant.pub_can === false, `${signature} revokes execute from public`);
}

const directReceipt = await as(ada, `select * from bsdc.fcm_device_deliveries`);
check(directReceipt.error !== null, 'authenticated member cannot read internal delivery table');

// Trigger notifications_instant_push fires ONLY on INSERT or UPDATE OF seq
const trigDef = (
  await db.query(
    `select pg_get_triggerdef(oid) as def from pg_trigger where tgname = 'notifications_instant_push'`,
  )
).rows[0]?.def ?? '';
check(
  /INSERT OR UPDATE OF seq ON public\.notifications/i.test(trigDef),
  'notifications_instant_push trigger fires only on INSERT or UPDATE OF seq',
  trigDef,
);

// Idempotent re-apply
await db.exec('begin;');
try {
  await db.exec(await readFile(M90, 'utf8'));
  await db.exec('commit;');
  check(true, '0090 applies twice cleanly');
} catch (error) {
  await db.exec('rollback;');
  check(false, '0090 applies twice cleanly', error.message);
}

await db.close();
console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) process.exit(1);
