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

const db = await makeDb();

async function asCaller(uid, role, sql, params = []) {
  const claims = JSON.stringify({
    sub: uid,
    role: 'authenticated',
    bsdc_role: role,
    staff: role !== 'member',
  });
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
check(
  memberCreate.error !== null,
  'a member cannot create a campaign',
  memberCreate.error?.code ?? 'it was allowed',
);
check(
  /permission|not yours/i.test(memberCreate.error?.message ?? ''),
  'and is refused on the rule, not on a parse error',
  (memberCreate.error?.message ?? '').split('\n')[0],
);

const memberIssue = await asAdvertiser(`
  select * from public.issue_advertiser_account('${stranger}', 'Anybody', null, '')`);
check(
  memberIssue.error?.code === '42501',
  'a member cannot issue advertiser credentials',
  memberIssue.error?.message ?? 'it was allowed',
);

// The account is created first, because a campaign has to be billed to
// somebody. This is the order an operator works in.
const firstIssue = await asOwner(`
  select * from public.issue_advertiser_account('${advertiser}', 'Winter Intake Co', null, 'ads@example.test')`);
check(
  firstIssue.error === null,
  'an advertiser account is created by staff',
  firstIssue.error?.message ?? '',
);
check(firstIssue.rows[0]?.created === true, 'and it is new');
check(
  typeof firstIssue.rows[0]?.username === 'string',
  'with a handle derived from the name',
  String(firstIssue.rows[0]?.username),
);

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
check(
  tooLow.error?.code === '22023',
  'a bid below the configured floor is refused',
  tooLow.error?.message.split('\n')[0] ?? '',
);

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
check(
  activated.error === null,
  'a funded campaign may be created already live',
  activated.error?.message ?? '',
);
const liveId = activated.rows[0]?.id;

// A creative, on each, so there is something to serve and to report on.
const creative = await asOwner(`
  select public.staff_add_creative('${campaignId}', 'feed', 'Learn to ship',
    'Twelve weeks, part time.', 'https://bsdc.info.bd/learn', '', 'Read more') as id`);
check(
  creative.error === null,
  'staff add a creative on the owner behalf',
  creative.error?.message ?? '',
);
const liveCreative = await asOwner(`
  select public.staff_add_creative('${liveId}', 'feed', 'Winter intake is open',
    'Apply before December.', 'https://bsdc.info.bd/learn', '', 'Apply') as id`);
const liveCreativeId = liveCreative.rows[0]?.id;
check(typeof liveCreativeId === 'string', 'the live campaign has a creative');

// ---------------------------------------------------------------------------
// 4. The owner's credentials
// ---------------------------------------------------------------------------
const handle = firstIssue.rows[0]?.username;

const issuedAgain = await asOwner(`
  select * from public.issue_advertiser_account('${advertiser}', 'A Different Name', 'other', '')`);
check(issuedAgain.error === null, 'issuing twice is not an error');
check(issuedAgain.rows[0]?.created === false, 'issuing twice creates nothing');
check(
  issuedAgain.rows[0]?.username === handle,
  'and does not rename or re-handle anybody',
  String(issuedAgain.rows[0]?.username),
);

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
check(
  performance.error === null,
  'the owner reads the performance of their own campaign',
  performance.error?.message ?? '',
);
const row = performance.rows[0] ?? {};
check(
  row.impressions === 1500,
  'impressions are the sum of the daily rows',
  String(row.impressions),
);
check(row.clicks === 35, 'clicks are the sum of the daily rows', String(row.clicks));
check(row.spent === 1800, 'spend is what was charged', String(row.spent));
check(
  Number(row.ctr) === 2.33,
  'the click-through rate is derived, not left to the screen',
  String(row.ctr),
);
check(row.cost_per_click !== undefined, 'cost per click is answered');
check(
  row.cost_per_mille === Math.floor((1800 * 1000) / 1500),
  'cost per thousand impressions is answered',
  `${row.cost_per_mille}`,
);
check(row.budget_used_pct !== undefined, 'and the share of budget spent');
check(row.remaining === 500000 - 1800, 'and what is left', String(row.remaining));
check(
  row.impressions_today === 500,
  'today is separated from the run',
  String(row.impressions_today),
);
check(
  row.wallet_balance === 600000,
  'the wallet balance is on the same page as the spend',
  String(row.wallet_balance),
);

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
check(
  creatives.error === null,
  'the per-creative breakdown answers',
  creatives.error?.message ?? '',
);
check(creatives.rows.length === 1, 'with one row per creative', String(creatives.rows.length));
check(
  creatives.rows[0]?.headline === 'Learn to ship',
  'and the copy the owner wrote',
  creatives.rows[0]?.headline ?? '',
);

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
const strangerPeek = await asCaller(
  stranger,
  'member',
  `select * from public.campaign_performance('${campaignId}')`,
);
check(
  strangerPeek.error?.code === '42501',
  'a stranger cannot read a campaign that is not theirs',
  strangerPeek.error?.code ?? 'it was allowed',
);

const strangerBook = await asCaller(stranger, 'member', `select * from public.campaign_book(50)`);
check(
  strangerBook.error === null && strangerBook.rows.length === 0,
  'and their campaign book is empty, not an error',
  `${strangerBook.rows.length} rows`,
);

const strangerOwners = await asCaller(stranger, 'member', `select * from public.campaign_owners()`);
check(strangerOwners.error !== null, 'the owner directory is not readable by a member');
check(
  strangerOwners.error?.code === '42501',
  'and is refused on permission',
  strangerOwners.error?.code ?? '',
);

const staffSeesAll = await asOwner(`select * from public.campaign_book(50)`);
check(
  staffSeesAll.rows.length === 2,
  'staff see every campaign in the book',
  String(staffSeesAll.rows.length),
);

const directory = await asOwner(`select * from public.campaign_owners('', 50)`);
check(directory.error === null, 'staff read the owner directory', directory.error?.message ?? '');
const listed = directory.rows.find((entry) => entry.uid === advertiser);
check(listed !== undefined, 'and the advertiser is in it');
check(listed?.campaigns === 2, 'with a count of their campaigns', String(listed?.campaigns));
check(listed?.wallet_balance === 600000, 'and their wallet', String(listed?.wallet_balance));

const inventory = await asOwner(`select * from public.ad_inventory()`);
check(
  inventory.error === null,
  'staff read the inventory they are booking',
  inventory.error?.message ?? '',
);
check(inventory.rows.length > 0, 'with a row per placement', String(inventory.rows.length));
check(
  inventory.rows.every((entry) => entry.floor_bid >= 100),
  'and the configured bid floor',
);

// ---------------------------------------------------------------------------
// 7. Reporting opens no write
// ---------------------------------------------------------------------------
const bidChange = await asAdvertiser(
  `update public.ad_campaigns set bid = 1400 where id = '${campaignId}'`,
);
check(
  bidChange.error?.code === '42501',
  'the owner cannot change their own bid even to a valid amount',
  bidChange.error?.message ?? 'it was allowed',
);

const budgetChange = await asAdvertiser(
  `update public.ad_campaigns set total_budget = 600000 where id = '${campaignId}'`,
);
check(
  budgetChange.error?.code === '42501',
  'nor their budget even to a valid amount',
  budgetChange.error?.message ?? 'it was allowed',
);

const topUp = await asAdvertiser(`select public.topup_ad_wallet('${advertiser}', 1000000)`);
check(topUp.error !== null, 'nor credit their own wallet');

const ownCreate = await asAdvertiser(`
  select public.staff_create_campaign('${advertiser}', 'Mine now', 'cpm', 1200, 500000)`);
check(ownCreate.error !== null, 'owning a campaign does not let the owner create the next one');

const legacyCreate = await asAdvertiser(
  `select public.create_campaign('Legacy attempt', 'cpm', 1200, 100000)`,
);
check(legacyCreate.error?.code === '42501', 'the legacy create RPC also refuses an advertiser');
const directInsert = await asAdvertiser(`
  insert into public.ad_campaigns(owner_uid, name, pricing, bid, total_budget, daily_budget)
  values ('${advertiser}', 'Direct attempt', 'cpm', 1200, 100000, 0)`);
check(directInsert.error?.code === '42501', 'a direct table insert cannot create a campaign');
const directCreative = await asAdvertiser(
  `update public.ad_creatives set headline = 'Unreviewed text' where id = '${liveCreativeId}'`,
);
check(directCreative.error?.code === '42501', 'direct creative edits cannot bypass review');
const ownerAdd = await asAdvertiser(`
  select public.staff_add_creative('${liveId}', 'feed', 'Unreviewed copy', 'Body', 'https://bsdc.info.bd/test')`);
check(ownerAdd.error?.code === '42501', 'the staff creative RPC refuses an advertiser');
const legacyAdd = await asAdvertiser(`
  select public.add_creative('${liveId}', 'feed', 'Unreviewed copy', 'Body', 'https://bsdc.info.bd/test')`);
check(legacyAdd.error?.code === '42501', 'the legacy creative RPC refuses an advertiser');
const ownerSubmit = await asAdvertiser(`select public.submit_campaign('${campaignId}')`);
check(ownerSubmit.error?.code === '42501', 'only staff can submit a draft');
const ownerApprove = await asAdvertiser(`select public.decide_campaign('${campaignId}', true)`);
check(ownerApprove.error?.code === '42501', 'an advertiser cannot approve a campaign');

// The owner may pause and resume what is live: that is a decision about their
// own money, not about the platform's.
const paused = await asAdvertiser(`select public.set_campaign_paused('${liveId}', true) as status`);
check(
  paused.error === null,
  'the owner may pause their own live campaign',
  paused.error?.message ?? '',
);
check(paused.rows[0]?.status === 'paused', 'and it is paused', String(paused.rows[0]?.status));
const resumed = await asAdvertiser(
  `select public.set_campaign_paused('${liveId}', false) as status`,
);
check(resumed.rows[0]?.status === 'active', 'and resume it');

const strangerEdit = await asCaller(
  stranger,
  'member',
  `select public.edit_campaign_creative('${liveCreativeId}', 'Other person', 'Body', 'Go')`,
);
check(strangerEdit.error?.code === '42501', 'a stranger cannot edit another owner’s copy');
const edited = await asAdvertiser(
  `select public.edit_campaign_creative('${liveCreativeId}', 'New headline', 'New copy', 'Learn more')`,
);
check(
  edited.error === null,
  'the owner can edit their own creative copy',
  edited.error?.message ?? '',
);
const changedCreative = await db.query(`
  select c.headline, c.body, c.cta_label, c.placement, c.target_url, a.status
  from public.ad_creatives c join public.ad_campaigns a on a.id = c.campaign_id
  where c.id = '${liveCreativeId}'`);
check(
  changedCreative.rows[0]?.status === 'pending_review',
  'editing active copy sends it back for review',
);
check(
  changedCreative.rows[0]?.headline === 'New headline' &&
    changedCreative.rows[0]?.body === 'New copy',
  'the edited words are saved',
);
check(
  changedCreative.rows[0]?.placement === 'feed' &&
    changedCreative.rows[0]?.target_url === 'https://bsdc.info.bd/learn',
  'editing copy does not change the placement or destination',
);
const unreviewedResume = await asAdvertiser(
  `select public.set_campaign_paused('${liveId}', false)`,
);
check(unreviewedResume.error?.code === '22023', 'an owner cannot resume around review');
const approved = await asOwner(`select public.decide_campaign('${liveId}', true) as status`);
check(
  approved.error === null && approved.rows[0]?.status === 'active',
  'staff can approve the changed copy',
  approved.error?.message ?? '',
);
const pausedAgain = await asAdvertiser(`select public.set_campaign_paused('${liveId}', true)`);
check(pausedAgain.error === null, 'the approved campaign can be paused again');
const editedPaused = await asAdvertiser(
  `select public.edit_campaign_creative('${liveCreativeId}', 'Paused headline', 'Updated copy', 'Go')`,
);
check(editedPaused.error === null, 'the owner can edit paused copy');
const pausedStatus = await db.query(
  `select status from public.ad_campaigns where id = '${liveId}'`,
);
check(pausedStatus.rows[0]?.status === 'pending_review', 'paused copy also goes to review');
const bypassPaused = await asAdvertiser(`select public.set_campaign_paused('${liveId}', false)`);
check(bypassPaused.error?.code === '22023', 'paused edits cannot be resumed without approval');

const collision = await asOwner(
  `select * from public.issue_advertiser_account('firebase-collision', 'Winter Intake Co', null, '')`,
);
check(
  collision.error === null,
  'another business with the same name can be issued a handle',
  collision.error?.message ?? '',
);
check(
  /^[a-z0-9][a-z0-9_]{1,22}[a-z0-9]$/.test(collision.rows[0]?.username ?? ''),
  'the collision handle satisfies the actual profile constraint',
  String(collision.rows[0]?.username),
);
check(collision.rows[0]?.username !== handle, 'the collision handle is distinct');

const otherPeek = await asCaller(
  stranger,
  'member',
  `select * from public.campaign_performance('${liveId}')`,
);
check(otherPeek.error !== null, 'and pausing did not open the other campaign to a stranger');

// The builder is one transaction, and only staff can invoke it.
const setup = (name, activate, headline, target) => `select public.staff_setup_campaign(
  '${advertiser}', '${name}', 'cpm', 1500, 100000, 0, now(), null, '{}', '{}', 'any',
  ${activate}, 'shop', '${headline}', '', '${target}', '', '') as id`;
const forbiddenSetup = await asAdvertiser(setup('Not permitted', false, '', ''));
check(forbiddenSetup.error?.code === '42501', 'the atomic staff builder refuses an advertiser');
const failedSetup = await asOwner(setup('Must roll back', true, '', ''));
check(failedSetup.error?.code === '22023', 'immediate activation without a creative is refused');
const absentPartial = await db.query(
  `select count(*)::integer as n from public.ad_campaigns where name = 'Must roll back'`,
);
check(absentPartial.rows[0]?.n === 0, 'a failed builder leaves no half-created campaign');
const goodSetup = await asOwner(
  setup('Atomic funded campaign', true, 'Shop the collection', 'https://bsdc.info.bd/shop'),
);
check(
  goodSetup.error === null,
  'staff can create, supply a creative and approve in one transaction',
  goodSetup.error?.message ?? '',
);
const built = await db.query(
  `select a.status, c.placement from public.ad_campaigns a join public.ad_creatives c on c.campaign_id = a.id where a.id = $1`,
  [goodSetup.rows[0]?.id],
);
check(
  built.rows[0]?.status === 'active' && built.rows[0]?.placement === 'shop',
  'the atomic campaign is live with its valid shop placement',
);
const searchResult = await asOwner(`select * from public.campaign_owners('Winter Intake Co', 100)`);
check(
  searchResult.rows.length === 2 &&
    searchResult.rows.every((row) => row.display_name === 'Winter Intake Co'),
  'owner search includes newly issued accounts and excludes unrelated campaign owners',
);

console.log(`\nSUMMARY: ${pass} passed, ${bad.length} failed`);
for (const label of bad) console.log('  failed: ' + label);
process.exit(bad.length === 0 ? 0 : 1);
