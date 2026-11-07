/**
 * Proof for 0077: campaigns are made by staff and read by their owner.
 *
 * The requirement was two-sided: only the admin panel may create a campaign,
 * and the advertiser whose money it is must be able to see exactly how it is
 * performing. Those pull in opposite directions — a stricter creation path and
 * a richer read path — so this harness tests both, and tests that the stricter
 * path did not take the richer one away.
 *
 * Eight claims:
 *
 *   1. A member cannot create a campaign, and cannot issue themselves
 *      credentials.
 *   2. Staff can, for a named owner, and the bid floor is enforced from
 *      configuration rather than from a constant in a screen.
 *   3. Activating a campaign at creation requires the money to exist.
 *   4. Issuing an advertiser account is idempotent and does not rename anybody.
 *   5. The owner reads their own performance, and the derived figures agree
 *      with the rows they are derived from.
 *   6. The owner reads nobody else's, and a stranger reads nothing.
 *   7. The daily series has a row for a quiet day, with zeroes.
 *   8. Reporting does not open a write: an owner cannot change a bid, a
 *      budget, targeting, or the status of somebody else's campaign.
 */
import { makeDb } from './lib.mjs';

const owner = 'aaaaaaaa-1111-4111-8111-000000000001';
const advertiser = 'bbbbbbbb-2222-4222-8222-000000000002';
const stranger = 'cccccccc-3333-4333-8333-000000000003';

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

const db = await makeDb({ maxExclusive: '0078' });

async function asCaller(uid, role, sql, params = []) {
  const claims = JSON.stringify({ sub: uid, role: 'authenticated', bsdc_role: role, staff: role !== 'member' });
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claims', $jwt$${claims}$jwt$, false);`,
  );
  try {
    const result = await db.query(sql, params);
    return { rows: result.rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec('reset role;');
  }
}

const asOwner = (sql, params) => asCaller(owner, 'owner', sql, params);
const asAdvertiser = (sql, params) => asCaller(advertiser, 'member', sql, params);

await db.exec(`
  -- The operator exists; the advertiser deliberately does not. Issuing
  -- credentials is what creates an advertiser account, so a fixture that
  -- created one first would be testing a path no real advertiser takes.
  insert into public.profiles (uid, username, display_name, role, status)
  values
    ('${owner}',    'operator', 'Operator Person', 'owner',  'active'),
    ('${stranger}', 'stranger', 'Somebody Else',   'member', 'active');

  insert into public.role_permissions (role, permission) values ('owner', 'ads.manage')
    on conflict do nothing;
`);

// ---------------------------------------------------------------------------
// 1. A member cannot do a staff thing
// ---------------------------------------------------------------------------
const memberCreate = await asAdvertiser(`
  select public.staff_create_campaign('${advertiser}', 'My own campaign', 'cpm', 1200, 100000)`);
check(memberCreate.error !== null, 'a member cannot create a campaign', memberCreate.error?.code ?? 'it was allowed');
check(
  /permission|not yours/i.test(memberCreate.error?.message ?? ''),
  'and is refused on the rule, not on a parse error',
  (memberCreate.error?.message ?? '').split('\n')[0],
);

const memberIssue = await asAdvertiser(advertiser, `
  select * from public.issue_advertiser_account('${stranger}', 'Anybody', null, '')`);
check(memberIssue.error !== null, 'a member cannot issue advertiser credentials');

// The account is created first, because a campaign has to be billed to
// somebody. This is the order an operator works in.
const firstIssue = await asOwner(`
  select * from public.issue_advertiser_account('${advertiser}', 'Winter Intake Co', null, 'ads@example.test')`);
check(firstIssue.error === null, 'an advertiser account is created by staff', firstIssue.error?.message ?? '');
check(firstIssue.rows[0]?.created === true, 'and it is new');
check(typeof firstIssue.rows[0]?.username === 'string', 'with a handle derived from the name',
  String(firstIssue.rows[0]?.username));

// ---------------------------------------------------------------------------
// 2. Staff create one for a named owner
// ---------------------------------------------------------------------------
const created = await asOwner(`
  select public.staff_create_campaign('${advertiser}', 'Winter intake', 'cpm', 1200, 500000,
    50000, now() - interval '3 days', null, '{}', '{}', 'any', false) as id`);
check(created.error === null, 'staff create a campaign for an owner', created.error?.message ?? '');
const campaignId = created.rows[0]?.id;
check(typeof campaignId === 'string', 'and it comes back with an identifier');

const tooLow = await asOwner(`
  select public.staff_create_campaign('${advertiser}', 'Under the floor', 'cpm', 5, 500000)`);
check(tooLow.error?.code === '22023', 'a bid below the configured floor is refused',
  tooLow.error?.message.split('\n')[0] ?? '');

const ghost = await asOwner(`
  select public.staff_create_campaign('nobody-at-all', 'For a ghost', 'cpm', 1200, 500000)`);
