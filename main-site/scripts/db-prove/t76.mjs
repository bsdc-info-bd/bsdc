/**
 * Proof for 0116 and 0117: the lighter image variant, and the timestamps that
 * never advanced.
 *
 * 0116 added `mk_products.image_variants` and taught three read models to emit it.
 * The interesting part is not the column, it is the write path: `mk_vendor_save_product`
 * now trusts a browser-supplied map, and a map that is trusted is a map that can point
 * a picture at anything. So this checks the two refusals that matter (a variant of a
 * picture the product does not show, and a plaintext variant), then checks the case
 * that actually bit the client: saving an edit that omits the field must leave the
 * stored map alone instead of blanking it, because the editor opens without the map.
 *
 * 0117 installed five `updated_at` triggers. A trigger can exist and still do nothing,
 * so this asserts the value moves rather than asserting the trigger is present.
 */
import { as, check, expectFail, summary } from './lib.mjs';
import { makeDb } from './lib.mjs';

const owner = 'aaaaaaaa-1111-4111-8111-000000000001';
const customer = 'bbbbbbbb-2222-4222-8222-000000000002';
const VENDOR = '11111111-1111-4111-8111-000000000001';

const FULL = 'https://i.ibb.co/aaa111/full.jpg';
const FULL2 = 'https://i.ibb.co/ccc333/second.jpg';
const MEDIUM = 'https://i.ibb.co/bbb222/medium.jpg';

const db = await makeDb();

await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${owner}', 'shop_owner', 'Shop Owner', 'member', 'active'),
    ('${customer}', 'buyer_one', 'Buyer One', 'member', 'active');
