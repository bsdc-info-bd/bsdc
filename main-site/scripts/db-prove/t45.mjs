/**
 * Proof for 0072: a notification can carry its words.
 *
 * Four claims, and each one is a way the delivery worker could be wrong in a way
 * nobody would notice until a member complained:
 *
 *   1. A worker holding the secret reads the notification *and* the two keys it
 *      must be encrypted for, in one read. Without the keys the payload path is
 *      impossible; with the keys returned to the wrong caller it is a leak.
 *   2. A worker not holding the secret reads nothing — not the keys, not the
 *      body, not the existence of the row.
 *   3. A suspended or deactivated member is not woken, even though the
 *      notification and the device both exist.
 *   4. A device whose keys are unusable is flagged three times and then retired,
 *      rather than retried forever or deleted on the first failure.
 */
import { join } from 'node:path';
import { makeDb, MIGRATIONS_DIR } from './lib.mjs';

const MIGRATION = join(MIGRATIONS_DIR, '0072_a_notification_carries_its_words.sql');

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002';
const gone = 'cccccccc-3333-4333-8333-000000000003';

const adaEndpoint = 'https://fcm.googleapis.com/fcm/send/eGfK3-0AdaDeviceTokenLongEnoughToBeReal';
const rahimEndpoint = 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABrahimDevice';
const goneEndpoint = 'https://web.push.apple.com/QGoneDeviceTokenThatIsLongEnoughToBeReal';
const secret = 'flush-secret-0123456789abcdefghijklmnopqrstuvwxyz';

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

const db = await makeDb({ maxExclusive: '0073' });

await db.exec(`
  insert into bsdc.push_settings (name, value) values ('flush_secret', '${secret}')
    on conflict (name) do update set value = excluded.value;

  insert into public.profiles (uid, username, display_name, status) values
    ('${ada}',   'adafirst',    'Ada First',    'active'),
    ('${rahim}', 'rahimsecond', 'Rahim Second', 'active'),
    ('${gone}',  'gonethird',   'Gone Third',   'suspended');

  insert into public.posts (author_uid, kind, slug, title, body, status, published_at, visibility)
    values ('${rahim}', 'post', 'a-river-level', 'A river level', 'b', 'published', now(), 'public');

  insert into public.push_subscriptions (endpoint, uid, p256dh, auth, language) values
    ('${adaEndpoint}',   '${ada}',   'BAdaPublicKeyPointThatIsLongEnoughToLookReal', 'adaauth', 'en'),
    ('${rahimEndpoint}', '${rahim}', 'BRahimPublicKeyPoint', 'rahimauth', 'bn'),
    ('${goneEndpoint}',  '${gone}',  'BGonePublicKeyPoint', 'goneauth', 'bn');
`);

const postId = (await db.query(`select id from public.posts where slug = 'a-river-level'`)).rows[0].id;

// A notification for Ada (she should be woken), one for Rahim (he should), and
// one for a suspended account (nobody should).
await db.exec(`
  insert into public.notifications (uid, actor_uid, kind, post_id, body)
    values ('${ada}', '${rahim}', 'comment', '${postId}', 'This is a very good explanation.');
  insert into public.notifications (uid, actor_uid, kind, post_id, body)
    values ('${rahim}', '${ada}', 'reaction', '${postId}', 'liked');
  insert into public.notifications (uid, actor_uid, kind, post_id, body)
    values ('${gone}', '${ada}', 'comment', '${postId}', 'should never be delivered');
`);

