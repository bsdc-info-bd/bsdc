// 0110: shop opening hours (Asia/Dhaka, including overnight windows), 3-mode
// custom delivery fees (default 150 Tk, custom fixed > 150 Tk, per-km * rounded
// km), and self-healing Web Push / FCM registration + public VAPID discovery.
import { makeDb, as, asAnon, expectFail, summary, check } from './lib.mjs';

const db = await makeDb();

await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('shop-owner', 'shop_owner', 'Shop Owner', 'member', 'active'),
    ('buyer-1', 'buyer_one', 'Buyer One', 'member', 'active'),
    ('suspended-1', 'suspended_one', 'Suspended One', 'member', 'suspended');
`);

await db.query(`insert into public.mk_vendor_applications (
  owner_uid, full_name, shop_name, nid_number, mobile, vendor_type, address_line, lat, lng,
  place_label, package_code, agreements, payment_sender, payment_holder, payment_txn_id, status
) values (
  'shop-owner', 'Shop Owner', 'Habiganj Fresh Hub', '1234567890', '01712345678', 'grocery',
  'House 1, Road 2, Zindabazar', 24.8949, 91.8687, 'Zindabazar, Sylhet', '10',
  '{"terms":true,"privacy":true,"vendor_policy":true,"cod_policy":true,"self_delivery":true,"accuracy":true}'::jsonb,
  '01712345678', 'Shop Owner', 'TXN-74-SHOP', 'approved')`);
const appId = (await db.query(`select id from public.mk_vendor_applications limit 1`)).rows[0].id;
await db.query(
  `insert into public.mk_vendors (owner_uid, application_id, slug, name, vendor_type, mobile,
    address_line, lat, lng, place_label, status)
   values ('shop-owner', $1, 'habiganj-fresh-hub', 'Habiganj Fresh Hub', 'grocery', '01712345678',
    'House 1, Road 2, Zindabazar', 24.8949, 91.8687, 'Zindabazar, Sylhet', 'active')`,
  [appId],
);
await db.query(`insert into public.mk_credit_ledger (vendor_id, kind, orders_delta, memo)
  select id, 'purchase', 50, 'Credit package 50' from public.mk_vendors`);
await db.query(`insert into public.mk_products (vendor_id, slug, name, description, price_poisha, stock, images, status)
  select id, 'fresh-tea-1kg', 'Sylhet Tea 1kg', 'Single-estate black tea.', 60000, 50,
         array['https://i.ibb.co/example/tea.jpg'], 'active' from public.mk_vendors`);

const vendorId = (await db.query(`select id from public.mk_vendors`)).rows[0].id;
const productId = (await db.query(`select id from public.mk_products`)).rows[0].id;

// 4.5 km north of shop -> ceil(distance) = 5 km.
const PIN_5KM = { lat: 24.9354, lng: 91.8687 };
const addr = (pin) =>
  `{"customer_name":"Rahim Uddin","customer_phone":"01712345678","address_line":"House 4, Road 7, Zindabazar",` +
  `"landmark":"","place_label":"Sylhet","note":"","lat":${pin.lat},"lng":${pin.lng}}`;

// --- 1. 3-Mode Custom Delivery Fee --------------------------------------------
// Mode A: Default platform fee (150 taka = 15000 poisha).
const defOrder = await as(
  db,
  'buyer-1',
  `select public.mk_place_order('${vendorId}', '${addr(PIN_5KM)}'::jsonb, '[{"product_id":"${productId}","qty":1}]'::jsonb) as o`,
  'default mode charges platform fallback (150 taka)',
);
check(
  Number(defOrder?.rows[0]?.o?.delivery_fee_poisha) === 15000,
  'default fee is 15000 poisha',
  JSON.stringify(defOrder?.rows[0]?.o),
);

// Mode B: Custom fixed fee > 150 taka (e.g., 280 taka = 28000 poisha).
await as(
  db,
  'shop-owner',
  `select public.mk_vendor_set_delivery('all_bd', 10, 280, null, null, 'fixed', 25)`,
  'owner sets custom fixed delivery fee of 280 taka (> 150 taka)',
);
const fixedOrder = await as(
  db,
  'buyer-1',
  `select public.mk_place_order('${vendorId}', '${addr(PIN_5KM)}'::jsonb, '[{"product_id":"${productId}","qty":1}]'::jsonb) as o`,
  'fixed mode charges 280 taka',
);
check(
  Number(fixedOrder?.rows[0]?.o?.delivery_fee_poisha) === 28000,
  'custom fixed fee of 280 taka (28000 poisha) is applied',
  JSON.stringify(fixedOrder?.rows[0]?.o),
);

// Mode C: Per-km custom rate (30 taka/km * 5 rounded km = 150 taka; at 40 taka/km * 5 km = 200 taka).
await as(
  db,
  'shop-owner',
  `select public.mk_vendor_set_delivery('radius', 10, 280, null, null, 'per_km', 40)`,
  'owner sets per-km delivery fee of 40 taka/km within 10 km radius',
);
const perKmOrder = await as(
  db,
  'buyer-1',
  `select public.mk_place_order('${vendorId}', '${addr(PIN_5KM)}'::jsonb, '[{"product_id":"${productId}","qty":1}]'::jsonb) as o`,
  'per-km mode charges ceil(4.5 km)=5 km * 40 taka = 200 taka',
);
check(
  Number(perKmOrder?.rows[0]?.o?.delivery_fee_poisha) === 20000 &&
    Number(perKmOrder?.rows[0]?.o?.distance_km) === 5,
  'per-km fee is 20000 poisha for 5 rounded km',
  JSON.stringify(perKmOrder?.rows[0]?.o),
);

// --- 2. Opening Time Schedule (Asia/Dhaka) ------------------------------------
await expectFail(
  db,
  'shop-owner',
  `select public.mk_vendor_set_schedule(true, '{"0":{"open":true,"start":"25:99","end":"22:00"}}'::jsonb)`,
  '22023',
  'invalid HH:MM format in opening hours is refused',
);
await expectFail(
  db,
  'shop-owner',
  `select public.mk_vendor_set_schedule(true, '{"0":{"open":true,"start":"10:00","end":"10:00"}}'::jsonb)`,
  '22023',
  'identical start and end time on an open day is refused',
);

// Close every day so the shop is closed right now regardless of wall clock.
const allClosed = JSON.stringify(
  Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { open: false, start: '09:00', end: '22:00' }]),
  ),
);
const closedSched = await as(
  db,
  'shop-owner',
  `select public.mk_vendor_set_schedule(true, '${allClosed}'::jsonb) as s`,
  'owner enables schedule with all days closed',
);
check(
  closedSched?.rows[0]?.s?.enabled === true && closedSched?.rows[0]?.s?.is_open === false,
  'schedule reports is_open = false when closed',
  JSON.stringify(closedSched?.rows[0]?.s),
);

// Public shop page, product detail, and list_vendors expose schedule + 3-mode delivery.
const pubPage = await asAnon(
  db,
  `select public.mk_vendor_page('habiganj-fresh-hub') as p`,
  'visitor reads shop page with schedule and fee_mode',
);
check(
  pubPage?.rows[0]?.p?.vendor?.schedule?.is_open === false &&
    pubPage?.rows[0]?.p?.vendor?.delivery?.fee_mode === 'per_km' &&
    Number(pubPage?.rows[0]?.p?.vendor?.delivery?.per_km_rate_poisha) === 4000,
  'shop page exposes schedule status and per-km fee mode',
  JSON.stringify(pubPage?.rows[0]?.p?.vendor),
);

// Customer cart marks closed shop items as not orderable, and mk_place_order refuses.
await as(
  db,
  'buyer-1',
  `select public.mk_cart_set('${productId}', 1)`,
  'customer can still add item to cart while shop is closed',
);
const cartWhenClosed = await as(
  db,
  'buyer-1',
  `select public.mk_my_cart() as c`,
  'customer reads cart while shop is closed',
);
check(
  cartWhenClosed?.rows[0]?.c?.[0]?.orderable === false &&
    cartWhenClosed?.rows[0]?.c?.[0]?.vendor_open === false,
  'cart marks line orderable = false and vendor_open = false when shop is closed',
  JSON.stringify(cartWhenClosed?.rows[0]?.c?.[0]),
);

await expectFail(
  db,
  'buyer-1',
  `select public.mk_place_order('${vendorId}', '${addr(PIN_5KM)}'::jsonb, null)`,
  '22023',
  'placing an order while the shop is closed is refused',
);

// Verify overnight window evaluation (e.g. Sunday 18:00 -> 02:00 at Monday 01:30 Asia/Dhaka).
const overnight = await db.query(`
  select bsdc.mk_schedule_status(
    true,
    '{"0":{"open":true,"start":"18:00","end":"02:00"},"1":{"open":false,"start":"09:00","end":"22:00"},"2":{"open":false,"start":"09:00","end":"22:00"},"3":{"open":false,"start":"09:00","end":"22:00"},"4":{"open":false,"start":"09:00","end":"22:00"},"5":{"open":false,"start":"09:00","end":"22:00"},"6":{"open":false,"start":"09:00","end":"22:00"}}'::jsonb,
    '2026-11-16T01:30:00+06:00'::timestamptz
  ) as s
