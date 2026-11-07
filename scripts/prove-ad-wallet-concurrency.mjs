#!/usr/bin/env node
/**
 * Real PostgreSQL concurrency proof. Run ONLY against a throwaway database:
 *   BSDC_THROWAWAY_DB=1 SUPABASE_DB_URL=... node scripts/prove-ad-wallet-concurrency.mjs
 *
 * PGlite proves the rules in t53, but has a single connection. Two psql
 * sessions here overlap transactions so two campaigns and two payment retries
 * really compete for the same owner's wallet lock. Fixtures are removed.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const url = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
if (process.env.BSDC_THROWAWAY_DB !== '1' || !url) {
  console.error(
    'Set BSDC_THROWAWAY_DB=1 and a disposable database URL; never run this on production.',
  );
  process.exit(2);
}
const suffix = randomBytes(6).toString('hex');
const owner = `wallet-proof-${suffix}`;
const staff = `staff-proof-${suffix}`;
const readerA = `reader-a-${suffix}`;
const readerB = `reader-b-${suffix}`;
const a = randomUUID();
const b = randomUUID();
const ca = randomUUID();
const cb = randomUUID();

function psql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', url], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', () => reject(new Error('Could not start psql.')));
    child.on('close', (code) => {
      if (code !== 0)
        reject(
          new Error(`PostgreSQL proof failed: ${stderr.replaceAll(url, '[database]').trim()}`),
        );
      else resolve(stdout.trim());
    });
    child.stdin.end(sql);
  });
}
const claims = (uid) => JSON.stringify({ sub: uid, role: 'authenticated' });
const session = (uid) =>
  `set local role authenticated; select set_config('request.jwt.claims', '${claims(uid)}', true);`;

try {
  await psql(`
    begin;
    insert into public.profiles(uid, username, display_name, role, status) values
      ('${owner}', 'wo_${suffix}', 'Wallet owner', 'member', 'active'),
      ('${staff}', 'ws_${suffix}', 'Wallet staff', 'owner', 'active'),
      ('${readerA}', 'wa_${suffix}', 'Reader A', 'member', 'active'),
      ('${readerB}', 'wb_${suffix}', 'Reader B', 'member', 'active');
    insert into public.ad_campaigns(id, owner_uid, name, status, pricing, bid, total_budget, daily_budget) values
      ('${a}', '${owner}', 'Concurrent one', 'active', 'cpc', 1000, 10000, 0),
      ('${b}', '${owner}', 'Concurrent two', 'active', 'cpc', 1000, 10000, 0);
    insert into public.ad_creatives(id, campaign_id, placement, headline, target_url) values
      ('${ca}', '${a}', 'feed', 'First creative', 'https://example.test/one'),
      ('${cb}', '${b}', 'feed', 'Second creative', 'https://example.test/two');
    insert into public.ad_wallet_entries(owner_uid, kind, amount) values ('${owner}', 'topup', 1000);
    ${session(readerA)}
    select public.record_ad_event('${ca}', 'impression');
    select set_config('request.jwt.claims', '${claims(readerB)}', true);
    select public.record_ad_event('${cb}', 'impression');
    commit;
  `);
  // Each session begins together, then holds its transaction open after the
  // charge. Without an owner-level lock both see the same unspent balance.
  await Promise.all([
    psql(
      `begin; ${session(readerA)} select pg_sleep(0.1); select public.record_ad_event('${ca}', 'click'); select pg_sleep(1); commit;`,
    ),
    psql(
      `begin; ${session(readerB)} select pg_sleep(0.1); select public.record_ad_event('${cb}', 'click'); select pg_sleep(1); commit;`,
    ),
  ]);
  const chargeResult = await psql(`
    select coalesce((select sum(amount) from public.ad_wallet_entries where owner_uid='${owner}'), 0)
      || ',' || (select count(*) from public.ad_events where campaign_id in ('${a}', '${b}') and kind='click')
      || ',' || coalesce((select sum(cost) from public.ad_events where campaign_id in ('${a}', '${b}')), 0);
  `);
  if (chargeResult !== '0,1,1000')
    throw new Error(`Concurrent charge invariant failed: ${chargeResult}`);
  console.log('ok    concurrent campaigns cannot overdraw a shared wallet');

  await Promise.all([
    psql(
      `begin; ${session(staff)} select pg_sleep(0.1); select public.topup_ad_wallet('${owner}', 2000, 'proof-payment'); select pg_sleep(1); commit;`,
    ),
    psql(
      `begin; ${session(staff)} select pg_sleep(0.1); select public.topup_ad_wallet('${owner}', 2000, 'proof-payment'); select pg_sleep(1); commit;`,
    ),
  ]);
  const creditResult = await psql(`
    select coalesce((select sum(amount) from public.ad_wallet_entries where owner_uid='${owner}'), 0)
      || ',' || (select count(*) from public.ad_wallet_entries where owner_uid='${owner}' and reference='proof-payment');
  `);
  if (creditResult !== '2000,1')
    throw new Error(`Concurrent payment retry invariant failed: ${creditResult}`);
  console.log('ok    concurrent retries of one payment credit it only once');
} finally {
  await psql(
    `delete from public.profiles where uid in ('${owner}', '${staff}', '${readerA}', '${readerB}');`,
  );
}
