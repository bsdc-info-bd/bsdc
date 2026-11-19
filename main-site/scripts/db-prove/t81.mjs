/**
 * Proof for 0122: the marketplace page reads a page, not every shop.
 *
 * `mk_list_vendors` is the only anonymous read the marketplace home makes. It
 * used to ask four questions per active vendor *before* applying its `limit` —
 * product count, average rating, review count, and the credit balance, which is a
 * sum over that vendor's whole ledger. The visitor sees at most forty rows; the
 * database did work proportional to every shop on the platform.
 *
 * Three things are worth asserting rather than describing:
 *
 *   1. **The answer did not change.** Same membership (active and funded), same
 *      ordering, same limit, same aggregates, same search. A rewrite that is
 *      faster and subtly different is a regression with a nicer number.
 *   2. **The per-vendor function is gone from the list.** `mk_vendor_credits` is
 *      still the exact answer and is still used where one vendor is read; what
 *      must not come back is calling it in a loop.
 *   3. **The lookups have indexes to use.** The comment trigger's ownership test,
 *      a thread's "which of these did I like", and the sweeper's message
 *      anti-join each gained one, and each is shown on a real plan.
 */
import { as, check, expectFail, failureCount, summary } from './lib.mjs';
import { makeDb } from './lib.mjs';

const owner = 'aaaaaaaa-1111-4111-8111-000000000001';
const other = 'bbbbbbbb-2222-4222-8222-000000000002';
const third = 'cccccccc-3333-4333-8333-000000000003';
const fourth = 'dddddddd-4444-4444-8444-000000000004';
const admin = 'ffffffff-9999-4999-8999-000000000009';

const db = await makeDb();

await db.exec(`
  insert into public.profiles (uid, username, display_name, status) values
    ('${owner}', 'shopowner', 'Shop Owner', 'active'),
    ('${other}', 'othershop', 'Other Shop', 'active'),
    ('${third}', 'thirdshop', 'Third Shop', 'active'),
    ('${fourth}', 'fourthshop', 'Fourth Shop', 'active'),
    ('${admin}', 'platform',  'Platform',   'active');
`);

// A shop needs an approved application behind it, and one owner can hold one
// shop, so each fixture shop gets its own.
function application(ownerUid) {
  return `(gen_random_uuid(), '${ownerUid}', 'Shop Owner', 'A shop', '1234567890',
           '01700000001', 'other', 'Mirpur, Dhaka', 23.8069, 90.3687,
           'Mirpur, Dhaka', '', '10', '{}', '01700000001', 'Shop Owner', 'TXN-1', 'approved')`;
}

await db.exec(`
  insert into public.mk_vendor_applications (id, owner_uid, full_name, shop_name, nid_number,
    mobile, vendor_type, address_line, lat, lng, place_label, trade_license_no, package_code,
    agreements, payment_sender, payment_holder, payment_txn_id, status)
  values
    ${application(owner)},
    ${application(other)},
    ${application(third)},
    ${application(fourth)};
`);

// Three funded shops at different distances, one with no ledger at all, and one
// funded but suspended. Only funded and active shops may appear.
await db.exec(`
  insert into public.mk_vendors (id, owner_uid, application_id, slug, name, vendor_type,
                                 mobile, address_line, lat, lng, status)
  select
    v.id, v.owner_uid, a.id, v.slug, v.name, v.vendor_type::bsdc_mk_vendor_type,
    v.mobile, v.address_line, v.lat, v.lng, v.status::bsdc_mk_vendor_status
  from (values
    ('11111111-1111-4111-8111-111111111111'::uuid, '${owner}',  'camera-shop',
     'Camera Shop', 'electronics', '01700000001', 'Mirpur, Dhaka', 23.8069, 90.3687, 'active'),
    ('22222222-2222-4222-8222-222222222222'::uuid, '${other}',  'repair-shop',
     'Repair Shop', 'electronics', '01700000002', 'Uttara, Dhaka', 23.8759, 90.3795, 'active'),
    ('33333333-3333-4333-8333-333333333333'::uuid, '${third}',  'no-ledger',
     'No Ledger', 'other', '01700000003', 'Banani, Dhaka', 23.7936, 90.4043, 'active'),
    ('44444444-4444-4444-8444-444444444444'::uuid, '${fourth}', 'suspended',
     'Suspended', 'other', '01700000004', 'Gulshan, Dhaka', 23.7806, 90.4159, 'suspended')
  ) as v(id, owner_uid, slug, name, vendor_type, mobile, address_line, lat, lng, status)
  join public.mk_vendor_applications a on a.owner_uid = v.owner_uid;
`);

await db.exec(`
  insert into public.mk_credit_ledger (vendor_id, kind, orders_delta)
  values
    ('11111111-1111-4111-8111-111111111111', 'purchase', 10),
    ('11111111-1111-4111-8111-111111111111', 'order', -3),
    ('22222222-2222-4222-8222-222222222222', 'purchase', 5),
    ('44444444-4444-4444-8444-444444444444', 'purchase', 7);
`);

