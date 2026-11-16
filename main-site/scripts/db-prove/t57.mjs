/**
 * Proof for 0085: push re-wake on conflict, follower post alerts, feed_new_count
 * privacy, and FCM token registration/delivery RPCs.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeDb, MIGRATIONS_DIR } from './lib.mjs';

const MIGRATION = join(MIGRATIONS_DIR, '0085_push_fcm_feed_and_notifications.sql');

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002';
const karim = 'cccccccc-3333-4333-8333-000000000003';
const secret = 'flush-secret-0123456789abcdefghijklmnopqrstuvwxyz';
const adaToken = 'fcm-token-ada-0123456789abcdefghijklmnopqrstuvwxyz';
const rahimToken = 'fcm-token-rahim-0123456789abcdefghijklmnopqrstuvwxyz';

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

  insert into public.profiles (uid, username, display_name, status) values
    ('${ada}',   'adafirst',    'Ada First',    'active'),
    ('${rahim}', 'rahimsecond', 'Rahim Second', 'active'),
    ('${karim}', 'karimthird',  'Karim Third',  'suspended');
`);

async function asRole(role, uid, sql, params = []) {
  if (uid === null) {
    await db.exec(`set role ${role}; select set_config('request.jwt.claims', '{"role":"anon"}', false);`);
  } else {
    const claims = JSON.stringify({ sub: uid, role: 'authenticated', bsdc_role: 'member' });
    await db.exec(
      `set role ${role}; select set_config('request.jwt.claims', $jwt$${claims}$jwt$, false);`,
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

// ---------------------------------------------------------------------------
// 1. Register FCM token, verify raw token cannot be read directly from table
// ---------------------------------------------------------------------------
const reg = await asRole(
  'authenticated',
  ada,
  `select public.register_fcm_token($1, 'android', 'BSDC/Android', 'en') as h`,
  [adaToken],
);
check(reg.error === null && typeof reg.rows[0]?.h === 'string', 'member registers an FCM token');

const rawRead = await asRole('authenticated', ada, `select token from public.fcm_tokens`);
check(rawRead.error !== null, 'raw FCM token column is not directly selectable from table');

const myDevices = await asRole('authenticated', ada, `select * from public.my_fcm_devices()`);
check(
  myDevices.error === null && myDevices.rows.length === 1 && myDevices.rows[0]?.platform === 'android',
  'member inspects own FCM device metadata via my_fcm_devices()',
);

// ---------------------------------------------------------------------------
// 2. Repeated DM notifications re-arm pushed_at and fcm_pushed_at
// ---------------------------------------------------------------------------
const conv = await asRole('authenticated', rahim, `select public.open_direct_conversation($1) as id`, [ada]);
const convId = conv.rows[0].id;
await asRole('authenticated', rahim, `select public.send_message($1, 'Hello first')`, [convId]);

const firstWebPending = await asRole(
  'anon',
  null,
  `select * from public.fcm_pending_devices($1, 200, 72)`,
  [secret],
);
check(
  firstWebPending.rows.length === 1 && firstWebPending.rows[0]?.body === 'Hello first',
  'first DM queues for FCM delivery',
);

const firstIds = firstWebPending.rows.map((r) => r.notification_id);
await db.exec(
  `update public.notifications set pushed_at = now() where id = '${firstIds[0]}'`,
);
await asRole('anon', null, `select public.fcm_mark_devices($1, $2::uuid[])`, [
  secret,
  `{${firstIds.join(',')}}`,
]);

const afterMark = await asRole(
  'anon',
  null,
  `select * from public.fcm_pending_devices($1, 200, 72)`,
  [secret],
);
check(afterMark.rows.length === 0, 'marked FCM notification is not pending');

// Second message in the SAME conversation!
await asRole('authenticated', rahim, `select public.send_message($1, 'Hello second')`, [convId]);

const notifRow = (
  await db.query(
    `select body, pushed_at is null as web_reset, fcm_pushed_at is null as fcm_reset
       from public.notifications where id = '${firstIds[0]}'`,
  )
).rows[0];
check(
  notifRow?.body === 'Hello second' && notifRow?.web_reset === true && notifRow?.fcm_reset === true,
  'second DM in same conversation resets pushed_at and fcm_pushed_at',
);

const secondFcmPending = await asRole(
  'anon',
  null,
  `select * from public.fcm_pending_devices($1, 200, 72)`,
  [secret],
);
check(
  secondFcmPending.rows.length === 1 && secondFcmPending.rows[0]?.body === 'Hello second',
  'second DM re-queues for FCM delivery',
);

// Mark it so subsequent tests start clean
await asRole('anon', null, `select public.fcm_mark_devices($1, $2::uuid[])`, [
  secret,
  `{${secondFcmPending.rows[0].notification_id}}`,
]);

// ---------------------------------------------------------------------------
// 3. post_published trigger notifies followers only on readable posts
// ---------------------------------------------------------------------------
await asRole(
  'authenticated',
  ada,
  `insert into public.follows (follower_uid, followee_uid) values ('${ada}', '${rahim}')`,
);

// Public published post -> Ada gets post_published
await db.exec(`
  insert into public.posts (author_uid, kind, slug, title, body, excerpt, status, published_at, visibility)
  values ('${rahim}', 'post', 'rahim-pub-1', 'Public Post', 'Body', 'Body', 'published', now(), 'public');
`);

// Private post -> Ada must NOT be notified
await db.exec(`
  insert into public.posts (author_uid, kind, slug, title, body, excerpt, status, published_at, visibility)
  values ('${rahim}', 'post', 'rahim-priv-1', 'Private Post', 'Body', 'Body', 'published', now(), 'private');
`);

const pubNotifs = (
  await db.query(
    `select kind::text, body from public.notifications where uid = '${ada}' and kind = 'post_published'`,
  )
).rows;
check(
  pubNotifs.length === 1 && pubNotifs[0]?.body === 'Public Post',
  'follower receives post_published for public post, not private post',
);

// ---------------------------------------------------------------------------
// 4. feed_new_count excludes deleted, private, and blocked posts
// ---------------------------------------------------------------------------
const since = new Date(Date.now() - 3_600_000).toISOString();
const countBefore = await asRole('authenticated', ada, `select public.feed_new_count($1) as c`, [since]);
check(countBefore.rows[0]?.c === 1, 'feed_new_count counts readable public post', String(countBefore.rows[0]?.c));

await db.exec(`update public.posts set deleted_at = now() where slug = 'rahim-pub-1'`);
const countAfterTrash = await asRole('authenticated', ada, `select public.feed_new_count($1) as c`, [since]);
check(countAfterTrash.rows[0]?.c === 0, 'feed_new_count excludes soft-deleted posts');

// ---------------------------------------------------------------------------
// 5. FCM secret gates, invalidation, kill, sweep & suspended filtering
// ---------------------------------------------------------------------------
await db.exec(`
  insert into public.fcm_tokens (token, token_hash, uid, platform, language)
  values ('${rahimToken}', encode(extensions.digest(convert_to('${rahimToken}', 'UTF8'), 'sha256'), 'hex'), '${karim}', 'android', 'en')
  on conflict do nothing;
`);
await db.exec(`
  insert into public.notifications (uid, actor_uid, kind, body)
  values ('${karim}', '${ada}', 'follow', '');
`);

const suspendedCheck = await asRole(
  'anon',
  null,
  `select * from public.fcm_pending_devices($1, 200, 72)`,
  [secret],
);
check(
  suspendedCheck.rows.every((r) => r.uid !== karim),
  'suspended member FCM token is not woken',
);

const badSecret = await asRole('anon', null, `select * from public.fcm_pending_devices('wrong', 200, 72)`);
check(badSecret.error !== null, 'fcm_pending_devices refuses wrong secret');

for (let i = 1; i <= 3; i += 1) {
  await asRole('anon', null, `select public.fcm_flag_invalid_device($1, $2)`, [secret, adaToken]);
}
const killedAda = (
  await db.query(`select dead_at is not null as dead from public.fcm_tokens where token = '${adaToken}'`)
).rows[0];
check(killedAda?.dead === true, 'three invalid attempts retire FCM token');

await db.exec(`update public.fcm_tokens set dead_at = now() - interval '91 days' where token = '${adaToken}'`);
const swept = await asRole('anon', null, `select public.fcm_sweep_dead_devices($1, 90) as n`, [secret]);
check(swept.rows[0]?.n >= 1, 'old dead FCM tokens are swept');

// Idempotency re-apply
await db.exec('begin;');
try {
  await db.exec(await readFile(MIGRATION, 'utf8'));
  await db.exec('commit;');
  check(true, '0085 applies twice cleanly');
} catch (error) {
  await db.exec('rollback;');
  check(false, '0085 applies twice cleanly', error.message);
}

await db.close();
console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) process.exit(1);
