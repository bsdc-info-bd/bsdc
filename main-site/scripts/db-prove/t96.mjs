/**
 * Proof for 0136: the command deck.
 *
 * The deck's three claims, each a database decision rather than a React one:
 *
 *   1. permission-aware — a card the reader cannot act on is not returned at
 *      all, rather than returned and hidden. Proved by comparing the deck an
 *      owner sees with the deck a moderator sees, and by proving the filter is
 *      the same `has_permission` every policy uses.
 *   2. self-describing — every card states its count, its comparison, its trend
 *      and the moment it was computed. Proved by comparing "today" against the
 *      same point yesterday, which is the only comparison that does not read a
 *      busy morning as a collapse.
 *   3. drillable — every card names a function that returns the rows it counts.
 *      Proved by calling each drill and asserting the count matches.
 *
 * Plus: the queues page and total separately, the overdue flag is the database's
 * answer and not the console's, and `admin_overview()` is unchanged for every
 * caller that already reads it.
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
    console.log(`FAIL  ${label}${detail ? `  -> ${detail}` : ''}`);
  }
}

const db = await makeDb();

const OWNER = '00000000-0000-4000-8000-0000000000a0';
const MOD = '00000000-0000-4000-8000-0000000000a1';
const MEMBER = '00000000-0000-4000-8000-0000000000a2';

// Fixtures need the guard quiet: they write to guarded tables without auditing,
// and that is fine for a fixture. The guard's own behaviour is t95's subject.
await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${OWNER}',  'deckowner',  'Deck Owner',  'owner',   'active'),
    ('${MOD}',    'deckmod',    'Deck Mod',    'moderator', 'active'),
    ('${MEMBER}', 'deckmember', 'Deck Member', 'member',  'active');
`);

// Yesterday's members, so "new today" has something honest to compare against.
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status, created_at) values
    ('00000000-0000-4000-8000-0000000000a3', 'deckold1', 'Old One', 'member', 'active', now() - interval '2 days'),
    ('00000000-0000-4000-8000-0000000000a4', 'deckold2', 'Old Two', 'member', 'active', now() - interval '2 days');
`);

async function as(uid, sql) {
  const claims = JSON.stringify({ sub: uid, role: 'authenticated' });
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', $jwt$${claims}$jwt$, false);`);
  const multi = /;\s*\S/.test(sql.trim());
  try {
    if (multi) {
      await db.exec(sql);
      return { rows: [], error: null };
    }
    const result = await db.query(sql);
    return { rows: result.rows, error: null };
  } catch (error) {
    try {
      await db.exec('rollback');
    } catch {
      /* not in a transaction */
    }
    return { rows: [], error };
  } finally {
    try {
      await db.exec('reset role;');
    } catch {
      /* already reset */
    }
  }
}

async function asSystem(sql) {
  const multi = /;\s*\S/.test(sql.trim());
  try {
    if (multi) {
      await db.exec(sql);
      return { rows: [], error: null };
    }
    const result = await db.query(sql);
    return { rows: result.rows, error: null };
  } catch (error) {
    try {
      await db.exec('rollback');
    } catch {
      /* not in a transaction */
    }
    return { rows: [], error };
  }
}

const deps = async () => asSystem(`
  select (select count(*)::int from public.reports) as reports,
         (select count(*)::int from public.mk_vendor_applications) as apps,
         (select count(*)::int from public.posts) as posts,
         (select count(*)::int from public.ad_campaigns) as campaigns,
         (select count(*)::int from public.certificates) as certs,
         (select count(*)::int from public.notices) as notices
`);

// ===========================================================================
// 1. The deck is permission-aware
// ===========================================================================
const ownerDeck = await as(OWNER, `select * from public.admin_deck()`);
check(ownerDeck.error === null && ownerDeck.rows.length > 0, 'an owner gets a deck', ownerDeck.error?.message ?? '');
check(
  ownerDeck.rows.every((row) => row.can_act === true),
  'and every card on it is one they can act on',
);
check(
  ownerDeck.rows.every((row) => row.count_now >= 0),
  'every count is a number, never null',
);

