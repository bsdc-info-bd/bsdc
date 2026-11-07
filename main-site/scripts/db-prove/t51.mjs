/**
 * Proof for the campaign arithmetic.
 *
 * Three implementations of the same rule exist: `bsdc.ad_event_cost` in
 * `0022_ads.sql`, which charges the wallet; `eventCost` in
 * `admin-site/src/campaigns.ts`, which shows an operator what a bid buys; and
 * `eventCost` in `main-site/src/lib/ads/ads-types.ts`, which shows the
 * advertiser the same thing. They have to agree exactly, including the integer
 * truncation — a CPM bid of 1,500 poisha pays 1 poisha an impression in all
 * three, or a campaign is forecast on one number and billed on another.
 *
 * Rather than trusting two comments to stay in step, this harness imports the
 * TypeScript the console actually runs and asks the database the same
 * questions. If somebody changes the SQL division without changing the file, or
 * the other way round, this fails.
 *
 * It also checks the inverse: a forecast must never promise more events than
 * the budget can pay for.
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
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

const admin = await import(
  pathToFileURL(resolve(process.cwd(), '..', 'admin-site', 'src', 'campaigns.ts')).href
);
const member = await import(
  pathToFileURL(resolve(process.cwd(), 'src', 'lib', 'ads', 'ads-types.ts')).href
);

/** Both clients, so one loop can hold all three implementations to account. */
const CLIENTS = [
  ['admin console', (pricing, bid, kind) => admin.eventCost(pricing, bid, kind)],
  ['member console', (pricing, bid, kind) => member.eventCost(pricing, bid, kind)],
];

// The floor lives in `site_config`, which arrives in 0028, so the whole
// schema is replayed here: this harness is about whether two implementations
// of one arithmetic rule agree, not about when a table first existed.
const db = await makeDb();

const BIDS = [100, 499, 999, 1000, 1001, 1499, 1500, 1900, 1999, 2000, 2500, 12_345, 1_000_000];

/** The database's answer for one event, for every bid in the list. */
async function sqlCost(pricing, kind) {
  const values = BIDS.map((bid) => `('${pricing}'::bsdc_ad_pricing, ${bid}, '${kind}'::bsdc_ad_event_kind)`).join(', ');
  const rows = await db.query(
    `select v.bid, bsdc.ad_event_cost(v.pricing, v.bid, v.kind) as cost
       from (values ${values}) as v(pricing, bid, kind)`,
  );
  return rows.rows;
}

for (const [pricing, kind] of [
  ['cpm', 'impression'],
  ['cpm', 'click'],
  ['cpc', 'click'],
  ['cpc', 'impression'],
]) {
  const rows = await sqlCost(pricing, kind);
  for (const [label, eventCost] of CLIENTS) {
    const mismatched = rows.filter((row) => row.cost !== eventCost(pricing, row.bid, kind));
    check(
      mismatched.length === 0,
      `${pricing}/${kind}: the ${label} charges what the database charges`,
      mismatched
        .slice(0, 3)
        .map((row) => `bid ${row.bid}: sql ${row.cost} vs client ${eventCost(pricing, row.bid, kind)}`)
        .join('; '),
    );
  }
}

check(
  (await sqlCost('cpm', 'impression')).some((row) => row.bid === 1500 && row.cost === 1),
  'a CPM bid of 1,500 poisha is 1 poisha an impression in the database too',
);

// The forecast is the inverse of that cost, and it must not over-promise.
const budgets = [1000, 100_000, 500_000, 999_999];
const overPromised = [];
const underPromised = [];
for (const pricing of ['cpm', 'cpc']) {
  for (const bid of BIDS) {
    for (const budget of budgets) {
      const { count: events } = admin.forecastEvents(pricing, bid, budget);
      const unit = admin.eventCost(pricing, bid, pricing === 'cpm' ? 'impression' : 'click');
      if (unit <= 0) {
        if (events !== 0) overPromised.push(`${pricing}/${bid}: ${events} events at no cost`);
        continue;
      }
      // Never more than the budget pays for.
      if (events * unit > budget) overPromised.push(`${pricing}/${bid}/${budget}: ${events} x ${unit} > ${budget}`);
      // And never leave a whole event's worth of money unspent.
      if ((events + 1) * unit <= budget) {
        underPromised.push(`${pricing}/${bid}/${budget}: could afford ${events + 1}, showed ${events}`);
      }
    }
  }
}
check(overPromised.length === 0, 'a forecast never promises more events than the budget pays for',
  overPromised.slice(0, 3).join('; '));
check(underPromised.length === 0, 'and never leaves a whole event unbought',
  underPromised.slice(0, 3).join('; '));

// The form's own bounds and the table's have to be the same numbers, or a
// draft the console says is fine is refused on insert.
const floor = await db.query(
  `select coalesce((select value::text::integer from public.site_config where key = 'ads.min_bid'), 100) as floor`,
);
const floorBid = floor.rows[0]?.floor;
check(
  floorBid === admin.LIMITS.bidMin,
  'the form floor is the configured floor',
  `config ${floorBid} vs client ${admin.LIMITS.bidMin}`,
);

const bounds = await db.query(
  `select pg_get_constraintdef(oid) as def from pg_constraint
    where conrelid = 'public.ad_campaigns'::regclass and pg_get_constraintdef(oid) like '%bid%'`,
);
const bidDef = bounds.rows.map((row) => row.def).join(' | ');
check(
  bidDef.includes(String(admin.LIMITS.bidMin)) && bidDef.includes(String(admin.LIMITS.bidMax)),
  'and the form ceiling is the ceiling the table enforces',
  bidDef,
);

const budgetDef = (
  await db.query(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'public.ad_campaigns'::regclass and pg_get_constraintdef(oid) like '%total_budget%'`,
  )
).rows.map((row) => row.def).join(' | ');
check(
  budgetDef.includes(String(admin.LIMITS.budgetMin)),
  'and the smallest budget the form accepts is the smallest the table accepts',
  budgetDef,
);

console.log(`\nSUMMARY: ${pass} passed, ${bad.length} failed`);
for (const label of bad) console.log('  failed: ' + label);
process.exit(bad.length === 0 ? 0 : 1);
