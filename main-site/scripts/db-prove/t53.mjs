/** A shared wallet and daily cap cannot be spent twice, even across campaigns. */
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
const staff = 'billing-staff';
const owner = 'billing-advertiser';
const viewers = ['billing-reader-a', 'billing-reader-b', 'billing-reader-c'];
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${staff}', 'billing_staff', 'Billing Staff', 'owner', 'active'),
    ('${owner}', 'billing_owner', 'Billing Owner', 'member', 'active'),
    ('${viewers[0]}', 'billing_viewer_a', 'Viewer A', 'member', 'active'),
    ('${viewers[1]}', 'billing_viewer_b', 'Viewer B', 'member', 'active'),
    ('${viewers[2]}', 'billing_viewer_c', 'Viewer C', 'member', 'active');
  insert into public.ad_campaigns (id, owner_uid, name, status, pricing, bid, total_budget, daily_budget)
  values
    ('10000000-0000-4000-8000-000000000001', '${owner}', 'Capped', 'active', 'cpc', 1000, 10000, 1500),
    ('10000000-0000-4000-8000-000000000002', '${owner}', 'Shared wallet', 'active', 'cpc', 1000, 10000, 0);
  insert into public.ad_creatives (id, campaign_id, placement, headline, target_url) values
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'feed', 'First advert', 'https://example.test/one'),
    ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'shop', 'Second advert', 'https://example.test/two');
`);
async function as(uid, sql) {
  const claims = JSON.stringify({ sub: uid, role: 'authenticated' });
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claims', $jwt$${claims}$jwt$, false);`,
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
const topup = await as(
  staff,
  `select public.topup_ad_wallet('${owner}', 1600, 'payment-001') as balance`,
);
check(topup.rows[0]?.balance === 1600, 'staff can credit a received payment', topup.error?.message);
const retry = await as(
  staff,
  `select public.topup_ad_wallet('${owner}', 1600, 'payment-001') as balance`,
);
check(retry.rows[0]?.balance === 1600, 'repeating a payment reference does not credit twice');
const mismatch = await as(staff, `select public.topup_ad_wallet('${owner}', 1601, 'payment-001')`);
check(mismatch.error?.code === '22023', 'the same reference with a different amount is refused');
const memberTopup = await as(owner, `select public.topup_ad_wallet('${owner}', 500, 'mine')`);
check(memberTopup.error?.code === '42501', 'the advertiser cannot credit their wallet');

const c1 = '20000000-0000-4000-8000-000000000001';
const c2 = '20000000-0000-4000-8000-000000000002';
const event = (uid, id, kind) =>
  as(uid, `select public.record_ad_event('${id}', '${kind}') as counted`);
const feedBefore = await as(viewers[0], `select * from public.serve_ads('feed', 5)`);
check(feedBefore.rows.length === 1, 'a funded active campaign can be served');
check(
  (await event(viewers[0], c1, 'impression')).rows[0]?.counted === true,
  'first impression is counted',
);
check(
  (await event(viewers[0], c1, 'click')).rows[0]?.counted === true,
  'the first click is charged',
);
check(
  (await event(viewers[0], c1, 'click')).rows[0]?.counted === false,
  'a duplicate click is not counted or charged twice',
);
check(
  (await event(viewers[1], c1, 'impression')).rows[0]?.counted === true,
  'a second viewer has an impression',
);
check(
  (await event(viewers[1], c1, 'click')).rows[0]?.counted === true,
  'the last daily allowance can pay for a partial final event',
);
const capped = await db.query(
  `select spent, bsdc.ad_spend_today(id) as today from public.ad_campaigns where name = 'Capped'`,
);
check(
  capped.rows[0]?.spent === 1500 && capped.rows[0]?.today === 1500,
  'the last click stops exactly at the daily cap',
);
check(
  (await event(viewers[2], c1, 'impression')).rows[0]?.counted === false,
  'even a free impression is refused after the cap',
);
check(
  (await as(viewers[2], `select * from public.serve_ads('feed', 5)`)).rows.length === 0,
  'a capped campaign is no longer served',
);
check(
  (await event(viewers[2], c2, 'impression')).rows[0]?.counted === true,
  'another campaign can use the same remaining wallet',
);
check(
  (await event(viewers[2], c2, 'click')).rows[0]?.counted === true,
  'the last wallet balance pays for a partial final event',
);
const wallet = await db.query(
  `select sum(amount)::integer as balance from public.ad_wallet_entries where owner_uid = '${owner}'`,
);
check(wallet.rows[0]?.balance === 0, 'two campaigns cannot overdraw their shared wallet');
check(
  (await as(viewers[0], `select * from public.serve_ads('shop', 5)`)).rows.length === 0,
  'an unfunded wallet is excluded from serving',
);
check(
  (await event(viewers[0], c2, 'impression')).rows[0]?.counted === false,
  'an unfunded campaign cannot record a free impression',
);
const ledger = await db.query(
  `select sum(-amount)::integer as spend from public.ad_wallet_entries where owner_uid = '${owner}' and kind = 'spend'`,
);
const events = await db.query(`select sum(cost)::integer as spend from public.ad_events`);
check(
  ledger.rows[0]?.spend === 1600 && events.rows[0]?.spend === 1600,
  'ledger debits equal counted event costs',
);
const stats = await db.query(`select sum(spend)::integer as spend from public.ad_daily_stats`);
check(stats.rows[0]?.spend === events.rows[0]?.spend, 'daily reporting agrees with the ledger');

console.log(`\nSUMMARY: ${pass} passed, ${bad.length} failed`);
for (const label of bad) console.log('  failed: ' + label);
process.exit(bad.length === 0 ? 0 : 1);
