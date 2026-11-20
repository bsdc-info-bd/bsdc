/** Both web registration transports refresh metadata and isolate device management by UID. */
import { as, asAnon, check, failureCount, makeDb, summary } from './lib.mjs';

const db = await makeDb();
const ada = 'push-proof-ada';
const other = 'push-proof-other';
const endpoint = 'https://push.example/registration-proof';
const token = 'fcm-registration-proof-token';
const config = await asAnon(
  db,
  'select public.push_public_config() as value',
  'public config RPC is callable',
);
check(config?.rows[0]?.value?.enabled === false, 'missing VAPID key reports disabled');

const web = (lang, agent) =>
  `select public.register_push_subscription('${endpoint}', 'key', 'auth', '${agent}', '${lang}')`;
const fcm = (lang, agent) =>
  `select public.register_fcm_token('${token}', 'web', '${agent}', '${lang}') as hash`;
await as(db, ada, web('bn', 'Chrome'), 'register Web Push');
await as(db, ada, web('en', 'Firefox'), 'refresh Web Push');
const original = await as(db, ada, fcm('bn', 'Chrome'), 'register FCM Web');
const refreshed = await as(db, ada, fcm('en', 'Firefox'), 'refresh FCM Web');
const hash = refreshed?.rows[0]?.hash;
check(
  typeof hash === 'string' && hash.length === 64 && hash === original?.rows[0]?.hash,
  'same token yields same hash',
);

for (const [name, forget] of [
  ['my_push_devices', `forget_push_device('${endpoint}')`],
  ['my_fcm_devices', `forget_fcm_device('${hash}')`],
]) {
  const sql = `select * from public.${name}()`;
  const hidden = await as(db, other, sql, `${name} available to other member`);
  check(hidden?.rows.length === 0, `${name} does not reveal devices across accounts`);
  await as(db, other, `select public.${forget}`, 'foreign delete is a no-op');
  const owned = await as(db, ada, sql, `${name} available to owner`);
  check(
    owned?.rows.length === 1 &&
      owned.rows[0].language === 'en' &&
      owned.rows[0].user_agent === 'Firefox',
    `${name} has one refreshed device after foreign delete`,
  );
  await as(db, ada, `select public.${forget}`, 'owner can delete device');
  const removed = await as(db, ada, sql, `${name} after removal`);
  check(removed?.rows.length === 0, `${name} no longer lists removed device`);
}

summary();
await db.close();
if (failureCount()) process.exitCode = 1;
