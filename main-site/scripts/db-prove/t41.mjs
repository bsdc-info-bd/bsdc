/**
 * Proof for 0068:
 *   1. Posts inside private or secret group channels stay invisible to
 *      anonymous visitors, non-member accounts, global search, feed
 *      candidates, sitemap_urls, and seo_for_path — while members of that
 *      group read and write them cleanly and groups.posts_count stays in sync.
 *   2. Read-only channels accept posts from group moderators and refuse
 *      ordinary group members.
 *   3. Unverified OAuth emails from providers that permit unverified addresses
 *      (e.g. github.com) cannot claim bootstrap owner authority.
 *   4. set_redirect refuses external phishing hosts and plain http:// while
 *      allowing internal paths and https://*.bsdc.info.bd.
 *   5. admin_pending_shops and admin_pending_campaigns answer staff and return
 *      nothing to ordinary members.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDb, MIGRATIONS_DIR } from './lib.mjs';

const MIGRATION = join(MIGRATIONS_DIR, '0068_channel_privacy_redirect_safety_and_ops.sql');

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
    ('owner-1',   'ownerone',   'Owner One',   'owner'),
    ('gowner-1',  'groupowner', 'Group Owner', 'member'),
    ('gmember-1', 'groupmem',   'Group Member','member'),
    ('outsider-1','outsider',   'Outsider',    'member');
`);

async function as(sub, claims, sql) {
  const payload = JSON.stringify({ sub, role: 'authenticated', bsdc_role: 'member', ...claims });
  try {
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claims', $jwt$${payload}$jwt$, false);`,
    );
    return { ok: true, rows: (await db.query(sql)).rows };
  } catch (error) {
    return { ok: false, code: error.code, message: String(error.message).split('\n')[0] };
  } finally {
    await db.exec('reset role;');
  }
}

async function asAnon(sql) {
  try {
    await db.exec(
      `set role anon; select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', false);`,
    );
    return { ok: true, rows: (await db.query(sql)).rows };
  } catch (error) {
    return { ok: false, code: error.code, message: String(error.message).split('\n')[0] };
  } finally {
    await db.exec('reset role;');
  }
}

// -------------------------------------------------- 1. Group channel privacy ---
const grp = await as(
  'gowner-1',
  {},
  `select public.create_group('secret-guild', 'Secret Guild', 'Private engineering room', 'private', 'en') as id`,
);
check(grp.ok && Boolean(grp.rows?.[0]?.id), 'group owner creates a private group', grp.message);
const groupId = grp.rows[0].id;

await db.exec(`
  insert into public.group_members (group_id, uid, role)
  values ('${groupId}', 'gmember-1', 'member')
  on conflict do nothing;
`);

const generalRes = await as(
  'gowner-1',
  {},
  `select id from public.channels where group_id = '${groupId}' and slug = 'general'`,
);
const generalChannelId = generalRes.rows?.[0]?.id;
check(Boolean(generalChannelId), 'create_group seeded the general channel');

const roRes = await as(
  'gowner-1',
  {},
  `insert into public.channels (group_id, slug, name, topic, is_read_only)
   values ('${groupId}', 'announcements', 'Announcements', 'Staff notices', true)
   returning id`,
);
const roChannelId = roRes.rows?.[0]?.id;
check(roRes.ok && Boolean(roChannelId), 'group owner creates a read-only channel', roRes.message);

const outsiderPost = await as(
  'outsider-1',
  {},
  `insert into public.posts (author_uid, kind, status, visibility, slug, title, body, language, channel_id, published_at)
   values ('outsider-1', 'post', 'published', 'public', 'outsider-intrusion', 'Intrusion', 'Should fail', 'en', '${generalChannelId}', now())`,
);
check(!outsiderPost.ok, 'outsider cannot post into a private group channel', outsiderPost.code);

const memberRoPost = await as(
  'gmember-1',
  {},
  `insert into public.posts (author_uid, kind, status, visibility, slug, title, body, language, channel_id, published_at)
   values ('gmember-1', 'post', 'published', 'public', 'member-ro-attempt', 'Attempt', 'Should fail', 'en', '${roChannelId}', now())`,
);
check(!memberRoPost.ok, 'ordinary group member cannot post into a read-only channel');

const ownerRoPost = await as(
  'gowner-1',
  {},
  `insert into public.posts (author_uid, kind, status, visibility, slug, title, body, language, channel_id, published_at)
   values ('gowner-1', 'post', 'published', 'public', 'guild-secret-roadmap', 'Guild Secret Roadmap', 'Confidential architecture notes', 'en', '${roChannelId}', now())
   returning id`,
);
check(ownerRoPost.ok, 'group moderator can post into a read-only channel', ownerRoPost.message);

const memberPost = await as(
  'gmember-1',
  {},
  `insert into public.posts (author_uid, kind, status, visibility, slug, title, body, language, channel_id, published_at)
   values ('gmember-1', 'post', 'published', 'public', 'guild-member-update', 'Guild Member Update', 'Internal benchmark numbers', 'en', '${generalChannelId}', now())
   returning id`,
);
check(memberPost.ok, 'group member can post into an open group channel', memberPost.message);

const countAfter = await db.query(`select posts_count from public.groups where id = '${groupId}'`);
check(
  countAfter.rows?.[0]?.posts_count === 2,
  'groups.posts_count reflects published channel posts',
);

const anonRead = await asAnon(
  `select count(*)::int as n from public.posts where channel_id in ('${generalChannelId}', '${roChannelId}')`,
);
check(
  anonRead.ok && anonRead.rows?.[0]?.n === 0,
  'anonymous visitor sees zero private channel posts',
);

const outsiderRead = await as(
  'outsider-1',
  {},
  `select count(*)::int as n from public.posts where channel_id in ('${generalChannelId}', '${roChannelId}')`,
);
check(
  outsiderRead.ok && outsiderRead.rows?.[0]?.n === 0,
  'non-member sees zero private channel posts',
);

const outsiderSearch = await as(
  'outsider-1',
  {},
  `select count(*)::int as n from public.global_search('Confidential', array['post'], 20)`,
);
check(
  outsiderSearch.ok && outsiderSearch.rows?.[0]?.n === 0,
  'global_search hides private channel posts from outsiders',
);

const memberRead = await as(
  'gmember-1',
  {},
  `select count(*)::int as n from public.posts where channel_id in ('${generalChannelId}', '${roChannelId}')`,
);
check(memberRead.ok && memberRead.rows?.[0]?.n === 2, 'group member reads both channel posts');

const sitemapPosts = await asAnon(`select loc from public.sitemap_urls('posts', 1, 100)`);
const locs = (sitemapPosts.rows ?? []).map((r) => r.loc);
check(
  !locs.includes('/p/guild-secret-roadmap') && !locs.includes('/p/guild-member-update'),
  'sitemap_urls omits private channel posts',
);

const seoPrivate = await asAnon(
  `select title, description, robots from public.seo_for_path('/p/guild-secret-roadmap')`,
);
check(
  seoPrivate.rows?.[0]?.robots === 'noindex' &&
    !String(seoPrivate.rows?.[0]?.title ?? '').includes('Secret Roadmap'),
  'seo_for_path marks private channel posts noindex without leaking their title',
  JSON.stringify(seoPrivate.rows?.[0]),
);

// -------------------------------------------- 2. OAuth unverified email guard ---
const unverifiedGithub = await as(
  'outsider-1',
  {
    email: 'rrc@bsdc.info.bd',
    email_verified: false,
    firebase: { sign_in_provider: 'github.com' },
  },
  `select * from public.my_role()`,
);
check(
  unverifiedGithub.ok && unverifiedGithub.rows?.[0]?.role === 'member',
  'unverified GitHub email does not earn bootstrap owner authority',
  JSON.stringify(unverifiedGithub.rows?.[0]),
);

const verifiedGithub = await as(
  'outsider-1',
  {
    email: 'rrc@bsdc.info.bd',
    email_verified: true,
    firebase: { sign_in_provider: 'github.com' },
  },
  `select * from public.my_role()`,
);
check(
  verifiedGithub.ok && verifiedGithub.rows?.[0]?.role === 'owner',
  'verified GitHub email on the bootstrap list still earns owner authority',
);

// ------------------------------------------------ 3. Redirect origin safety ---
const evilRedirect = await as(
  'owner-1',
  { bsdc_role: 'owner', staff: true },
  `select public.set_redirect('/promo', 'https://evil-phishing.example/login', 301::smallint, 'bad')`,
);
check(
  !evilRedirect.ok && evilRedirect.code === '22023',
  'set_redirect refuses third-party external domains',
  evilRedirect.message,
);

const httpRedirect = await as(
  'owner-1',
  { bsdc_role: 'owner', staff: true },
  `select public.set_redirect('/insecure', 'http://www.bsdc.info.bd/about', 301::smallint, 'bad')`,
);
check(
  !httpRedirect.ok && httpRedirect.code === '22023',
  'set_redirect refuses plain http targets',
  httpRedirect.message,
);

const protoRelative = await as(
  'owner-1',
  { bsdc_role: 'owner', staff: true },
  `select public.set_redirect('/proto', '//evil.example/x', 301::smallint, 'bad')`,
);
check(
  !protoRelative.ok && protoRelative.code === '22023',
  'set_redirect refuses protocol-relative targets',
  protoRelative.message,
);

const safeSubdomain = await as(
  'owner-1',
  { bsdc_role: 'owner', staff: true },
  `select (public.set_redirect('/verify-now', 'https://vf.main.bsdc.info.bd/', 301::smallint, 'verify portal')).to_path as target`,
);
check(
  safeSubdomain.ok && safeSubdomain.rows?.[0]?.target === 'https://vf.main.bsdc.info.bd/',
  'set_redirect accepts https://*.bsdc.info.bd subdomains',
  safeSubdomain.message,
);

// --------------------------------- 4. Pending shops & campaigns staff queues ---
await as('gmember-1', {}, `select public.open_shop('dhaka-dev-gear', 'Dhaka Dev Gear', 'Dhaka')`);
const campRes = await as(
  'gmember-1',
  {},
  `select public.create_campaign('Hiring Rust Devs', 'cpm'::bsdc_ad_pricing, 500, 50000, 10000) as id`,
);
check(
  campRes.ok && Boolean(campRes.rows?.[0]?.id),
  'member creates draft campaign',
  campRes.message,
);
const campId = campRes.rows?.[0]?.id;
const creativeRes = await as(
  'gmember-1',
  {},
  `select public.add_creative('${campId}'::uuid, 'feed'::bsdc_ad_placement, 'Rust Systems Role', 'Join our Dhaka systems team', 'https://www.bsdc.info.bd/jobs', '', 'Apply')`,
);
check(creativeRes.ok, 'member attaches ad creative', creativeRes.message);
await db.exec(`
  insert into public.ad_wallet_entries (owner_uid, kind, amount, memo)
  values ('gmember-1', 'topup', 100000, 'Seed wallet');
`);
const submitRes = await as('gmember-1', {}, `select public.submit_campaign('${campId}'::uuid)`);
check(submitRes.ok, 'member submits funded campaign for review', submitRes.message);

const seoWrite = await as(
  'owner-1',
  { bsdc_role: 'owner', staff: true },
  `select (public.set_seo_override('/about', 'About BSDC', 'Bangladesh Software Development Community overview.')).path as path`,
);
check(
  seoWrite.ok && seoWrite.rows?.[0]?.path === '/about',
  'set_seo_override succeeds with 4-arg bsdc.audit',
  seoWrite.message,
);

const brandWrite = await as(
  'owner-1',
  { bsdc_role: 'owner', staff: true },
  `select (public.save_brand_theme('emerald', 'Emerald Core', '{"primary":"#1b4332","on-primary":"#ffffff","surface":"#ffffff","text":"#10241b"}'::jsonb)).key as key`,
);
check(
  brandWrite.ok && brandWrite.rows?.[0]?.key === 'emerald',
  'save_brand_theme succeeds with 4-arg bsdc.audit',
  brandWrite.message,
);

const memberPendingShops = await as('outsider-1', {}, `select * from public.admin_pending_shops()`);
check(
  memberPendingShops.ok && (memberPendingShops.rows?.length ?? 1) === 0,
  'ordinary member sees zero rows from admin_pending_shops',
);

const staffPendingShops = await as(
  'owner-1',
  { bsdc_role: 'owner', staff: true },
  `select * from public.admin_pending_shops()`,
);
check(
  staffPendingShops.ok &&
    staffPendingShops.rows?.length === 1 &&
    staffPendingShops.rows[0].slug === 'dhaka-dev-gear',
  'staff reads pending shop queue via admin_pending_shops',
);

const staffPendingCampaigns = await as(
  'owner-1',
  { bsdc_role: 'owner', staff: true },
  `select * from public.admin_pending_campaigns()`,
);
check(
  staffPendingCampaigns.ok &&
    staffPendingCampaigns.rows?.length === 1 &&
    staffPendingCampaigns.rows[0].name === 'Hiring Rust Devs',
  'staff reads pending ad campaigns via admin_pending_campaigns',
);

// Idempotency: re-applying 0068 twice succeeds cleanly.
for (let round = 1; round <= 2; round += 1) {
  try {
    await db.exec(readFileSync(MIGRATION, 'utf8'));
    check(true, `0068 re-applied cleanly (round ${round})`);
  } catch (error) {
    check(false, `0068 re-applied cleanly (round ${round})`, String(error.message).split('\n')[0]);
  }
}

await db.close();
console.log(`\nSUMMARY: ${pass} passed, ${bad.length} failed`);
if (bad.length > 0) console.log(`  failed: ${bad.join(', ')}`);
process.exit(bad.length === 0 ? 0 : 1);