`);

await db.query(`insert into public.mk_vendor_applications (
  owner_uid, full_name, shop_name, nid_number, mobile, vendor_type, address_line, lat, lng,
  place_label, package_code, agreements, payment_sender, payment_holder, payment_txn_id, status
) values (
  '${owner}', 'Shop Owner', 'Rahim Stores', '1234567890', '01712345678', 'grocery',
  'House 1, Road 2, Zindabazar', 24.8949, 91.8687, 'Zindabazar, Sylhet', '10',
  '{"terms":true,"privacy":true,"vendor_policy":true,"cod_policy":true,"self_delivery":true,"accuracy":true}'::jsonb,
  '01712345678', 'Shop Owner', 'TXN-76-SHOP', 'approved')`);

const appId = (await db.query(`select id from public.mk_vendor_applications limit 1`)).rows[0].id;
await db.query(
  `insert into public.mk_vendors (id, owner_uid, application_id, slug, name, vendor_type, mobile,
     address_line, lat, lng, place_label, status)
   values ('${VENDOR}', '${owner}', $1, 'rahim-stores', 'Rahim Stores', 'grocery', '01712345678',
     'House 1, Road 2, Zindabazar', 24.8949, 91.8687, 'Zindabazar, Sylhet', 'active')`,
  [appId],
);
await db.query(`insert into public.mk_credit_ledger (vendor_id, kind, orders_delta, memo)
  values ('${VENDOR}', 'purchase', 50, 'Credit package 10')`);

// --- happy path: a product saved with one variant --------------------------
const saved = await as(
  db,
  owner,
  `select public.mk_vendor_save_product(null, jsonb_build_object(
     'name', 'Fresh milk', 'price_poisha', 9000, 'stock', 5, 'status', 'active',
     'images', jsonb_build_array('${FULL}'),
     'image_variants', jsonb_build_object('${FULL}', '${MEDIUM}')
   )) as id`,
  'a vendor saves a product with a variant',
);
const productId = saved?.rows?.[0]?.id;

const stored = await db.query(
  `select image_variants from public.mk_products where id = '${productId}'`,
);
check(
  stored.rows[0].image_variants?.[FULL] === MEDIUM,
  'a variant of a shown picture is stored',
  JSON.stringify(stored.rows[0].image_variants),
);

// --- the read models must emit it -----------------------------------------
const detail = await as(
  db,
  customer,
  `select public.mk_product_detail('${productId}') as d`,
  'mk_product_detail is callable by a member',
);
check(
  detail?.rows?.[0]?.d?.image_variants?.[FULL] === MEDIUM,
  'mk_product_detail emits the variant map',
  JSON.stringify(detail?.rows?.[0]?.d?.image_variants),
);

const page = await as(
  db,
  customer,
  `select public.mk_vendor_page('rahim-stores') as p`,
  'mk_vendor_page is callable by a member',
);
check(
  page?.rows?.[0]?.p?.products?.[0]?.image_variant === MEDIUM,
  'mk_vendor_page emits the variant of the picture it lists',
  JSON.stringify(page?.rows?.[0]?.p?.products?.[0]?.image_variant),
);

const catalog = await as(
  db,
  owner,
  `select public.mk_vendor_catalog() as c`,
  'mk_vendor_catalog is callable by the vendor',
);
check(
  catalog?.rows?.[0]?.c?.products?.[0]?.image_variants?.[FULL] === MEDIUM,
  'mk_vendor_catalog emits the variant map',
  JSON.stringify(catalog?.rows?.[0]?.c?.products?.[0]?.image_variants),
);

// --- refusals --------------------------------------------------------------
await expectFail(
  db,
  owner,
  `select public.mk_vendor_save_product('${productId}', jsonb_build_object(
     'name', 'Fresh milk', 'price_poisha', 9000,
     'images', jsonb_build_array('${FULL}'),
     'image_variants', jsonb_build_object('${FULL2}', '${MEDIUM}')
   ))`,
  '22023',
  'a variant of a picture the product does not show is refused',
);

await expectFail(
  db,
  owner,
  `select public.mk_vendor_save_product('${productId}', jsonb_build_object(
     'name', 'Fresh milk', 'price_poisha', 9000,
     'images', jsonb_build_array('${FULL}'),
     'image_variants', jsonb_build_object('${FULL}', 'http://i.ibb.co/x/y.jpg')
   ))`,
  '22023',
  'a plaintext variant is refused',
);

await expectFail(
  db,
  owner,
  `select public.mk_vendor_save_product('${productId}', jsonb_build_object(
     'name', 'Fresh milk', 'price_poisha', 9000,
     'images', jsonb_build_array('${FULL}'),
     'image_variants', jsonb_build_array('${MEDIUM}')
   ))`,
  '22023',
  'a variant map that is not an object is refused',
);

// A stranger must not be able to edit the product at all.
await expectFail(
  db,
  customer,
  `select public.mk_vendor_save_product('${productId}', jsonb_build_object(
     'name', 'Hijacked', 'price_poisha', 1))`,
  '42501',
  'a member who is not the vendor cannot edit the product',
);

// --- the case that bit the client: an edit omitting the field --------------
await as(
  db,
  owner,
  `select public.mk_vendor_save_product('${productId}', jsonb_build_object(
     'name', 'Fresh milk 1L', 'price_poisha', 9500
   ))`,
  'renaming without the field succeeds',
);
const afterRename = await db.query(
  `select name, image_variants from public.mk_products where id = '${productId}'`,
);
check(
  afterRename.rows[0].name === 'Fresh milk 1L' &&
    afterRename.rows[0].image_variants?.[FULL] === MEDIUM,
  'renaming without the field keeps the stored variant',
  JSON.stringify(afterRename.rows[0].image_variants),
);

// --- replacing the image set prunes the variant of the removed picture -----
await as(
  db,
  owner,
  `select public.mk_vendor_save_product('${productId}', jsonb_build_object(
     'name', 'Fresh milk 1L', 'price_poisha', 9500,
     'images', jsonb_build_array('${FULL2}')
   ))`,
  'the vendor replaces the product image',
);
const afterRemove = await db.query(
  `select image_variants from public.mk_products where id = '${productId}'`,
);
check(
  Object.keys(afterRemove.rows[0].image_variants ?? {}).length === 0,
  'replacing the images prunes the variant of the picture that was removed',
  JSON.stringify(afterRemove.rows[0].image_variants),
);

// --- 0117: the timestamp must actually move --------------------------------
const pkgBefore = await db.query(
  `select code, updated_at from public.mk_credit_packages order by code limit 1`,
);
await db.exec(`select pg_sleep(0.05)`);
await db.exec(
  `update public.mk_credit_packages set price_poisha = price_poisha + 100
    where code = '${pkgBefore.rows[0].code}'`,
);
const pkgAfter = await db.query(
  `select updated_at from public.mk_credit_packages where code = '${pkgBefore.rows[0].code}'`,
);
check(
  new Date(pkgAfter.rows[0].updated_at) > new Date(pkgBefore.rows[0].updated_at),
  'mk_credit_packages.updated_at advances on update',
  `${pkgBefore.rows[0].updated_at} -> ${pkgAfter.rows[0].updated_at}`,
);

await db.exec(`
  insert into public.mk_cart_items (customer_uid, product_id, qty)
  values ('${customer}', '${productId}', 1);
`);
const cartBefore = await db.query(
  `select updated_at from public.mk_cart_items where customer_uid = '${customer}'`,
);
await db.exec(`select pg_sleep(0.05)`);
await db.exec(`update public.mk_cart_items set qty = 2 where customer_uid = '${customer}'`);
const cartAfter = await db.query(
  `select updated_at from public.mk_cart_items where customer_uid = '${customer}'`,
);
check(
  new Date(cartAfter.rows[0].updated_at) > new Date(cartBefore.rows[0].updated_at),
  'mk_cart_items.updated_at advances when the quantity changes',
  `${cartBefore.rows[0].updated_at} -> ${cartAfter.rows[0].updated_at}`,
);

process.exitCode = summary() === 0 ? 0 : 1;