`);
check(
  overnight.rows[0]?.s?.is_open === true && overnight.rows[0]?.s?.closes_at === '02:00',
  'overnight window carries past midnight into the next morning in Asia/Dhaka',
  JSON.stringify(overnight.rows[0]?.s),
);

// Re-open all day (00:00 -> 24:00) and verify order succeeds again.
const allOpen24 = JSON.stringify(
  Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { open: true, start: '00:00', end: '24:00' }]),
  ),
);
await as(
  db,
  'shop-owner',
  `select public.mk_vendor_set_schedule(true, '${allOpen24}'::jsonb)`,
  'owner sets 24-hour open schedule across all days',
);
const reopenedOrder = await as(
  db,
  'buyer-1',
  `select public.mk_place_order('${vendorId}', '${addr(PIN_5KM)}'::jsonb, null) as o`,
  'order succeeds once shop is within opening hours',
);
check(
  reopenedOrder?.rows[0]?.o?.status === 'placed',
  'order is placed when schedule is open',
  JSON.stringify(reopenedOrder?.rows[0]?.o),
);

// --- 3. Self-Healing Web Push & FCM Registration + Public VAPID Config --------
const unconf = await asAnon(
  db,
  `select public.push_public_config() as c`,
  'anon reads push_public_config before VAPID key is set',
);
check(
  unconf?.rows[0]?.c?.enabled === false && unconf?.rows[0]?.c?.vapid_public_key === null,
  'push_public_config reports enabled=false when unset',
);

const fakeVapidPub = 'B' + 'A'.repeat(86);
await db.exec(`
  insert into bsdc.push_settings (name, value) values
    ('vapid_public_key', '${fakeVapidPub}'),
    ('vapid_private_key', 'super-secret-private-key-never-returned'),
    ('flush_secret', 'flush-secret-0123456789abcdefghijklmnopqrstuvwxyz')
  on conflict (name) do update set value = excluded.value;
