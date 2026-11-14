/**
 * 0093: every real ad click is counted and billed; spam is blocked per identity.
 *
 * Proves, against the real migrations on PGlite:
 *  - each click by a member is a separate counted row, stat, and charge
 *  - a double tap within 2 seconds is rejected and logged as double_tap
 *  - the hourly cap (30 per creative per identity) is enforced and logged
 *  - one member's spam does not block another member's clicks
 *  - guest clicks are counted per verified viewer token
 *  - a click without a prior impression is still discarded
 *  - the ad_event_rejections audit table is not readable by clients
 */
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
const staff = 'click-staff';
const owner = 'click-advertiser';
const memberA = 'click-member-a';
const memberB = 'click-member-b';

await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${staff}', 'click_staff', 'Click Staff', 'admin', 'active'),
    ('${owner}', 'click_owner', 'Click Owner', 'member', 'active'),
    ('${memberA}', 'click_a', 'Click A', 'member', 'active'),
    ('${memberB}', 'click_b', 'Click B', 'member', 'active');
`);

async function run(sql, { uid = null, anon = false } = {}) {
  const claims = uid ? JSON.stringify({ sub: uid, role: 'authenticated' }) : '{}';
  const role = anon || !uid ? 'anon' : 'authenticated';
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

// Fund the advertiser and create a pay-per-click campaign (5 taka = 500 poisha per click).
await run(`select public.topup_ad_wallet('${owner}', 500000, 'pay-0093-1')`, { uid: staff });
const setup = await run(
  `select public.staff_setup_campaign(
    '${owner}', 'Click Counting Promo', 'cpc', 500, 400000, 0, now(), null,
    '{}', '{}', 'any', true,
    'feed', 'Learn with BSDC', 'Hands-on track', 'https://bsdc.info.bd/learn',
    'https://i.ibb.co/demo/click.webp', 'Start',
    'https://i.ibb.co/demo/click-sm.webp', 'Poster', 'card', '#15803d', 'Featured', '{web,android}'
  ) as campaign_id`,
  { uid: staff },
);
const campaignId = setup.rows[0]?.campaign_id;
check(Boolean(campaignId), 'cpc campaign is created for the test', setup.error?.message);

const creative = await db.query(
  `select id from public.ad_creatives where campaign_id = $1 limit 1`,
  [campaignId],
);
const creativeId = creative.rows[0]?.id;
check(Boolean(creativeId), 'campaign has a creative to click');

const recordAs = (uid, kind, token = '') =>
  run(
    `select public.record_ad_event('${creativeId}', '${kind}', '${token}') as counted`,
    uid ? { uid } : { anon: true },
  );

// Make the last click look 3 seconds old so the 2-second double-tap guard lets the next one through.
async function ageClicks(uid) {
  await db.exec(
    `update public.ad_events set created_at = now() - interval '3 seconds'
      where creative_id = '${creativeId}' and uid = '${uid}' and kind = 'click'`,
  );
}

// 1. Member A: impression, then a first click
const impA = await recordAs(memberA, 'impression');
check(impA.rows[0]?.counted === true, 'member A impression is counted', impA.error?.message);

const click1 = await recordAs(memberA, 'click');
check(click1.rows[0]?.counted === true, 'first click by member A is counted', click1.error?.message);

// 2. Immediate second tap is a double tap
const tap2 = await recordAs(memberA, 'click');
check(tap2.rows[0]?.counted === false, 'double tap within 2 seconds is not counted');

const dtRows = await db.query(
  `select count(*)::int as n from public.ad_event_rejections
    where creative_id = $1 and uid = $2 and reason = 'double_tap'`,
  [creativeId, memberA],
);
check(dtRows.rows[0]?.n === 1, 'double tap is written to ad_event_rejections');

// 3. Real clicks by member A: each one is its own counted row
let counted = 0;
for (let i = 0; i < 28; i += 1) {
  await ageClicks(memberA);
  const r = await recordAs(memberA, 'click');
  if (r.rows[0]?.counted === true) counted += 1;
}
check(counted === 28, 'every separate click after the gap is counted (28/28)', String(counted));

const clickRows = await db.query(
  `select count(*)::int as n from public.ad_events
    where creative_id = $1 and uid = $2 and kind = 'click'`,
  [creativeId, memberA],
);
check(clickRows.rows[0]?.n === 29, 'member A has 29 counted click rows (1 + 28)', String(clickRows.rows[0]?.n));

// 4. Hourly cap: 29 counted in the last hour, so the 30th is allowed and the 31st is capped
await ageClicks(memberA);
const cap30 = await recordAs(memberA, 'click');
check(cap30.rows[0]?.counted === true, 'the 30th click in the hour is still counted');
await ageClicks(memberA);
const cap31 = await recordAs(memberA, 'click');
check(cap31.rows[0]?.counted === false, 'the 31st click in the hour is rejected by hourly_cap');
const capRows = await db.query(
  `select count(*)::int as n from public.ad_event_rejections
    where creative_id = $1 and uid = $2 and reason = 'hourly_cap'`,
  [creativeId, memberA],
);
check(capRows.rows[0]?.n === 1, 'hourly cap rejection is logged');

// 5. Billing and stats match the counted clicks exactly (30 counted * 500 poisha)
const stats = await db.query(
  `select coalesce(sum(clicks), 0)::int as clicks, coalesce(sum(spend), 0)::int as spend
     from public.ad_daily_stats where creative_id = $1`,
  [creativeId],
);
check(stats.rows[0]?.clicks === 30, 'daily stats count exactly the counted clicks', String(stats.rows[0]?.clicks));

const campaign = await db.query(`select spent from public.ad_campaigns where id = $1`, [campaignId]);
check(
  campaign.rows[0]?.spent === 30 * 500 && stats.rows[0]?.spend === 30 * 500,
  'campaign spend equals 30 clicks at 500 poisha each',
  String(campaign.rows[0]?.spent),
);

// 6. Another member is not blocked by member A's spam
const impB = await recordAs(memberB, 'impression');
check(impB.rows[0]?.counted === true, 'member B impression is counted');
const clickB = await recordAs(memberB, 'click');
check(clickB.rows[0]?.counted === true, 'member B click is counted even while A is capped');

// 7. Guest clicks are counted per verified viewer token
const guestToken = 'guest-device-token-clicks-0001';
const impG = await recordAs(null, 'impression', guestToken);
check(impG.rows[0]?.counted === true, 'guest impression with a verified token is counted');
const clickG = await recordAs(null, 'click', guestToken);
check(clickG.rows[0]?.counted === true, 'guest click with a verified token is counted');
const clickGTap = await recordAs(null, 'click', guestToken);
check(clickGTap.rows[0]?.counted === false, 'guest double tap is rejected');

// 8. A click without a prior impression is still discarded
const orphan = await recordAs(memberB, 'click');
check(orphan.rows.length === 1, 'orphan click call completes');
const orphanNew = await recordAs('click-member-new', 'click');
check(orphanNew.rows[0]?.counted === false, 'click without impression is not counted');

// 9. Clients cannot read the audit table
const clientRead = await run(`select count(*) from public.ad_event_rejections`, { uid: memberA });
check(
  clientRead.error !== null,
  'members cannot read ad_event_rejections directly',
  clientRead.error ? '' : 'readable',
);

console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) {
  process.exit(1);
}
