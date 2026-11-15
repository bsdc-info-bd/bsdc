// 0106: marketplace products and shops are public, listed in the sitemap, and
// described to crawlers. A signed-out crawler must be able to read all of it.
import { makeDb, asAnon, summary } from './lib.mjs';

const db = await makeDb();

await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('shop-owner', 'shop_owner', 'Shop Owner', 'member', 'active');
`);
await db.query(`insert into public.mk_vendor_applications (
  owner_uid, full_name, shop_name, nid_number, mobile, vendor_type, address_line, lat, lng,
  place_label, package_code, agreements, payment_sender, payment_holder, payment_txn_id, status
) values (
  'shop-owner', 'Shop Owner', 'Sylhet Rice House', '1234567890', '01712345678', 'electronics',
  'House 1, Road 2, Zindabazar', 24.8949, 91.8687, 'Zindabazar, Sylhet', '10',
  '{"terms":true,"privacy":true,"vendor_policy":true,"cod_policy":true,"self_delivery":true,"accuracy":true}'::jsonb,
  '01712345678', 'Shop Owner', 'TXN-71-SHOP', 'approved'
)`);
const app = await db.query(`select id from public.mk_vendor_applications limit 1`);
await db.query(
  `insert into public.mk_vendors (owner_uid, application_id, slug, name, vendor_type, mobile,
  address_line, lat, lng, place_label, description, status)
  values ('shop-owner', $1, 'sylhet-rice-house', 'Sylhet Rice House', 'electronics', '01712345678',
  'House 1, Road 2, Zindabazar', 24.8949, 91.8687, 'Zindabazar, Sylhet', 'Pure Sylhet rice, sold direct.', 'active')`,
  [app.rows[0].id],
);
// A shop can only take orders while it has credits, so give it a purchase.
await db.query(`insert into public.mk_credit_ledger (vendor_id, kind, orders_delta, memo)
  select id, 'purchase', 10, 'Credit package 10' from public.mk_vendors`);
await db.query(`insert into public.mk_products (vendor_id, slug, name, description, price_poisha, stock, images, status)
  select id, 'sylhet-rice-5kg', 'Sylhet Rice 5kg', 'Fresh aromatic rice.', 45000, 9,
         array['https://i.ibb.co/example/rice.jpg'], 'active' from public.mk_vendors`);
await db.query(`insert into public.mk_products (vendor_id, slug, name, description, price_poisha, stock, images, status)
  select id, 'draft-only-item', 'Draft item', '', 1000, 1, '{}', 'draft' from public.mk_vendors`);

const product = await db.query(`select id from public.mk_products where slug = 'sylhet-rice-5kg'`);
const draft = await db.query(`select id from public.mk_products where slug = 'draft-only-item'`);
const productPath = `/marketplace/product/${product.rows[0].id}`;
const draftPath = `/marketplace/product/${draft.rows[0].id}`;
const shopPath = '/marketplace/shop/sylhet-rice-house';

let pass = 0;
const bad = [];
function check(ok, label, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`ok    ${label}`);
  } else {
    bad.push(label);
    console.log(`FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

// A signed-out crawler: anon role, no claims.
const seoProduct = await asAnon(
  db,
  `select title, robots, description, image_url from public.seo_for_path('${productPath}')`,
  'a crawler can read a live marketplace product (anon)',
);
const p = seoProduct?.rows[0];
check(p?.robots === 'index', 'a live product is indexable', p?.robots);
check((p?.title ?? '').includes('Sylhet Rice 5kg'), 'a live product has its own title', p?.title);
check(
  p?.image_url === 'https://i.ibb.co/example/rice.jpg',
  'a live product carries its picture',
  p?.image_url,
);

const seoDraft = await asAnon(
  db,
  `select robots from public.seo_for_path('${draftPath}')`,
  'a crawler can ask about an unpublished product without an error (anon)',
);
check(
  seoDraft?.rows[0]?.robots === 'noindex',
  'an unpublished product is noindex',
  seoDraft?.rows[0]?.robots,
);

const seoShop = await asAnon(
  db,
  `select title, robots, description from public.seo_for_path('${shopPath}')`,
  'a crawler can read a live shop (anon)',
);
check(seoShop?.rows[0]?.robots === 'index', 'a live shop is indexable', seoShop?.rows[0]?.robots);
check(
  (seoShop?.rows[0]?.title ?? '').includes('Sylhet Rice House'),
  'a live shop has its own title',
  seoShop?.rows[0]?.title,
);
check(
  !JSON.stringify(seoShop?.rows[0] ?? {}).includes('01712345678'),
  'a shop listing never shows the owner mobile number',
);