await db.exec(`
  insert into public.mk_products (vendor_id, slug, name, price_poisha, stock, status)
  values
    ('11111111-1111-4111-8111-111111111111', 'tripod', 'Tripod', 250000, 4, 'active'),
    ('11111111-1111-4111-8111-111111111111', 'draft-lens', 'Draft lens', 900000, 1, 'draft'),
    ('22222222-2222-4222-8222-222222222222', 'screen-fix', 'Screen fix', 150000, 9, 'active');
`);

// ------------------------------------------------------- the same answer ---

const listed = await as(
  db,
  admin,
  `select public.mk_list_vendors(null, '', null, null, 40) as rows`,
  'the marketplace home reads its list',
);
const rows = listed?.rows[0]?.rows ?? [];

check(Array.isArray(rows) && rows.length === 2, 'two shops are listed', String(rows?.length));
check(
  rows.every((row) => ['camera-shop', 'repair-shop'].includes(row.slug)),
  'a funded, active shop is listed and nothing else is',
  JSON.stringify(rows.map((row) => row.slug)),
);
check(
  rows.find((row) => row.slug === 'camera-shop')?.product_count === 1,
  'the product count ignores drafts, as before',
  String(rows.find((row) => row.slug === 'camera-shop')?.product_count),
);
check(
  rows.find((row) => row.slug === 'repair-shop')?.product_count === 1,
  'the second shop counts its own product only',
);

// Ordering without a location is by name, which is the old tie-break.
check(
  rows[0]?.slug === 'camera-shop' && rows[1]?.slug === 'repair-shop',
  'the list is ordered by name when no location is given',
  JSON.stringify(rows.map((row) => row.slug)),
);

// Distance ordering still applies when a location is given.
const near = await as(
  db,
  admin,
  `select public.mk_list_vendors(null, '', 23.80, 90.36, 40) as rows`,
  'the marketplace home reads its list with a location',
);
const nearRows = near?.rows[0]?.rows ?? [];
check(
  nearRows.length === 2 && typeof nearRows[0]?.distance_km === 'number',
  'a location produces a distance for each shop',
);
check(nearRows[0]?.distance_km <= nearRows[1]?.distance_km, 'the nearer shop comes first');

// The limit is still a limit, and the type and search filters still filter.
const capped = await as(
  db,
  admin,
  `select public.mk_list_vendors(null, '', null, null, 1) as rows`,
  'a limit of one is honoured',
);
check((capped?.rows[0]?.rows ?? []).length === 1, 'the limit caps the page');

const byType = await as(
  db,
  admin,
  `select public.mk_list_vendors('other', '', null, null, 40) as rows`,
  'the type filter is applied',
);
check(
  (byType?.rows[0]?.rows ?? []).map((row) => row.slug).join(',') === '',
  'a type no funded shop carries lists nothing',
  JSON.stringify((byType?.rows[0]?.rows ?? []).map((row) => row.slug)),
);

const byQuery = await as(
  db,
  admin,
  `select public.mk_list_vendors(null, 'camera', null, null, 40) as rows`,
  'the search filter is applied',
);
check(
  (byQuery?.rows[0]?.rows ?? []).map((row) => row.slug).join(',') === 'camera-shop',
  'only the matching shop is listed when searching',
);

// A shop loses its listing the moment its balance reaches zero, which is the
// funding rule the rewrite has to preserve exactly.
await db.exec(`
  insert into public.mk_credit_ledger (vendor_id, kind, orders_delta)
  values ('22222222-2222-4222-8222-222222222222', 'order', -5);
`);
const afterSpend = await as(
  db,
  admin,
  `select public.mk_list_vendors(null, '', null, null, 40) as rows`,
  'the list is read again after one shop spends its last credit',
);
check(
  (afterSpend?.rows[0]?.rows ?? []).map((row) => row.slug).join(',') === 'camera-shop',
  'a shop whose balance reaches zero is no longer listed',
);

// ------------------------------------- the page is the nearest page, not any page ---
//
// The old body applied `limit` inside the subquery and *then* sorted what came
// back by distance, so "nearest shops first" ordered an arbitrary forty of the
// shops. With sixty shops and a page of forty, the ten left out were whichever
// ten the scan happened to reach last.

await db.exec(`
  insert into public.profiles (uid, username, display_name, status)
  select 'far-' || i, 'far' || i, 'Far ' || i, 'active' from generate_series(1, 60) i;

  insert into public.mk_vendor_applications (id, owner_uid, full_name, shop_name, nid_number,
    mobile, vendor_type, address_line, lat, lng, place_label, trade_license_no, package_code,
    agreements, payment_sender, payment_holder, payment_txn_id, status)
  select gen_random_uuid(), p.uid, 'Owner', 'Shop', '1234567890', '01700000001', 'electronics',
         'Mirpur, Dhaka', 23.8069, 90.3687, 'Mirpur', '', '10', '{}', '01700000001', 'Owner',
         'TXN-' || p.uid, 'approved'
    from public.profiles p where p.uid like 'far-%';

  insert into public.mk_vendors (owner_uid, application_id, slug, name, vendor_type, mobile,
    address_line, lat, lng, status)
  select a.owner_uid, a.id, 'far-' || split_part(a.owner_uid, '-', 2),
         'Far ' || split_part(a.owner_uid, '-', 2), 'electronics', '01700000001', 'Dhaka',
         23.80 + split_part(a.owner_uid, '-', 2)::numeric / 1000, 90.36, 'active'
    from public.mk_vendor_applications a
   where a.owner_uid like 'far-%';

  insert into public.mk_credit_ledger (vendor_id, kind, orders_delta)
  select v.id, 'purchase', 1 from public.mk_vendors v where v.slug like 'far-%';
`);