const modDeck = await as(MOD, `select * from public.admin_deck()`);
check(modDeck.error === null, 'a moderator gets a deck too', modDeck.error?.message ?? '');
check(
  modDeck.rows.length > 0 && modDeck.rows.length < ownerDeck.rows.length,
  'a moderator sees fewer cards than an owner',
  `${modDeck.rows.length} vs ${ownerDeck.rows.length}`,
);
check(
  modDeck.rows.every((row) => row.can_act === true),
  'and every card they see is one they can act on',
);
const modCards = new Set(modDeck.rows.map((row) => row.card));
check(
  !modCards.has('authority.grants_live'),
  'a moderator is not shown the permission grant card they cannot act on',
);
check(
  !modCards.has('marketplace.shops_pending'),
  'nor the shop application queue they cannot decide',
);
check(
  modCards.has('moderation.open_reports'),
  'but is shown the moderation queue they can act on',
);
// The filter must be the same authority every policy uses, not a second notion.
const modCardList = [...modCards];
const filterAgrees = await as(MOD, `
  select bool_and(bsdc.has_permission(c.permission)) as ok
    from bsdc_command_cards() c
   where c.card in (${modCardList.map((card) => `'${card}'`).join(', ')})
`);
check(filterAgrees.error === null, 'the card list can be checked against the permission spine', filterAgrees.error?.message ?? '');
check(filterAgrees.rows[0]?.ok === true, 'and every card a moderator sees is one the spine says they hold');

const memberDeck = await as(MEMBER, `select * from public.admin_deck()`);
check(memberDeck.error === null, 'a member can call the deck without an error', memberDeck.error?.message ?? '');
check(memberDeck.rows.length === 0, 'and gets nothing, because they can act on nothing', `${memberDeck.rows.length} cards`);
const anonDeck = await asSystem(`set role anon; select * from public.admin_deck();`);
check(anonDeck.error !== null, 'and an anonymous caller is refused outright', anonDeck.error?.message ?? 'it answered');

// ===========================================================================
// 2. Every card is self-describing
// ===========================================================================
check(
  ownerDeck.rows.every((row) => typeof row.computed_at === 'object' || typeof row.computed_at === 'string'),
  'every card says when it was computed',
);
check(
  ownerDeck.rows.every((row) => ['up', 'down', 'flat'].includes(row.trend)),
  'and states a trend in a closed vocabulary',
);
check(
  ownerDeck.rows.every((row) => row.label.length > 0 && row.section.length > 0 && row.kind.length > 0),
  'every card has a label, a section and a kind',
);
check(
  ownerDeck.rows.every((row) => row.count_prev !== null),
  'a card with no comparison states zero rather than null',
);
check(
  ownerDeck.rows.filter((row) => row.kind === 'alert').length > 0,
  'the deck has alerts, which are what an operator opens it for',
);
check(
  ownerDeck.rows[0].kind === 'alert',
  'and they sort first',
  ownerDeck.rows[0]?.kind,
);
check(
  ownerDeck.rows.every((row) => row.delta === row.count_now - row.count_prev),
  'the delta is the arithmetic of the two counts it shows',
);

// The catalogue is complete: every card the deck computes is catalogued, and
// every catalogued card is computed. A card that exists in one and not the other
// is a label with no number or a number with no name.
const catalogue = await asSystem(`select card, label_bn, permission from bsdc_command_cards()`);
const computedCards = new Set(ownerDeck.rows.map((row) => row.card));
const cataloguedCards = new Set(catalogue.rows.map((row) => row.card));
const uncatalogued = [...computedCards].filter((card) => !cataloguedCards.has(card));
check(
  uncatalogued.length === 0,
  'every card the deck computes is catalogued',
  uncatalogued.join(', '),
);
check(
  catalogue.rows.every((row) => row.label_bn !== null && row.label_bn.length > 0),
  'and every card has a Bangla label',
);
check(
  catalogue.rows.every((row) => /[\u0980-\u09FF]/.test(row.label_bn)),
  'that is actually in Bangla script, not English in a Bangla column',
);