`);

const pubCfg = await asAnon(
  db,
  `select public.push_public_config() as c`,
  'anon reads push_public_config once VAPID key is stored in bsdc.push_settings',
);
check(
  pubCfg?.rows[0]?.c?.enabled === true &&
    pubCfg?.rows[0]?.c?.vapid_public_key === fakeVapidPub &&
    !JSON.stringify(pubCfg?.rows[0]?.c).includes('super-secret'),
  'push_public_config exposes only the public VAPID key and never private secrets',
  JSON.stringify(pubCfg?.rows[0]?.c),
);

// Brand-new Firebase user with NO row in public.profiles yet registers Web Push & FCM without 23503!
await as(
  db,
  'fresh-uid-no-profile',
  `select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/fresh-web-push-endpoint-123456', 'p256dh-key', 'auth-key', 'Chrome', 'bn')`,
  'member without a profile row yet can enable Web Push without 23503 FK failure',
);
await as(
  db,
  'fresh-uid-no-profile',
  `select public.register_fcm_token('fresh-android-fcm-token-0123456789abcdef', 'android', 'Pixel', 'bn')`,
  'member without a profile row yet can register Android FCM token without 23503 FK failure',
);
const healedProfile = await db.query(
  `select uid, status from public.profiles where uid = 'fresh-uid-no-profile'`,
);
check(
  healedProfile.rows[0]?.uid === 'fresh-uid-no-profile' &&
    healedProfile.rows[0]?.status === 'active',
  'self-healed profile row is active and owned by the caller',
);

// Suspended user cannot register push subscriptions.
await expectFail(
  db,
  'suspended-1',
  `select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/suspended-endpoint-123456', 'p', 'a', 'Chrome', 'en')`,
  '42501',
  'suspended account is refused by register_push_subscription',
);

const failed = summary();
process.exitCode = failed === 0 ? 0 : 1;