const urls = await asAnon(
  db,
  `select loc from public.sitemap_urls('marketproducts', 1, 1000)`,
  'the product sitemap section is readable by a crawler (anon)',
);
check(
  (urls?.rows ?? []).some((r) => r.loc === productPath),
  'the live product is in the product sitemap',
  JSON.stringify(urls?.rows),
);
check(
  !(urls?.rows ?? []).some((r) => r.loc === draftPath),
  'the unpublished product is kept out of the sitemap',
);

const shopUrls = await asAnon(
  db,
  `select loc from public.sitemap_urls('shops', 1, 1000)`,
  'the shop sitemap section is readable by a crawler (anon)',
);
check(
  (shopUrls?.rows ?? []).some((r) => r.loc === shopPath),
  'the live shop is in the shop sitemap',
  JSON.stringify(shopUrls?.rows),
);

const sections = await asAnon(
  db,
  `select section, urls from public.sitemap_sections(1000)`,
  'the sitemap index is readable by a crawler (anon)',
);
const names = (sections?.rows ?? []).map((r) => r.section);
check(
  names.includes('marketproducts') && names.includes('shops'),
  'the index advertises both marketplace sections',
  names.join(','),
);
check(
  !names.includes('products'),
  'the index no longer advertises the retired /shop/ products',
  names.join(','),
);

const legacy = await asAnon(
  db,
  `select loc from public.sitemap_urls('products', 1, 1000)`,
  'the retired products section is empty, not an error (anon)',
);
check(
  (legacy?.rows ?? []).length === 0,
  'the retired products section lists nothing',
  JSON.stringify(legacy?.rows),
);

const readProduct = await asAnon(
  db,
  `select (public.mk_product_detail('${product.rows[0].id}'::uuid) ->> 'name') as name`,
  'a signed-out visitor can read the product page data (anon)',
);
check(
  readProduct?.rows[0]?.name === 'Sylhet Rice 5kg',
  'the product page data loads signed out',
  JSON.stringify(readProduct?.rows),
);

const readShop = await asAnon(
  db,
  `select (public.mk_vendor_page('sylhet-rice-house') -> 'vendor' ->> 'name') as name`,
  'a signed-out visitor can read the shop page data (anon)',
);
check(
  readShop?.rows[0]?.name === 'Sylhet Rice House',
  'the shop page data loads signed out',
  JSON.stringify(readShop?.rows),
);

// A shop out of order credits refuses visitors, so it must not be advertised.
await db.query(`insert into public.profiles (uid, username, display_name, role, status)
  values ('empty-shop-owner', 'empty_shop', 'Empty Shop', 'member', 'active')`);
await db.query(`insert into public.mk_vendor_applications (
  owner_uid, full_name, shop_name, nid_number, mobile, vendor_type, address_line, lat, lng,
  place_label, package_code, agreements, payment_sender, payment_holder, payment_txn_id, status)
  values ('empty-shop-owner', 'Empty Shop', 'Empty Shop', '1234567890', '01812345678', 'electronics',
  'House 9, Road 1, Sylhet', 24.9, 91.87, 'Sylhet', '10',
  '{"terms":true,"privacy":true,"vendor_policy":true,"cod_policy":true,"self_delivery":true,"accuracy":true}'::jsonb,
  '01812345678', 'Empty Shop', 'TXN-71-EMPTY', 'approved')`);
await db.query(`insert into public.mk_vendors (owner_uid, application_id, slug, name, vendor_type, mobile,
  address_line, lat, lng, place_label, status)
  select 'empty-shop-owner', id, 'empty-shop', 'Empty Shop', 'electronics', '01812345678',
  'House 9, Road 1, Sylhet', 24.9, 91.87, 'Sylhet', 'active' from public.mk_vendor_applications
  where owner_uid = 'empty-shop-owner'`);
const emptySeo = await asAnon(
  db,
  `select robots from public.seo_for_path('/marketplace/shop/empty-shop')`,
  'a shop with no order credits is answered without an error (anon)',
);
check(
  emptySeo?.rows[0]?.robots === 'noindex',
  'a shop with no order credits is noindex',
  emptySeo?.rows[0]?.robots,
);
const emptyList = await asAnon(
  db,
  `select loc from public.sitemap_urls('shops', 1, 1000)`,
  'the shop sitemap is readable when a shop has no credits (anon)',
);
check(
  !(emptyList?.rows ?? []).some((r) => r.loc === '/marketplace/shop/empty-shop'),
  'a shop with no order credits is kept out of the sitemap',
);

console.log(`\n${pass} checks passed, ${bad.length} failed`);
const failedAsserts = summary();
if (bad.length > 0 || failedAsserts > 0) process.exit(1);