async function asRole(role, sql, params = []) {
  await db.exec(`set role ${role};`);
  try {
    const result = await db.query(sql, params);
    return { rows: result.rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec('reset role;');
  }
}

// ------------------------------------------------ what the worker is given ---

const pending = await asRole(
  'anon',
  `select * from public.push_pending_devices($1, 200, 72)`,
  [secret],
);

check(pending.error === null, 'the worker reads what is pending', pending.error?.message ?? '');
check(pending.rows.length === 2, 'a suspended member is not woken', `got ${pending.rows.length} rows`);
check(
  pending.rows.every((row) => row.uid !== gone),
  'the suspended member is absent from every row',
);

const adaRow = pending.rows.find((row) => row.uid === ada);
check(adaRow !== undefined, 'the active member has a row');
check(
  typeof adaRow?.p256dh === 'string' && adaRow.p256dh.length > 0,
  'the row carries the key a payload is encrypted for',
);
check(typeof adaRow?.auth === 'string' && adaRow.auth.length > 0, 'the row carries the auth secret');
check(adaRow?.language === 'en', 'the row carries the language the device asked for');
check(adaRow?.actor_name === 'Rahim Second', 'the row carries the actor name');
check(adaRow?.url === '/p/a-river-level', 'the row carries the path to open', adaRow?.url ?? '');
check(
  typeof adaRow?.body === 'string' && adaRow.body.includes('very good'),
  'the row carries what was actually said',
);

// -------------------------------------------------- what a stranger is given ---

const refused = await asRole('anon', `select * from public.push_pending_devices($1, 200, 72)`, [
  'not-the-secret',
]);
check(refused.error !== null, 'a caller with the wrong secret is refused');
check(
  (refused.rows ?? []).length === 0,
  'a wrong secret yields no rows at all, not a filtered list',
);

const noSecret = await asRole('anon', `select * from public.push_pending_devices(null, 200, 72)`);
check(noSecret.error !== null, 'a missing secret is refused, not treated as empty');

const direct = await asRole(
  'authenticated',
  `select endpoint, p256dh, auth from public.push_subscriptions where uid = '${rahim}'`,
);
check(
  direct.error !== null || direct.rows.length === 0,
  'the subscription keys are not readable from the table by their owner\'s role',
  direct.error?.message ?? `${direct.rows.length} rows`,
);

// --------------------------------------------------------------- marking ---

const ids = pending.rows.map((row) => row.notification_id);
const marked = await asRole('anon', `select public.push_mark_devices($1, $2::uuid[])`, [
  secret,
  `{${ids.join(',')}}`,
]);
check(marked.error === null, 'the worker marks what it delivered');
check(Number(marked.rows[0]?.push_mark_devices) === 2, 'exactly the delivered rows are marked');

const afterMark = await asRole('anon', `select * from public.push_pending_devices($1, 200, 72)`, [
  secret,
]);
check(
  afterMark.rows.length === 0,
  'a delivered notification is not delivered again',
  `got ${afterMark.rows.length}`,
);

const strangerMark = await asRole('anon', `select public.push_mark_devices($1, $2::uuid[])`, [
  'not-the-secret',
  `{${ids.join(',')}}`,
]);
check(strangerMark.error !== null, 'a stranger cannot mark anything');

// --------------------------------------------------------------- retiring ---

await asRole('anon', `select public.push_kill_device($1, $2)`, [secret, rahimEndpoint]);
const afterKill = await asRole('anon', `select * from public.push_pending_devices($1, 200, 72)`, [
  secret,
]);
check(
  afterKill.rows.every((row) => row.endpoint !== rahimEndpoint),
  'a device the push service says is gone is not woken again',
);

const hostKill = await asRole('anon', `select public.push_kill_device($1, $2)`, [
  'not-the-secret',
  rahimEndpoint,
]);
check(hostKill.error !== null, 'a stranger cannot retire a device');

// ---------------------------------------------------------------- invalid ---

for (let attempt = 1; attempt <= 3; attempt += 1) {
  await asRole('anon', `select public.push_flag_invalid_device($1, $2)`, [secret, adaEndpoint]);
  const row = (
    await db.query(
      `select invalid_count, invalid_reason, dead_at from public.push_subscriptions where endpoint = '${adaEndpoint}'`,
    )
  ).rows[0];
  check(row.invalid_count === attempt, `invalid attempt ${attempt} is counted`, String(row.invalid_count));
  if (attempt < 3) {
    check(row.dead_at === null, `attempt ${attempt} does not retire the device`);
  } else {
    check(row.dead_at !== null, 'the third attempt retires a device whose keys never work');
    check(row.invalid_reason === 'keys-unusable', 'the reason is recorded');
  }
}

const hostFlag = await asRole('anon', `select public.push_flag_invalid_device($1, $2)`, [
  'not-the-secret',
  adaEndpoint,
]);
check(hostFlag.error !== null, 'a stranger cannot flag a device');

// --------------------------------------------------------- the member's view ---

const rahimClaims = JSON.stringify({
  sub: rahim,
  role: 'authenticated',
  bsdc_role: 'member',
  email: 'rahimsecond@bsdc.info.bd',
  email_verified: true,
});
await db.exec(
  `set role authenticated; select set_config('request.jwt.claims', $jwt$${rahimClaims}$jwt$, false);`,
);
let ownDevices;
try {
  ownDevices = await db.query(`select endpoint, state from public.my_push_devices()`);
} finally {
  await db.exec('reset role;');
}

check(ownDevices.rows.every((row) => row.endpoint !== adaEndpoint), 'a member sees only their own devices');
check(
  ownDevices.rows.every((row) => ['live', 'dead', 'invalid'].includes(row.state)),
  'each device reports a state a member can understand',
);

// ------------------------------------------------------------- housekeeping ---

await db.exec(`update public.push_subscriptions set dead_at = now() - interval '91 days' where endpoint = '${rahimEndpoint}'`);
const swept = await asRole('anon', `select public.push_sweep_dead_devices($1, 90)`, [secret]);
check(swept.error === null, 'the sweep runs with the secret');
check(Number(swept.rows[0]?.push_sweep_dead_devices) >= 1, 'a device dead for ninety days is swept');
const sweptAgain = await asRole('anon', `select public.push_sweep_dead_devices($1, 90)`, [secret]);
check(
  Number(sweptAgain.rows[0]?.push_sweep_dead_devices) === 0,
  'the sweep is idempotent',
);

const hostSweep = await asRole('anon', `select public.push_sweep_dead_devices($1, 90)`, ['nope']);
check(hostSweep.error !== null, 'a stranger cannot sweep');

// -------------------------------------------------------------- the grants ---

for (const signature of [
  'public.push_pending_devices(text, integer, integer)',
  'public.push_mark_devices(text, uuid[])',
  'public.push_kill_device(text, text)',
  'public.push_flag_invalid_device(text, text)',
  'public.push_sweep_dead_devices(text, integer)',
  'public.my_push_devices()',
  'public.forget_push_device(text)',
]) {
  const grant = (
    await db.query(
      `select has_function_privilege('public', '${signature}', 'execute') as anon_can`,
    )
  ).rows[0];
  check(grant.anon_can === false, `${signature} is not executable by everybody`);
}

// The migration is a migration: it must survive being applied to a database that
// already has 0060's columns, which is every deployment that exists today.
await db.exec('begin;');
try {
  await db.exec(await (await import('node:fs/promises')).readFile(MIGRATION, 'utf8'));
  await db.exec('commit;');
  check(true, 'the migration applies a second time without error');
} catch (error) {
  await db.exec('rollback;');
  check(false, 'the migration applies a second time without error', error.message);
}

console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) process.exit(1);
