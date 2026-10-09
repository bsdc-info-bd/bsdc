/**
 * Proof for 0060: push reaches a closed browser, and only the people it should.
 *
 * Three things have to be true for this to be worth anything. A member's device
 * is recorded against that member and nobody else. A function that reads other
 * people's notifications refuses everybody who does not hold the secret, and
 * refuses everybody when no secret has been set — because the alternative is a
 * public endpoint that can read the site's inboxes. And a device that wakes is
 * told what it missed exactly once.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDb, MIGRATIONS_DIR } from './lib.mjs';

const MIGRATION = join(
  MIGRATIONS_DIR,
  '0060_push_reaches_a_closed_browser.sql',
);

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002';

const endpoint =
  'https://fcm.googleapis.com/fcm/send/eGfK3-0AdaDeviceTokenThatIsLongEnoughToBeReal';
const rahimEndpoint =
  'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABrahimDevice';
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

const db = await makeDb();
await db.exec(`
  insert into public.profiles (uid, username, display_name, role) values
    ('${ada}', 'adafirst',    'Ada First',    'member'),
    ('${rahim}', 'rahimsecond', 'Rahim Second', 'member');
  insert into public.posts (author_uid, kind, slug, title, body, status, published_at, visibility)
    values ('${rahim}', 'post', 'a-river-level', 'A river level', 'b', 'published', now(), 'public');
`);
const postId = (
  await db.query(`select id from public.posts where slug = 'a-river-level'`)
).rows[0].id;

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

function refused(result, code, label) {
  check(
    !result.ok && result.code === code,
    label,
    `${result.code ?? 'accepted'} ${result.message ?? ''}`,
  );
}

// ------------------------------------------------- nothing works before setup ---
refused(
  await as(null, `select count(*)::int as n from public.push_pending('${secret}', 50)`),
  '42501',
  'with no secret set, the flush reads nothing and says why',
);
refused(
  await as(null, `select public.push_mark('${secret}', array[]::uuid[])`),
  '42501',
  'and cannot mark anything as sent',
);
refused(
  await as(null, `select public.push_kill('${secret}', '${endpoint}')`),
  '42501',
  'and cannot retire a device',
);

// A secret that is too short to be a secret is treated as no secret at all.
await db.exec(
  `insert into bsdc.push_settings (name, value) values ('flush_secret', 'ten-chars')`,
);
refused(
  await as(null, `select count(*)::int as n from public.push_pending('ten-chars', 50)`),
  '42501',
  'and a short secret does not become one just because it matches',
);
await db.exec(`update bsdc.push_settings set value = '${secret}' where name = 'flush_secret'`);

// ------------------------------------------------------------- registering ---
const registered = await as(
  ada,
  `select public.register_push_subscription('${endpoint}', 'p256dh-key-material', 'auth-secret',
      'Mozilla/5.0 (Linux; Android 14) BSDC', 'bn')`,
);
check(registered.ok, 'a member registers a device', registered.code ?? registered.message ?? '');

const stored = await db.query(
  `select uid, language, dead_at is null as live from public.push_subscriptions where endpoint = '${endpoint}'`,
);
check(stored.rows[0]?.uid === ada, 'and it is stored against that member');
check(stored.rows[0]?.language === 'bn', 'with the language the notification will be written in');
check(stored.rows[0]?.live === true, 'and it is alive');

await as(
  rahim,
  `select public.register_push_subscription('${rahimEndpoint}', 'p256dh', 'auth', 'Firefox', 'en')`,
);

const mine = await as(ada, `select count(*)::int as n from public.my_push_subscriptions()`);
check(mine.ok && mine.rows?.[0]?.n === 1, 'a member sees their own devices and only their own');

refused(
  await as(
    ada,
    `insert into public.push_subscriptions (endpoint, uid) values
       ('https://example.com/an-endpoint-long-enough', '${rahim}')`,
  ),
  '42501',
  'and cannot register a device as somebody else',
);

const unregistered = await as(
  ada,
  `select public.unregister_push_subscription('${rahimEndpoint}')`,
);
check(
  unregistered.ok,
  'asking to unregister somebody else\u2019s device is not an error',
  unregistered.code ?? unregistered.message ?? '',
);
check(
  (await db.query(`select count(*)::int as n from public.push_subscriptions where endpoint = '${rahimEndpoint}'`))
    .rows[0]?.n === 1,
  'and the other member\u2019s device is still there',
);

const anonymous = await as(null, `select public.register_push_subscription('${endpoint}')`);
refused(anonymous, '42501', 'a visitor with no account cannot register one');

// --------------------------------------------------------------- the reason ---
await db.exec(
  `select bsdc.notify('${ada}', '${rahim}', 'reaction', '${postId}', null, 'Rahim reacted to your post')`,
);
await db.exec(
  `select bsdc.notify('${rahim}', '${ada}', 'comment', '${postId}', null, 'Ada commented')`,
);
await db.exec(`select bsdc.notify('${ada}', '${rahim}', 'follow')`);

const pending = await as(
  null,
  `select notification_id, uid, endpoint from public.push_pending('${secret}', 50) order by 1, 3`,
);
check(pending.ok, 'the flush asks what is waiting', pending.code ?? pending.message ?? '');
const pendingRows = pending.rows ?? [];
const forAda = pendingRows.filter((row) => row.uid === ada);
const forRahim = pendingRows.filter((row) => row.uid === rahim);
check(
  forAda.length === 2 && forAda.every((row) => row.endpoint === endpoint),
  'and is told about the two notifications for the first member, addressed to her device',
  JSON.stringify(forAda),
);
check(
  forRahim.length === 1 && forRahim.every((row) => row.endpoint === rahimEndpoint),
  'and the one for the second, addressed to his',
  JSON.stringify(forRahim),
);
check(
  pendingRows.every((row) => typeof row.notification_id === 'string'),
  'each row carrying the notification it is about',
);

const wrongSecret = await as(null, `select count(*)::int as n from public.push_pending('not-the-secret', 50)`);
refused(wrongSecret, '42501', 'a caller with the wrong secret is refused outright');

// ----------------------------------------------------------- the waking side ---
const content = await as(
  null,
  `select kind, body, url, actor_name, language from public.push_content('${endpoint}', 5) order by created_at desc`,
);
check(content.ok, 'a woken device asks what it missed', content.code ?? content.message ?? '');
const rows = content.rows ?? [];
check(rows.length === 2, 'and is told about both', JSON.stringify(rows));
const reaction = rows.find((row) => row.kind === 'reaction');
const follow = rows.find((row) => row.kind === 'follow');
check(
  reaction?.url === '/p/a-river-level',
  'a reaction points at the post it happened on',
  String(reaction?.url),
);
check(reaction?.actor_name === 'Rahim Second', 'and names the person who caused it');
check(
  follow?.url === '/@rahimsecond',
  'a follow points at the person who followed',
  String(follow?.url),
);

const again = await as(null, `select count(*)::int as n from public.push_content('${endpoint}', 5)`);
check(
  again.ok && again.rows?.[0]?.n === 0,
  'asking twice does not tell the same device the same thing twice',
  JSON.stringify(again.rows ?? again.message),
);

const forged = await as(
  null,
  `select count(*)::int as n from public.push_content('https://example.com/some-guessed-endpoint', 5)`,
);
check(
  forged.ok && forged.rows?.[0]?.n === 0,
  'and an address nobody was given is told nothing at all',
);

const otherDevice = await as(
  null,
  `select count(*)::int as n from public.push_content('${rahimEndpoint}', 5)`,
);
check(
  otherDevice.ok && otherDevice.rows?.[0]?.n === 1,
  'while the other member\u2019s device is told only what belongs to them',
);

// -------------------------------------------------------------- marking it ---
const ids = pendingRows.map((row) => `'${row.notification_id}'`).join(',');
const marked = await as(null, `select public.push_mark('${secret}', array[${ids}]::uuid[])`);
check(
    marked.ok && marked.rows?.[0]?.push_mark === pendingRows.length,
    'the flush marks what it handed over',
    JSON.stringify(marked.rows ?? marked.message),
  );

const afterMark = await as(null, `select count(*)::int as n from public.push_pending('${secret}', 50)`);
check(
  afterMark.ok && afterMark.rows?.[0]?.n === 0,
  'and nothing waiting is handed over a second time',
  JSON.stringify(afterMark.rows ?? afterMark.message),
);

// --------------------------------------------------------------- a dead one ---
await db.exec(`select bsdc.notify('${ada}', '${rahim}', 'mention', '${postId}', null, 'You were mentioned')`);
const killed = await as(null, `select public.push_kill('${secret}', '${endpoint}')`);
check(killed.ok, 'a device the push service no longer recognises is retired', killed.message ?? '');

const afterKill = await as(null, `select count(*)::int as n from public.push_pending('${secret}', 50)`);
check(
  afterKill.ok && afterKill.rows?.[0]?.n === 0,
  'and it is never woken again',
  JSON.stringify(afterKill.rows ?? afterKill.message),
);
const hidden = await as(ada, `select count(*)::int as n from public.my_push_subscriptions()`);
check(hidden.ok && hidden.rows?.[0]?.n === 0, 'or listed to the member as theirs');

const revived = await as(
  ada,
  `select public.register_push_subscription('${endpoint}', 'p256dh', 'auth', 'BSDC', 'bn')`,
);
check(
  revived.ok &&
    (await db.query(`select dead_at is null as live from public.push_subscriptions where endpoint = '${endpoint}'`))
      .rows[0]?.live === true,
  'and the same browser asking again comes back to life',
  revived.message ?? '',
);

// ----------------------------------------------------------- nobody else in ---
const settingsReadable = await db.query(
  `select has_table_privilege('anon', 'bsdc.push_settings', 'SELECT') as anon_read,
          has_table_privilege('authenticated', 'bsdc.push_settings', 'SELECT') as member_read`,
);
check(
  settingsReadable.rows[0]?.anon_read === false && settingsReadable.rows[0]?.member_read === false,
  'the secret itself is readable by nothing but these functions',
  JSON.stringify(settingsReadable.rows[0]),
);
const memberRegister = await db.query(
  `select has_function_privilege('anon', 'public.register_push_subscription(text,text,text,text,text)', 'EXECUTE') as anon_exec,
          has_function_privilege('authenticated', 'public.push_pending(text,integer)', 'EXECUTE') as member_flush`,
);
check(
  memberRegister.rows[0]?.anon_exec === false,
  'a visitor cannot register a device',
);
check(
  memberRegister.rows[0]?.member_flush === true,
  'while the flush stays callable with the anonymous key the edge holds',
);

// ------------------------------------------------------------ twice over ---
for (let round = 1; round <= 2; round += 1) {
  try {
    await db.exec(readFileSync(MIGRATION, 'utf8'));
    check(true, `0060 re-applied (round ${round})`);
  } catch (error) {
    check(false, `0060 re-applied (round ${round})`, String(error.message).split('\n')[0]);
  }
}
const stillThere = await db.query(
  `select count(*)::int as n from public.push_subscriptions where endpoint = '${endpoint}'`,
);
check(stillThere.rows[0]?.n === 1, 'and the device that was registered is still registered');

await db.close();
console.log('');
console.log(`SUMMARY: ${pass} passed, ${bad.length} failed`);
if (bad.length) console.log(`  failed: ${bad.join(', ')}`);
process.exit(bad.length === 0 ? 0 : 1);