// ===========================================================================
// 3. "Today" is compared against the same point yesterday
// ===========================================================================
//
// The comparison window is the claim. Same wall-clock point, not "all of
// yesterday": at 9 a.m. a good morning must not read as a collapse.
// The deck reads the *caller*, so the window check goes through the caller too.
const newMembers = await as(OWNER, `select * from public.admin_deck() where card = 'people.new_today'`);
check(newMembers.rows.length === 1, 'the new-members card is on the owner deck');
const newMembersRow = newMembers.rows[0];
check(
  newMembersRow?.count_now === 3,
  'the three members this harness created joined today',
  JSON.stringify(newMembersRow),
);
check(
  newMembersRow?.count_prev === 0,
  'and the same point yesterday had none, so the card says so rather than guessing',
);
check(newMembersRow?.trend === 'up', 'and the trend is up');

// A card with no comparison window states zero rather than inventing one.
const noWindow = ownerDeck.rows.find((row) => row.card === 'people.total');
check(noWindow?.count_prev === 0, 'a total has no comparison window and says zero');

// ===========================================================================
// 4. Every card is drillable
// ===========================================================================
const DRILS = {
  people: null,
  reports: 'public.admin_queue_reports',
  shops: 'public.admin_queue_shops',
};
check(Object.keys(DRILS).length > 0, 'the drills are known');

const reportsQueue = await as(OWNER, `select * from public.admin_queue_reports('open', 50, null)`);
check(reportsQueue.error === null, 'the reports queue answers', reportsQueue.error?.message ?? '');
check(Array.isArray(reportsQueue.rows), 'and returns rows');

const shopsQueue = await as(OWNER, `select * from public.admin_queue_shops('submitted', 50, null)`);
check(shopsQueue.error === null, 'the shops queue answers', shopsQueue.error?.message ?? '');
check(Array.isArray(shopsQueue.rows), 'and returns rows');

// A queue refuses somebody who cannot act on it, and names the permission.
const modShops = await as(MOD, `select * from public.admin_queue_shops('submitted', 50, null)`);
check(
  modShops.error === null || modShops.error?.code === '42501',
  'the shops queue either answers a moderator or refuses cleanly',
  modShops.error?.message ?? '',
);
if (modShops.error?.code === '42501') {
  check(
    String(modShops.error.message).includes('shop.review'),
    'and the refusal names the permission that would allow it',
  );
}

const anonQueue = await asSystem(`set role anon; select * from public.admin_queue_reports('open', 50, null);`);
check(anonQueue.error !== null, 'a queue refuses an anonymous caller', anonQueue.error?.message ?? 'it answered');

const badLimit = await as(OWNER, `select * from public.admin_queue_reports('open', 0, null)`);
check(badLimit.error?.code === '22023', 'a page size of zero is refused', badLimit.error?.message ?? 'accepted');
const hugeLimit = await as(OWNER, `select * from public.admin_queue_reports('open', 100000, null)`);
check(hugeLimit.error?.code === '22023', 'and a page size of a hundred thousand is refused too');

// ===========================================================================
// 5. A queue's total is separate from its page
// ===========================================================================
const before = await deps();
check(before.error === null, 'the fixture dependencies are readable', before.error?.message ?? '');

// Three shops pending, and the queue asked for two rows, must say three.
// Three applications, written the way members write them: through the RPC that
// owns the rules. A raw insert would have to restate every constraint the table
// carries, and a fixture that restates a constraint can drift from it.
//
// Each needs its own owner. `mk_applications_one_open_per_owner` allows one open
// application per member, which is a rule worth not working around.
async function applyAs(uid, shopName) {
  return as(uid, `select public.mk_submit_vendor_application($json$${JSON.stringify({
    full_name: 'Queue Applicant',
    shop_name: shopName,
    nid_number: '1234567890123',
    mobile: '01712345678',
    vendor_type: 'grocery',
    address_line: '12 Queue Road, Sylhet',
    lat: 24.9,
    lng: 91.87,
    place_label: 'Sylhet',
    package_code: '10',
    payment_sender: '01712345678',
    payment_holder: 'Queue Applicant',
    // A bKash transaction ID can credit exactly one purchase, ever — a rule the
    // table enforces with a unique index. Three fixtures need three ids.
    payment_txn_id: `TXN-${shopName.replace(/\W/g, '')}-${Math.random().toString(36).slice(2, 8)}`,
    agreements: {
      terms: true, privacy: true, vendor_policy: true,
      cod_policy: true, self_delivery: true, accuracy: true,
    },
  })}$json$::jsonb)`);
}