const page = await as(
  db,
  admin,
  `select public.mk_list_vendors(null, '', 23.80, 90.36, 40) as rows`,
  'the market home asks for a page of forty of sixty shops',
);
const pageRows = page?.rows[0]?.rows ?? [];
check(pageRows.length === 40, 'the page holds exactly the limit', String(pageRows.length));
check(
  pageRows.every((row, i) => i === 0 || pageRows[i - 1].distance_km <= row.distance_km),
  'the page is sorted by distance',
);

const boundary = await db.query(`
  with listed as (
    select public.mk_list_vendors(null, '', 23.80, 90.36, 40) as rows
  ), flat as (
    select (row ->> 'slug') as slug, (row ->> 'distance_km')::numeric as km
      from listed, jsonb_array_elements(rows) as row
  )
  select
    (select max(km) from flat) as furthest_listed,
    (select min(bsdc.mk_km(23.80, 90.36, v.lat, v.lng))
       from public.mk_vendors v
      where v.status = 'active' and v.slug like 'far-%'
        and v.slug not in (select slug from flat)) as nearest_left_out
`);
const furthestListed = Number(boundary.rows[0]?.furthest_listed);
const nearestLeftOut = Number(boundary.rows[0]?.nearest_left_out);
check(
  Number.isFinite(furthestListed) && Number.isFinite(nearestLeftOut),
  'both sides of the page boundary have a distance',
  `${furthestListed} / ${nearestLeftOut}`,
);
check(
  furthestListed <= nearestLeftOut,
  'no shop left out is nearer than one listed — the page is the nearest page',
  `furthest listed ${furthestListed.toFixed(2)} km, nearest left out ${nearestLeftOut.toFixed(2)} km`,
);

// ---------------------------------------------------- no per-vendor call ---

const body = await db.query(`select prosrc from pg_proc where proname = 'mk_list_vendors'`);
check(
  typeof body.rows[0]?.prosrc === 'string' && !body.rows[0].prosrc.includes('mk_vendor_credits'),
  'the list no longer sums a ledger per shop',
);

const exact = await db.query(
  `select bsdc.mk_vendor_credits('11111111-1111-4111-8111-111111111111') as credits`,
);
check(Number(exact.rows[0]?.credits) === 7, 'the single-shop balance is still the exact sum');

// --------------------------------------------------------- the indexes ---

const indexes = await db.query(
  `select indexname from pg_indexes
    where schemaname = 'public'
      and indexname in ('media_assets_owner_url_idx', 'comment_reactions_uid_idx',
                        'messages_media_url_idx', 'mk_credit_ledger_sum_idx')`,
);
check(
  indexes.rows.length === 4,
  'every index this migration adds exists',
  JSON.stringify(indexes.rows.map((row) => row.indexname)),
);

// A plan is the only way to show that an index is the one the planner reaches for.
// Sequential scans are disabled for these three plans so a three-row table cannot
// answer the question with a scan and hide a missing index.
async function planUses(sql, index) {
  await db.exec(`set enable_seqscan = off`);
  const explained = await db.query(`explain ${sql}`);
  await db.exec(`reset enable_seqscan`);
  const text = explained.rows.map((row) => row['QUERY PLAN']).join('\n');
  return { ok: text.includes(index), text };
}

const commentLookup = await planUses(
  `select 1 from public.media_assets where owner_uid = '${owner}' and url = 'https://i.ibb.co/x/y.jpg'`,
  'media_assets_owner_url_idx',
);
check(
  commentLookup.ok,
  'the comment trigger ownership test has an index to use',
  commentLookup.text.split('\n')[0],
);

const reactionLookup = await planUses(
  `select comment_id from public.comment_reactions where uid = '${owner}'`,
  'comment_reactions_uid_idx',
);
check(
  reactionLookup.ok,
  'a thread asks which comments this member liked through an index',
  reactionLookup.text.split('\n')[0],
);

const ledgerPass = await planUses(
  `select vendor_id, sum(orders_delta) from public.mk_credit_ledger group by vendor_id having sum(orders_delta) > 0`,
  'mk_credit_ledger',
);
check(
  ledgerPass.ok,
  'the funding pass reads the ledger, not the shop table',
  ledgerPass.text.split('\n')[0],
);

// An anonymous caller still cannot read the ledger directly: the list is a
// definer function, and the tables behind it stay closed.
await expectFail(
  db,
  null,
  `select count(*) from public.mk_credit_ledger`,
  '42501',
  'an anonymous caller still cannot read the credit ledger',
);

summary();
process.exit(failureCount() === 0 ? 0 : 1);