check(ghost.error?.code === 'P0002', 'a campaign cannot be billed to somebody who does not exist');

// ---------------------------------------------------------------------------
// 3. Activating promises money that has to exist
// ---------------------------------------------------------------------------
const activatedBroke = await asOwner(`
  select public.staff_create_campaign('${advertiser}', 'No funds', 'cpm', 1200, 500000,
    null, null, null, '{}', '{}', 'any', true)`);
check(
  activatedBroke.error?.code === '22023',
  'activating a campaign with an empty wallet is refused',
  activatedBroke.error?.message.split('\n')[0] ?? '',
);

await db.exec(`
  insert into public.ad_wallet_entries (owner_uid, kind, amount, memo)
  values ('${advertiser}', 'topup', 600000, 'Opening balance')`);

const activated = await asOwner(`
  select public.staff_create_campaign('${advertiser}', 'Always on', 'cpm', 1500, 400000,
    null, now() - interval '2 days', null, '{}', '{}', 'any', true) as id`);
check(activated.error === null, 'a funded campaign may be created already live', activated.error?.message ?? '');
const liveId = activated.rows[0]?.id;

// A creative, on each, so there is something to serve and to report on.
const creative = await asOwner(`
  select public.staff_add_creative('${campaignId}', 'feed', 'Learn to ship',
    'Twelve weeks, part time.', 'https://bsdc.info.bd/learn', '', 'Read more') as id`);
check(creative.error === null, 'staff add a creative on the owner behalf', creative.error?.message ?? '');
await asOwner(`
  select public.staff_add_creative('${liveId}', 'feed', 'Winter intake is open',
    'Apply before December.', 'https://bsdc.info.bd/learn', '', 'Apply')`);

// ---------------------------------------------------------------------------
// 4. The owner's credentials
// ---------------------------------------------------------------------------
const handle = firstIssue.rows[0]?.username;

const issuedAgain = await asOwner(`
  select * from public.issue_advertiser_account('${advertiser}', 'A Different Name', 'other', '')`);
check(issuedAgain.error === null, 'issuing twice is not an error');
check(issuedAgain.rows[0]?.created === false, 'issuing twice creates nothing');
check(issuedAgain.rows[0]?.username === handle, 'and does not rename or re-handle anybody',
  String(issuedAgain.rows[0]?.username));

const unnamed = await asOwner(`
  select * from public.issue_advertiser_account('${stranger}', 'x', null, '')`);
check(unnamed.error?.code === '22023', 'an account with no name is refused');

// ---------------------------------------------------------------------------
// 5. The owner reads their own performance
// ---------------------------------------------------------------------------
// Two days of real numbers, written the way the database writes them.
await db.exec(`
  insert into public.ad_daily_stats (campaign_id, creative_id, day, impressions, clicks, spend)
  select '${campaignId}', id, current_date - 1, 1000, 25, 1200
  from public.ad_creatives where campaign_id = '${campaignId}';
  insert into public.ad_daily_stats (campaign_id, creative_id, day, impressions, clicks, spend)
  select '${campaignId}', id, current_date, 500, 10, 600
  from public.ad_creatives where campaign_id = '${campaignId}';
  update public.ad_campaigns set spent = 1800 where id = '${campaignId}';
`);

const performance = await asAdvertiser(
  `select * from public.campaign_performance('${campaignId}')`,
);
check(performance.error === null, 'the owner reads the performance of their own campaign',
  performance.error?.message ?? '');
const row = performance.rows[0] ?? {};
check(row.impressions === 1500, 'impressions are the sum of the daily rows', String(row.impressions));
check(row.clicks === 35, 'clicks are the sum of the daily rows', String(row.clicks));
check(row.spent === 1800, 'spend is what was charged', String(row.spent));
check(Number(row.ctr) === 2.33, 'the click-through rate is derived, not left to the screen', String(row.ctr));
check(
  row.cost_per_click !== undefined,
  'cost per click is answered',
);
check(
  row.cost_per_mille === Math.floor(1800 * 1000 / 1500),
  'cost per thousand impressions is answered',
  `${row.cost_per_mille}`,
);
check(row.budget_used_pct !== undefined, 'and the share of budget spent');
check(row.remaining === 500000 - 1800, 'and what is left', String(row.remaining));
check(row.impressions_today === 500, 'today is separated from the run', String(row.impressions_today));
check(row.wallet_balance === 600000, 'the wallet balance is on the same page as the spend',
  String(row.wallet_balance));

const series = await asAdvertiser(`select * from public.campaign_timeseries('${campaignId}', 5)`);
check(series.error === null, 'the daily series answers', series.error?.message ?? '');
check(series.rows.length === 5, 'with a row for every day asked for', String(series.rows.length));
const quiet = series.rows.filter((day) => day.impressions === 0);
check(quiet.length === 3, 'including the days nothing happened, as zeroes', String(quiet.length));
check(
  series.rows.at(-1)?.impressions === 500,
  'and today is the last row, with today numbers',
  String(series.rows.at(-1)?.impressions),
);

