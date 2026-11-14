/** 0089: rich creative customization, platform/language/topic targeting, guest telemetry, and staff editing. */
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
const staff = 'upgrade-staff';
const owner = 'upgrade-advertiser';
const member = 'upgrade-member';

await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${staff}', 'upgrade_staff', 'Upgrade Staff', 'admin', 'active'),
    ('${owner}', 'upgrade_owner', 'Upgrade Owner', 'member', 'active'),
    ('${member}', 'upgrade_member', 'Upgrade Member', 'member', 'active');
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

async function asAnon(sql) {
  await db.exec(`set role anon; select set_config('request.jwt.claims', '{}', false);`);
  try {
    const result = await db.query(sql);
    return { rows: result.rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec('reset role');
  }
}

// 1. Fund advertiser wallet and set up rich campaign + creative
await as(staff, `select public.topup_ad_wallet('${owner}', 50000, 'pay-0089-1')`);

const badImg = await as(
  staff,
  `select public.staff_setup_campaign(
    '${owner}', 'Bad Host Ad', 'cpm', 2000, 10000, 0, now(), null,
    '{}', '{}', 'any', true,
    'feed', 'Bad image host', 'Body copy', 'https://bsdc.info.bd/jobs',
    'https://res.cloudinary.com/demo/ad.png', 'Apply'
  )`,
);
check(
  badImg.error?.code === '22023',
  'non-ImgBB image URL is rejected with 22023',
  badImg.error?.code,
);

const badHex = await as(
  staff,
  `select public.staff_setup_campaign(
    '${owner}', 'Bad Hex Ad', 'cpm', 2000, 10000, 0, now(), null,
    '{}', '{}', 'any', true,
    'feed', 'Bad accent color', 'Body copy', 'https://bsdc.info.bd/jobs',
    'https://i.ibb.co/demo/ad.webp', 'Apply',
    'https://i.ibb.co/demo/ad-sm.webp', 'Alt text', 'card', 'not-hex', 'Featured', '{web,android}'
  )`,
);
check(
  badHex.error?.code === '22023',
  'invalid accent hex is rejected with 22023',
  badHex.error?.code,
);

const setup = await as(
  staff,
  `select public.staff_setup_campaign(
    '${owner}', 'Bangla Android Promo', 'cpm', 2000, 20000, 0, now(), null,
    '{Dhaka}', '{kotlin,android}', 'bn', true,
    'feed', 'Learn Kotlin in Bangla', 'Hands-on mobile track', 'https://bsdc.info.bd/learn',
    'https://i.ibb.co/demo/kotlin.webp', 'Start learning',
    'https://i.ibb.co/demo/kotlin-sm.webp', 'Kotlin track poster', 'banner', '#15803d', 'Featured', '{android}'
  ) as campaign_id`,
);
const campaignId = setup.rows[0]?.campaign_id;
check(
  Boolean(campaignId),
  'staff_setup_campaign stores customized creative and activates',
  setup.error?.message,
);

// 2. Platform, language, topic, and city targeting in serve_ads
const webServe = await asAnon(
  `select * from public.serve_ads('feed', 2, 'web', 'bn', 'kotlin', 'Dhaka')`,
);
check(webServe.rows.length === 0, 'android-only creative does not serve to web platform');

const wrongLang = await asAnon(
  `select * from public.serve_ads('feed', 2, 'android', 'en', 'kotlin', 'Dhaka')`,
);
check(wrongLang.rows.length === 0, 'bn-only campaign does not serve to en language');

const wrongTopic = await asAnon(
  `select * from public.serve_ads('feed', 2, 'android', 'bn', 'rust', 'Dhaka')`,
);
check(wrongTopic.rows.length === 0, 'topic-targeted campaign filters mismatched topic');

const matchedServe = await asAnon(
  `select * from public.serve_ads('feed', 2, 'android', 'bn', 'kotlin', 'Dhaka')`,
);
const served = matchedServe.rows[0];
check(
  matchedServe.rows.length === 1 &&
    served?.thumb_url === 'https://i.ibb.co/demo/kotlin-sm.webp' &&
    served?.layout === 'banner' &&
    served?.accent_color === '#15803d' &&
    served?.badge_label === 'Featured',
  'matched serve_ads returns thumb_url, image_alt, layout, accent_color, and badge_label',
  matchedServe.error?.message,
);

// 3. Guest viewer_token deduplication on record_ad_event
const creativeId = served?.creative_id;
const guest1 = await asAnon(
  `select public.record_ad_event('${creativeId}', 'impression', 'guest-device-token-aaaa-1111') as counted`,
);
check(
  guest1.rows[0]?.counted === true,
  'first guest impression with viewer_token counts and bills',
  guest1.error?.message,
);

const guest1Dup = await asAnon(
  `select public.record_ad_event('${creativeId}', 'impression', 'guest-device-token-aaaa-1111') as counted`,
);
check(
  guest1Dup.rows[0]?.counted === false,
  'duplicate guest viewer_token in same bucket does not double-bill',
);

const guest2 = await asAnon(
  `select public.record_ad_event('${creativeId}', 'impression', 'guest-device-token-bbbb-2222') as counted`,
);
check(guest2.rows[0]?.counted === true, 'distinct guest viewer_token counts independently');

const anonClickNoToken = await asAnon(
  `select public.record_ad_event('${creativeId}', 'click') as counted`,
);
check(
  anonClickNoToken.rows[0]?.counted === false,
  'anonymous click without viewer_token cleanly returns false',
);

const guest1Click = await asAnon(
  `select public.record_ad_event('${creativeId}', 'click', 'guest-device-token-aaaa-1111') as counted`,
);
check(
  guest1Click.rows[0]?.counted === true,
  'guest click after matching viewer_token impression counts',
  guest1Click.error?.message,
);

const guest1ClickDup = await asAnon(
  `select public.record_ad_event('${creativeId}', 'click', 'guest-device-token-aaaa-1111') as counted`,
);
check(guest1ClickDup.rows[0]?.counted === false, 'duplicate guest click in same day is deduped');

// 4. Staff edit & permission boundaries (member denied, staff succeeds)
const memberUpdate = await as(
  member,
  `select public.staff_update_campaign('${campaignId}', 'Hacked', 'cpc', 1000, 20000, 0, null, null, false, '{}', '{}', 'any')`,
);
check(
  memberUpdate.error?.code === '42501',
  'non-staff cannot call staff_update_campaign',
  memberUpdate.error?.code,
);

const staffUpdate = await as(
  staff,
  `select public.staff_update_campaign('${campaignId}', 'Bangla Web + Android Promo', 'cpm', 2000, 25000, 0, null, null, false, '{}', '{}', 'any')`,
);
check(
  staffUpdate.error === null,
  'staff_update_campaign updates budget/language/targeting',
  staffUpdate.error?.message,
);

const updateCreative = await as(
  staff,
  `select public.staff_update_creative('${creativeId}', 'feed', 'Learn Kotlin Everywhere', 'Mobile + Web', 'https://bsdc.info.bd/learn', 'https://i.ibb.co/demo/kotlin.webp', 'Explore', 'https://i.ibb.co/demo/kotlin-sm.webp', 'Updated alt', 'native', '#0f766e', 'New', '{web,android}', true)`,
);
check(
  updateCreative.error === null,
  'staff_update_creative updates platforms and layout',
  updateCreative.error?.message,
);

const nowWeb = await asAnon(`select * from public.serve_ads('feed', 2, 'web', 'en')`);
check(
  nowWeb.rows.length === 1 &&
    nowWeb.rows[0]?.layout === 'native' &&
    nowWeb.rows[0]?.badge_label === 'New',
  'updated creative immediately serves on web after staff edit',
  nowWeb.error?.message,
);

const details = await as(staff, `select * from public.campaign_details('${campaignId}')`);
check(
  details.rows[0]?.name === 'Bangla Web + Android Promo',
  'campaign_details returns updated settings',
);

const creativeDetails = await as(
  staff,
  `select * from public.campaign_creative_details('${campaignId}')`,
);
check(
  creativeDetails.rows.length === 1 &&
    creativeDetails.rows[0]?.layout === 'native' &&
    creativeDetails.rows[0]?.badge_label === 'New' &&
    creativeDetails.rows[0]?.accent_color === '#0f766e',
  'campaign_creative_details exposes updated metadata and stats',
  creativeDetails.error?.message,
);

const toggleDisable = await as(
  staff,
  `select public.staff_set_creative_enabled('${creativeId}', false) as enabled`,
);
check(toggleDisable.rows[0]?.enabled === false, 'staff_set_creative_enabled disables creative');

const afterDisable = await asAnon(`select * from public.serve_ads('feed', 2, 'web', 'en')`);
check(afterDisable.rows.length === 0, 'disabled creative stops serving immediately');

console.log(`\n${pass} checks passed, ${bad.length} failed`);
process.exit(bad.length === 0 ? 0 : 1);