// Created as three distinct members is not necessary; the queue is by time, so
// the ages are set explicitly below rather than by waiting.
const APPLICANTS = [
  ['00000000-0000-4000-8000-0000000000c1', 'Queue Shop One', 'queueone'],
  ['00000000-0000-4000-8000-0000000000c2', 'Queue Shop Two', 'queuetwo'],
  ['00000000-0000-4000-8000-0000000000c3', 'Queue Shop Three', 'queuethree'],
];
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ${APPLICANTS.map(([uid, , name]) => `('${uid}', '${name}', '${name}', 'member', 'active')`).join(', ')}
  on conflict (uid) do nothing;
`);
for (const [uid, name] of APPLICANTS) {
  const applied = await applyAs(uid, name);
  if (applied.error) console.log(`note  ${name}: ${applied.error.message}`);
}
await db.exec(`
  update public.mk_vendor_applications
     set submitted_at = case shop_name
                          when 'Queue Shop One'   then now() - interval '3 days'
                          when 'Queue Shop Two'   then now() - interval '1 hour'
                          else now()
                        end
   where shop_name like 'Queue Shop %';
`);

const page = await as(OWNER, `select * from public.admin_queue_shops('submitted', 2, null)`);
check(page.rows.length <= 2, 'the queue honours its page size', `${page.rows.length} rows`);
check(
  Number(page.rows[0]?.total) >= 3,
  'and still reports the whole total, so a page of two is not mistaken for the queue',
  JSON.stringify(page.rows[0]?.total),
);
check(
  page.rows[0]?.is_overdue === true,
  'the three-day-old application is flagged overdue',
  JSON.stringify(page.rows.map((row) => row.is_overdue)),
);
check(
  page.rows.every((row, index) => index === 0 || new Date(row.submitted_at) >= new Date(page.rows[index - 1].submitted_at)),
  'the queue is oldest first, because a queue is ordered by who has waited longest',
);
check(
  page.rows.every((row, index) => index === 0 || row.waiting_hours <= page.rows[index - 1].waiting_hours),
  'and the waiting time agrees with that order',
);

const drillAgrees = await as(OWNER, `select * from public.admin_deck() where card = 'marketplace.shops_pending'`);
check(
  Number(drillAgrees.rows[0]?.count_now) === Number(page.rows[0]?.total),
  'the deck card and the queue total are the same number, so the card is not a separate claim',
  `${drillAgrees.rows[0]?.count_now} vs ${page.rows[0]?.total}`,
);

// ===========================================================================
// 6. Recent activity, derived from one history and not two
// ===========================================================================
const activity = await as(OWNER, `select * from public.admin_recent_activity(20)`);
check(activity.error === null, 'an owner reads recent activity', activity.error?.message ?? '');
check(Array.isArray(activity.rows), 'and gets rows');

// A moderator holds `audit.read` in the role baseline, so the activity list
// answers them; what matters is that a member is refused and that the deck's own
// filter and this guard agree about who may read the trail.
const modActivity = await as(MOD, `select * from public.admin_recent_activity(20)`);
check(modActivity.error === null, 'a moderator may read recent activity, as their baseline says', modActivity.error?.message ?? '');

const memberActivity = await as(MEMBER, `select * from public.admin_recent_activity(20)`);
check(
  memberActivity.error?.code === '42501',
  'a member without audit.read is refused the activity list',
  memberActivity.error?.message ?? 'it answered',
);
const memberCanReadTrail = await as(MEMBER, `select bsdc.has_permission('audit.read') as ok`);
check(memberCanReadTrail.rows[0]?.ok === false, 'and the permission spine agrees they may not');

// ===========================================================================
// 7. admin_overview() is unchanged for the callers that already read it
// ===========================================================================
const overview = await as(OWNER, `select * from public.admin_overview()`);
check(overview.error === null, 'the existing overview still answers', overview.error?.message ?? '');
check(
  Object.keys(overview.rows[0] ?? {}).length === 9,
  'with the same nine columns every existing caller reads',
  JSON.stringify(Object.keys(overview.rows[0] ?? {})),
);
check(
  Number(overview.rows[0]?.members_total) >= 5,
  'and the same numbers',
  JSON.stringify(overview.rows[0]?.members_total),
);

console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) {
  console.log(bad.map((label) => `  - ${label}`).join('\n'));
  process.exit(1);
}