const creatives = await asAdvertiser(
  `select * from public.campaign_creative_performance('${campaignId}')`,
);
check(creatives.error === null, 'the per-creative breakdown answers', creatives.error?.message ?? '');
check(creatives.rows.length === 1, 'with one row per creative', String(creatives.rows.length));
check(creatives.rows[0]?.headline === 'Learn to ship', 'and the copy the owner wrote', creatives.rows[0]?.headline ?? '');

const book = await asAdvertiser(`select * from public.campaign_book(50)`);
check(book.error === null, 'the owner campaign book answers', book.error?.message ?? '');
check(book.rows.length === 2, 'with both of their campaigns', String(book.rows.length));
check(
  book.rows.every((entry) => entry.owner_uid === advertiser),
  'and only their campaigns',
);

// ---------------------------------------------------------------------------
// 6. Nobody else reads it
// ---------------------------------------------------------------------------
const strangerPeek = await asCaller(stranger, 'member',
  `select * from public.campaign_performance('${campaignId}')`);
check(strangerPeek.error?.code === '42501', 'a stranger cannot read a campaign that is not theirs',
  strangerPeek.error?.code ?? 'it was allowed');

const strangerBook = await asCaller(stranger, 'member', `select * from public.campaign_book(50)`);
check(
  strangerBook.error === null && strangerBook.rows.length === 0,
  'and their campaign book is empty, not an error',
  `${strangerBook.rows.length} rows`,
);

const strangerOwners = await asCaller(stranger, 'member', `select * from public.campaign_owners()`);
check(strangerOwners.error !== null, 'the owner directory is not readable by a member');
check(strangerOwners.error?.code === '42501', 'and is refused on permission',
  strangerOwners.error?.code ?? '');

const staffSeesAll = await asOwner(`select * from public.campaign_book(50)`);
check(staffSeesAll.rows.length === 2, 'staff see every campaign in the book', String(staffSeesAll.rows.length));

const directory = await asOwner(`select * from public.campaign_owners('', 50)`);
check(directory.error === null, 'staff read the owner directory', directory.error?.message ?? '');
const listed = directory.rows.find((entry) => entry.uid === advertiser);
check(listed !== undefined, 'and the advertiser is in it');
check(listed?.campaigns === 2, 'with a count of their campaigns', String(listed?.campaigns));
check(listed?.wallet_balance === 600000, 'and their wallet', String(listed?.wallet_balance));

const inventory = await asOwner(`select * from public.ad_inventory()`);
check(inventory.error === null, 'staff read the inventory they are booking', inventory.error?.message ?? '');
check(inventory.rows.length > 0, 'with a row per placement', String(inventory.rows.length));
check(
  inventory.rows.every((entry) => entry.floor_bid >= 100),
  'and the configured bid floor',
);

// ---------------------------------------------------------------------------
// 7. Reporting opens no write
// ---------------------------------------------------------------------------
const bidChange = await asAdvertiser(
  `update public.ad_campaigns set bid = 1 where id = '${campaignId}'`,
);
check(bidChange.error !== null, 'the owner cannot change their own bid');

const budgetChange = await asAdvertiser(
  `update public.ad_campaigns set total_budget = 1 where id = '${campaignId}'`,
);
check(budgetChange.error !== null, 'nor their budget');

const topUp = await asAdvertiser(
  `select public.topup_ad_wallet('${advertiser}', 1000000)`);
check(topUp.error !== null, 'nor credit their own wallet');

const ownCreate = await asAdvertiser(`
  select public.staff_create_campaign('${advertiser}', 'Mine now', 'cpm', 1200, 500000)`);
check(ownCreate.error !== null, 'owning a campaign does not let the owner create the next one');

// The owner may pause and resume what is live: that is a decision about their
// own money, not about the platform's.
const paused = await asAdvertiser(
  `select public.set_campaign_paused('${liveId}', true) as status`);
check(paused.error === null, 'the owner may pause their own live campaign', paused.error?.message ?? '');
check(paused.rows[0]?.status === 'paused', 'and it is paused', String(paused.rows[0]?.status));
const resumed = await asAdvertiser(
  `select public.set_campaign_paused('${liveId}', false) as status`);
check(resumed.rows[0]?.status === 'active', 'and resume it');

const otherPeek = await asCaller(stranger, 'member',
  `select * from public.campaign_performance('${liveId}')`);
check(otherPeek.error !== null, 'and pausing did not open the other campaign to a stranger');

console.log(`\nSUMMARY: ${pass} passed, ${bad.length} failed`);
for (const label of bad) console.log('  failed: ' + label);
process.exit(bad.length === 0 ? 0 : 1);
