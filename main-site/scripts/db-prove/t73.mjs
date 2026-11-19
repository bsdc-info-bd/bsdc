// 0108: each shop chooses its delivery area (all Bangladesh, or a radius in whole
// km rounded up, around a centre it picks on the map) and its own delivery charge
// (0 to 150 taka, default 150). Admins read and edit the credit package prices.
import { makeDb, as, asAnon, expectFail, summary, check } from './lib.mjs';

const db = await makeDb();

await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('shop-owner', 'shop_owner', 'Shop Owner', 'member', 'active'),
    ('buyer-1', 'buyer_one', 'Buyer One', 'member', 'active'),
    ('rrc-owner', 'rrc_owner', 'Main Admin', 'member', 'active');
`);
await db.query(`insert into public.mk_vendor_applications (
  owner_uid, full_name, shop_name, nid_number, mobile, vendor_type, address_line, lat, lng,
  place_label, package_code, agreements, payment_sender, payment_holder, payment_txn_id, status
) values (
  'shop-owner', 'Shop Owner', 'Sylhet Rice House', '1234567890', '01712345678', 'electronics',
  'House 1, Road 2, Zindabazar', 24.8949, 91.8687, 'Zindabazar, Sylhet', '10',
  '{"terms":true,"privacy":true,"vendor_policy":true,"cod_policy":true,"self_delivery":true,"accuracy":true}'::jsonb,
  '01712345678', 'Shop Owner', 'TXN-73-SHOP', 'approved')`);
const app = await db.query(`select id from public.mk_vendor_applications limit 1`);
await db.query(
  `insert into public.mk_vendors (owner_uid, application_id, slug, name, vendor_type, mobile,
    address_line, lat, lng, place_label, status)
   values ('shop-owner', $1, 'sylhet-rice-house', 'Sylhet Rice House', 'electronics', '01712345678',
    'House 1, Road 2, Zindabazar', 24.8949, 91.8687, 'Zindabazar, Sylhet', 'active')`,
  [app.rows[0].id],
);
await db.query(`insert into public.mk_credit_ledger (vendor_id, kind, orders_delta, memo)
  select id, 'purchase', 10, 'Credit package 10' from public.mk_vendors`);
await db.query(`insert into public.mk_products (vendor_id, slug, name, description, price_poisha, stock, images, status)
  select id, 'sylhet-rice-5kg', 'Sylhet Rice 5kg', 'Fresh aromatic rice.', 45000, 50,
         array['https://i.ibb.co/example/rice.jpg'], 'active' from public.mk_vendors`);
const vendor = (await db.query(`select id from public.mk_vendors`)).rows[0].id;
const product = (await db.query(`select id from public.mk_products`)).rows[0].id;

const SHOP_OWNER = { email: undefined };
const ADMIN = { email: 'rrc@bsdc.info.bd', email_verified: true };

// A pin in the middle of Sylhet city, about 1 km from the shop.
const NEAR = { lat: 24.9045, lng: 91.8611 };
// Dhaka, about 230 km away.
const FAR = { lat: 23.8103, lng: 90.4125 };

const address = (pin) =>
  `{"customer_name":"Rahim Uddin","customer_phone":"01712345678","address_line":"House 4, Road 7, Zindabazar",` +
  `"landmark":"","place_label":"Test","note":"","lat":${pin.lat},"lng":${pin.lng}}`;

// The shop starts on the default: all of Bangladesh, 150 taka.
const start = await db.query(
  `select delivery_scope, delivery_radius_km, delivery_fee_poisha from public.mk_vendors`,
);
check(JSON.stringify(start.rows[0]));

await as(
  db,
  'buyer-1',
  `select public.mk_cart_set('${product}', 2)`,
  'a customer puts two bags in the cart',
);

// --- The owner's settings: validation -----------------------------------------
await expectFail(
  db,
  'shop-owner',
  `select public.mk_vendor_set_delivery('bogus', 5, 150)`,
  '22023',
  'an unknown delivery area is refused',
  SHOP_OWNER,
);
await expectFail(
  db,
  'shop-owner',
  `select public.mk_vendor_set_delivery('radius', 0, 150)`,
  '22023',
  'a radius below 1 km is refused',
  SHOP_OWNER,
);
await expectFail(
  db,
  'shop-owner',
  `select public.mk_vendor_set_delivery('radius', 501, 150)`,
  '22023',
  'a radius above 500 km is refused',
  SHOP_OWNER,
);
await expectFail(
  db,
  'shop-owner',
  `select public.mk_vendor_set_delivery('all_bd', 5, 100001)`,
  '22023',
  'a charge above 100,000 taka is refused',
  SHOP_OWNER,
);
await expectFail(
  db,
  'shop-owner',
  `select public.mk_vendor_set_delivery('all_bd', 5, -1)`,
  '22023',
  'a negative charge is refused',
  SHOP_OWNER,
);
await expectFail(
  db,
  'shop-owner',
  `select public.mk_vendor_set_delivery('radius', 5, 150, 23.8, null)`,
  '22023',
  'a half-pinned centre is refused',
  SHOP_OWNER,
);
await expectFail(
  db,
  'shop-owner',
  `select public.mk_vendor_set_delivery('radius', 5, 150, 40.7, -74.0)`,
  '22023',
  'a centre outside Bangladesh is refused',
  SHOP_OWNER,
);

// --- The owner's settings: a valid save ----------------------------------------
await as(
  db,
  'shop-owner',
  `select public.mk_vendor_set_delivery('all_bd', 5, 0)`,
  'the owner saves all-Bangladesh delivery with a free charge',
);
const saved = await db.query(`select delivery_scope, delivery_fee_poisha from public.mk_vendors`);
console.log(
  saved.rows[0]?.delivery_scope === 'all_bd' && Number(saved.rows[0]?.delivery_fee_poisha) === 0,
  'the saved area and charge are stored (all_bd, 0 poisha)',
  'see the database value',
);

// A customer far away is accepted on all-Bangladesh delivery, at the shop's charge (0).
const farOrder = await as(
  db,
  'buyer-1',
  `select public.mk_place_order('${vendor}', '${address(FAR)}'::jsonb, null) as o`,
  'an all-Bangladesh shop takes a far pin',
);
check(
  Number(farOrder?.rows[0]?.o?.delivery_fee_poisha) === 0,
  'the order uses the shop charge, 0 taka',
  'see the database value',
);

// 0109: the vendor's notification for a brand-new order is the alarm target.
const alarmRow = await db.query(
  `select target_url from public.notifications
    where uid = 'shop-owner' and kind = 'order'
    order by created_at desc, id desc limit 1`,
);
const alarmTarget = alarmRow.rows[0]?.target_url ?? '';
check(
  alarmTarget === '/vendor/console?alarm=new',
  'a new order links the vendor to the alarm target',
  'see the database value',
);

// The buyer adds again, for the radius tests.
await as(
  db,
  'buyer-1',
  `select public.mk_cart_set('${product}', 2)`,
  'the customer re-adds to the cart',
);

// --- Radius delivery around the shop's own pin ---------------------------------
await as(
  db,
  'shop-owner',
  `select public.mk_vendor_set_delivery('radius', 5, 150)`,
  'the owner switches to a 5 km radius and a 150 taka charge',
);

await expectFail(
  db,
  'buyer-1',
  `select public.mk_place_order('${vendor}', '${address(FAR)}'::jsonb, null)`,
  '22023',
  'a pin far outside the 5 km radius is refused',
  {},
);
// 4.5 km north of the shop: inside 5 km after rounding up.
const INSIDE = { lat: 24.9354, lng: 91.8687 };
// 5.1 km north: rounds up to 6 km, so it is outside.
const OUTSIDE = { lat: 24.9408, lng: 91.8687 };

await expectFail(
  db,
  'buyer-1',
  `select public.mk_place_order('${vendor}', '${address(OUTSIDE)}'::jsonb, null)`,
  '22023',
  'a pin 5.1 km away is refused (rounded up to 6 km)',
  {},
);

const inside = await as(
  db,
  'buyer-1',
  `select public.mk_place_order('${vendor}', '${address(INSIDE)}'::jsonb, null) as o`,
  'a pin 4.5 km away is accepted (rounded up to 5 km)',
);
check(
  Number(inside?.rows[0]?.o?.delivery_fee_poisha) === 15000,
  'the order carries the shop charge, 150 taka',
  'see the database value',
);

// --- Centre moved on the map ----------------------------------------------------
await as(
  db,
  'buyer-1',
  `select public.mk_cart_set('${product}', 1)`,
  'the customer re-adds to the cart',
);
await as(
  db,
  'shop-owner',
  `select public.mk_vendor_set_delivery('radius', 5, 150, 23.8103, 90.4125)`,
  'the owner moves the delivery centre to Dhaka',
);
await as(
  db,
  'buyer-1',
  `select public.mk_place_order('${vendor}', '${address(FAR)}'::jsonb, null)`,
  'a pin in Dhaka is accepted once the centre is moved there',
);
await as(
  db,
  'buyer-1',
  `select public.mk_cart_set('${product}', 1)`,
  'the customer re-adds to the cart',
);
await expectFail(
  db,
  'buyer-1',
  `select public.mk_place_order('${vendor}', '${address(NEAR)}'::jsonb, null)`,
  '22023',
  'a pin in Sylhet is refused once the centre is in Dhaka',
  {},
);

// --- What the shop page and the console show ------------------------------------
const page = await asAnon(
  db,
  `select public.mk_vendor_page('sylhet-rice-house') as p`,
  'a visitor can read the shop page with its delivery settings',
);
const delivery = page?.rows[0]?.p?.vendor?.delivery;
check(
  delivery?.scope === 'radius' &&
    delivery?.radius_km === 5 &&
    Number(delivery?.fee_poisha) === 15000,
  'the shop page shows the area, radius and charge',
  'see the database value',
);

const mine = await as(
  db,
  'shop-owner',
  `select public.mk_vendor_delivery() as d`,
  'the owner reads back their delivery settings',
);
check(
  mine?.rows[0]?.d?.radius_km === 5,
  'the console reads the saved settings',
  'see the database value',
);

// --- Packages: the admin reads and edits prices; others cannot -----------------
const packages = await as(
  db,
  'rrc-owner',
  `select public.mk_admin_list_packages() as p`,
  'the main admin reads the credit packages',
  ADMIN,
);
const codes = (packages?.rows[0]?.p ?? []).map((p) => p.code);
check(
  ['10', '50', '100'].every((c) => codes.includes(c)) && codes.length === 3,
  'the packages are 10, 50 and 100 orders',
  'see the database value',
);

await expectFail(
  db,
  'buyer-1',
  `select public.mk_admin_list_packages()`,
  '42501',
  'a customer cannot read the admin package list',
  {},
);
await expectFail(
  db,
  'buyer-1',
  `select public.mk_admin_set_package('50', 50, 1, true)`,
  '42501',
  'a customer cannot change a package price',
  {},
);
await expectFail(
  db,
  'rrc-owner',
  `select public.mk_admin_set_package('50', 50, 0, true)`,
  '22023',
  'a package price of zero is refused',
  ADMIN,
);

await as(
  db,
  'rrc-owner',
  `select public.mk_admin_set_package('50', 50, 60000, true)`,
  'the main admin raises the 50-order package to 600 taka',
  ADMIN,
);
const after = await db.query(
  `select price_poisha from public.mk_credit_packages where code = '50'`,
);
check(
  Number(after.rows[0]?.price_poisha) === 60000,
  'the 50-order price is stored as 60000 poisha',
  'see the database value',
);

// The shop page lists only active packages for buying; switching one off hides it.
await as(
  db,
  'rrc-owner',
  `select public.mk_admin_set_package('10', 10, 10000, false)`,
  'the main admin switches the 10-order package off',
  ADMIN,
);
const buyable = await as(
  db,
  'shop-owner',
  `select public.mk_payment_instructions() as i`,
  'the owner reads the payment instructions',
);
const shown = (buyable?.rows[0]?.i?.packages ?? []).map((p) => p.code);
check(
  !shown.includes('10') && shown.includes('50') && shown.includes('100'),
  'a switched-off package is not offered for purchase',
  'see the database value',
);

const failed = summary();
process.exitCode = failed === 0 ? 0 : 1;
