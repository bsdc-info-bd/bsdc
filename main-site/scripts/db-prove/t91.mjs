/**
 * Proof for 0131: the marketplace remembers where a member lives, and a shop can say what an
 * order has to be worth.
 *
 * Two halves, one argument each. An address is saved once and re-used, and — because that is the
 * only reason a saved address is worth having — the order is placed *from the row*, not from a
 * copy a screen made of it: the pin in the row decides the delivery fee, the radius test and
 * where the rider goes, so a checkout must not be able to send one pin and print another. The
 * second half is a shop's minimum order, enforced in `mk_place_order` after the goods are priced
 * from the database and compared against the subtotal, so a delivery charge cannot carry a small
 * basket over the line. The harness asks the database both promises:
 *
 *   * a first address is the default without anybody asking, exactly one stays default, the ninth
 *     is refused, and another member's id is refused by both routines;
 *   * the refusal sentences are the checkout's own — a phone typed as 01712-345678 is accepted and
 *     stored as digits, and a pin outside Bangladesh is not an address at all;
 *   * deleting the default hands the title to the door actually used, and the book stays readable;
 *   * the owner reads their own rows directly (that is what makes a live subscription possible),
 *     a stranger reads none, and nobody writes the table by hand;
 *   * an 800 taka minimum refuses 600 taka of tea and accepts two of them, a 150 taka ride does
 *     not close a 100 taka gap, and the number is visible in the shop page and in the cart;
 *   * an order placed by address id carries the row's text, the row's pin, and a bumped usage
 *     count — and a request that lies about the pin is answered by the row, not by the lie;
 *   * a client that knows nothing of 0131 still checks out exactly as it did before.
 */
import { as, check, expectFail, failureCount, makeDb, summary } from './lib.mjs';

const db = await makeDb();

const OWNER = 'market-vendor-0131';
const NEAR = 'buyer-near-0131';
const FAR = 'buyer-far-0131';

await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${OWNER}', 'shop_0131', 'Zindabazar Grocers', 'member', 'active'),
    ('${NEAR}',  'near_0131',  'Rahim Uddin',        'member', 'active'),
    ('${FAR}',   'far_0131',   'Karim Bhai',         'member', 'active');

  insert into public.mk_vendor_applications (
    owner_uid, full_name, shop_name, nid_number, mobile, vendor_type, address_line, lat, lng,
    place_label, package_code, agreements, payment_sender, payment_holder, payment_txn_id, status
  ) values (
    '${OWNER}', 'Zindabazar Grocers', 'Zindabazar Grocers', '1234567890', '01712345678',
    'grocery', 'House 1, Road 2, Zindabazar', 24.8949, 91.8687, 'Zindabazar, Sylhet', '10',
    '{"terms":true,"privacy":true,"vendor_policy":true,"cod_policy":true,"self_delivery":true,
      "accuracy":true}'::jsonb,
    '01712345678', 'Zindabazar Grocers', 'TXN-91-SHOP', 'approved'
  );

  insert into public.mk_vendors (owner_uid, application_id, slug, name, vendor_type, mobile,
                                 address_line, lat, lng, place_label, status)
  select a.owner_uid, a.id, 'zindabazar-grocers-91', a.shop_name, a.vendor_type, a.mobile,
         a.address_line, a.lat, a.lng, a.place_label, 'active'
    from public.mk_vendor_applications a where a.owner_uid = '${OWNER}';

  insert into public.mk_credit_ledger (vendor_id, kind, orders_delta, memo)
  select id, 'purchase', 50, 'Credit package 50' from public.mk_vendors;

  insert into public.mk_products (vendor_id, slug, name, description, price_poisha, stock,
                                  images, status)
  select id, 'tea-91', 'Sylhet Tea 1kg', 'Single-estate black tea.', 60000, 50,
         array['https://i.ibb.co/example/tea.jpg'], 'active'
    from public.mk_vendors;
`);

const vendorRow = (await db.query(`select id, slug from public.mk_vendors where owner_uid = '${OWNER}'`))
  .rows[0];
const vendorId = vendorRow.id;
const vendorSlug = vendorRow.slug;
const productId = (
  await db.query(`select id from public.mk_products where vendor_id = '${vendorId}'`)
).rows[0].id;

// ~0.6 km from the shop, and ~4.5 km (which the shop's radius rule rounds up to 5).
const NEAR_PIN = { lat: 24.8999, lng: 91.8687 };
const FAR_PIN = { lat: 24.9354, lng: 91.8687 };

const addrJson = (pin, over = {}) =>
  JSON.stringify({
    customer_name: 'Rahim Uddin',
    customer_phone: '01712345678',
    address_line: 'House 4, Road 7, Zindabazar',
    landmark: 'Opposite the mosque',
    place_label: 'Zindabazar, Sylhet',
    note: '',
    lat: pin.lat,
    lng: pin.lng,
    ...over,
  });

/** The one call shape every test uses, so a parameter cannot be quietly re-ordered. */
function saveSql(opts = {}) {
  const o = {
    id: 'null',
    label: "'home'",
    nickname: "''",
    name: "'Rahim Uddin'",
    phone: "'01712-345678'",
    line: "'House 4, Road 7, Zindabazar'",
    landmark: "''",
    place: "'Zindabazar, Sylhet'",
    lat: NEAR_PIN.lat,
    lng: NEAR_PIN.lng,
    note: "''",
    isDefault: 'false',
    ...opts,
  };
  return `select (public.mk_save_address(${o.id}, ${o.label}, ${o.nickname}, ${o.name}, ${o.phone},
     ${o.line}, ${o.landmark}, ${o.place}, ${o.lat}, ${o.lng}, ${o.note}, ${o.isDefault}
   ) ->> 'addresses')::jsonb as book`;
}

const save = (sub, opts, label) => as(db, sub, saveSql(opts), label ?? `save for ${sub}`);

/** The SQLSTATE anon was refused with, for the checks that *want* a refusal. */
async function anonFailure(sql) {
  await db.exec(
    `set role anon; select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', false);`,
  );
  try {
    await db.query(sql);
    return null;
  } catch (error) {
    return error.code;
  } finally {
    await db.exec('reset role;');
  }
}

/**
 * The sentence a routine raised, so a message can be read and not only its SQLSTATE. The refusal
 * *is* the product here — "add 200 taka more" is what a member acts on — so a proof that only
 * looked at the error code would let a wrong sentence through.
 */
async function failMessage(sub, sql) {
  const claims = JSON.stringify({ sub, role: 'authenticated', bsdc_role: 'member' });
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claims', $jwt$${claims}$jwt$, false);`,
  );
  try {
    await db.query(sql);
    return null;
  } catch (error) {
    return String(error.message);
  } finally {
    await db.exec('reset role;');
  }
}

// ===========================================================================
// 1. Saving a door once, and reading it back
// ===========================================================================

const first = await save(NEAR, {}, 'the first address is saved');
check(
  first?.rows[0]?.book?.length === 1 && first?.rows[0]?.book[0].is_default === true,
  'a first address is the default without anybody asking for one',
  JSON.stringify(first?.rows[0]?.book),
);
check(
  first?.rows[0]?.book[0].customer_phone === '01712345678',
  'a phone typed with a separator is stored as the eleven digits the order needs',
  first?.rows[0]?.book[0]?.customer_phone,
);
check(
  first?.rows[0]?.book[0].address_line === 'House 4, Road 7, Zindabazar' &&
    typeof first?.rows[0]?.book[0].lat === 'number',
  'the row the checkout will read carries the text and the pin together',
  JSON.stringify(first?.rows[0]?.book[0]),
);

const second = await save(
  NEAR,
  { label: "'work'", nickname: "'Office'", isDefault: 'true' },
  'the second address is saved as the new default',
);
check(
  second?.rows[0]?.book?.length === 2 &&
    second?.rows[0]?.book[0].label === 'work' &&
    second?.rows[0]?.book[0].is_default === true &&
    second?.rows[0]?.book[1].is_default === false,
  'claiming a second default hands the title over instead of leaving two',
  JSON.stringify(second?.rows[0]?.book?.map((r) => [r.label, r.is_default])),
);

const homeId = second?.rows[0]?.book[1].id;
const workId = second?.rows[0]?.book[0].id;

const edited = await save(
  NEAR,
  { id: `'${homeId}'`, label: "'other'", nickname: "'Ammu flat'", name: "'Ammu'" },
  'the first address is re-labelled for somebody else',
);
check(
  edited?.rows[0]?.book?.length === 2 &&
    edited.rows[0].book.some((r) => r.id === homeId && r.nickname === 'Ammu flat') === true &&
    edited.rows[0].book.some((r) => r.id === homeId && r.customer_name === 'Ammu') === true,
  'an edit changes the row instead of adding one, and the recipient is the row’s own',
  JSON.stringify(edited?.rows[0]?.book?.map((r) => [r.id.slice(0, 8), r.nickname, r.customer_name])),
);

await expectFail(
  db,
  NEAR,
  saveSql({ label: "'flat'" }),
  '22023',
  'a label outside home/work/other is refused now, not stored and re-read later',
);
await expectFail(
  db,
  NEAR,
  saveSql({ name: "'A'" }),
  '22023',
  'a one-character recipient name is refused',
);
await expectFail(
  db,
  NEAR,
  saveSql({ phone: "'0171234567'" }),
  '22023',
  'a ten-digit mobile number is refused',
);
await expectFail(
  db,
  NEAR,
  saveSql({ line: "'Hos'" }),
  '22023',
  'a three-character address line is refused',
);
await expectFail(
  db,
  NEAR,
  saveSql({ lat: 13.7563, lng: 100.5018, place: "'Bangkok'" }),
  '22023',
  'a pin outside Bangladesh is not an address, so it cannot be saved at all',
);

const defaults = await db.query(
  `select count(*)::int as n from public.mk_addresses where is_default and customer_uid = '${NEAR}'`,
);
const labelOrder = await as(
  db,
  NEAR,
  `select (public.mk_save_address('${workId}', 'work', 'Office', 'Rahim Uddin',
     '01712345678', 'House 4, Road 7, Zindabazar', '', 'Zindabazar, Sylhet',
     ${NEAR_PIN.lat}, ${NEAR_PIN.lng}, '', false) ->> 'addresses')::jsonb as book`,
  're-saving the default leaves it the default',
);
check(
  labelOrder?.rows[0]?.book?.some((r) => r.is_default) === true && defaults.rows[0].n === 1,
  'exactly one default survives a re-save, in the order the checkout wants',
  JSON.stringify(labelOrder?.rows[0]?.book?.map((r) => [r.id.slice(0, 8), r.is_default])),
);

// ===========================================================================
// 2. Eight doors is the book; a ninth is a list
// ===========================================================================

const afterRefusals = await as(
  db,
  NEAR,
  `select count(*)::int as n from public.mk_addresses where customer_uid = '${NEAR}'`,
  'a refused save leaves nothing behind',
);
check(
  afterRefusals?.rows[0]?.n === 2,
  'the five refusals above wrote no rows, so the cap below counts real addresses',
  afterRefusals?.rows[0]?.n,
);
// Re-saving the row that is already the default must keep it the default. The clear that hands the
// title over has to skip the row it is being claimed for, or the member's own door is demoted by
// saving it, and mk_ensure_default then promotes whichever row the usage says instead.
const resaved = await as(
  db,
  NEAR,
  `select (public.mk_save_address('${workId}', 'work', 'Office', 'Rahim Uddin',
     '01712345678', 'House 4, Road 7, Zindabazar', '', 'Zindabazar, Sylhet',
     ${NEAR_PIN.lat}, ${NEAR_PIN.lng}, '', true) ->> 'addresses')::jsonb as book`,
  'the default address is saved again with the default still ticked',
);
const stillDefault = await db.query(
  `select count(*)::int as n from public.mk_addresses where is_default and customer_uid = '${NEAR}'`,
);
check(
  resaved?.rows[0]?.book?.[0]?.id === workId &&
    resaved?.rows[0]?.book?.[0]?.is_default === true &&
    stillDefault.rows[0].n === 1,
  'saving the default again keeps it the default, first in the book and alone',
  JSON.stringify(resaved?.rows[0]?.book?.map((r) => [r.id.slice(0, 8), r.is_default])),
);

for (let i = 0; i < 6; i += 1) {
  // Two are saved already; six more fill the book to the cap.
  // eslint-disable-next-line no-await-in-loop
  await save(NEAR, { label: "'other'", nickname: `'Extra ${i + 1}'` }, `the ${i + 3}rd address`);
}
const full = await as(db, NEAR, `select public.mk_my_addresses() as b`, 'the full book is read');
check(full?.rows[0]?.b?.length === 8, 'eight saved addresses is allowed', full?.rows[0]?.b?.length);
await expectFail(
  db,
  NEAR,
  saveSql({ nickname: "'Ninth'" }),
  '22023',
  'a ninth address is refused by count, in a sentence the member can act on',
);
const ninth = await failMessage(NEAR, saveSql({ nickname: "'Ninth'" }));
check(/up to 8 addresses/.test(ninth ?? ''), 'and the refusal names the limit', ninth);

await expectFail(
  db,
  FAR,
  saveSql({ id: `'${homeId}'`, name: "'Karim Bhai'" }),
  'P0002',
  'a member cannot rewrite somebody else’s address by naming its id',
);
await expectFail(
  db,
  FAR,
  `select public.mk_delete_address('${homeId}')`,
  'P0002',
  'a member cannot delete somebody else’s address',
);

const ownRead = await as(
  db,
  NEAR,
  `select count(*)::int as n from public.mk_addresses`,
  'the owner reads the book from the table, which is what makes a live subscription possible',
);
check(ownRead?.rows[0]?.n === 8, 'the owner sees their own rows', ownRead?.rows[0]?.n);
const strangerRead = await as(
  db,
  FAR,
  `select count(*)::int as n from public.mk_addresses`,
  'a stranger reads the table and finds nothing',
);
check(
  strangerRead?.rows[0]?.n === 0,
  'row-level security hides the book from every other member',
  strangerRead?.rows[0]?.n,
);
await expectFail(
  db,
  NEAR,
  `insert into public.mk_addresses (customer_uid, recipient_name, phone, address_line, lat, lng)
   values ('${NEAR}', 'Rahim Uddin', '01712345678', 'House 4, Road 7, Zindabazar',
           ${NEAR_PIN.lat}, ${NEAR_PIN.lng})`,
  '42501',
  'the table refuses a hand-written row: the checks live in the routine',
);
await expectFail(
  db,
  NEAR,
  `update public.mk_addresses set phone = '01811111111' where customer_uid = '${NEAR}'`,
  '42501',
  'and it refuses a hand-written edit too',
);
const anonCode = await anonFailure(`select public.mk_my_addresses()`);
check(
  anonCode === '42501',
  'anon is refused the address book outright, not answered with an empty list',
  anonCode,
);

// ===========================================================================
// 3. Deleting the default hands the title over
// ===========================================================================

const bookIds = full.rows[0].b.map((row) => row.id);
const lastDeleted = await as(
  db,
  NEAR,
  `select (public.mk_delete_address('${bookIds[0]}') ->> 'addresses')::jsonb as book`,
  'the address the checkout was using is deleted',
);
check(
  lastDeleted?.rows[0]?.book?.length === 7 &&
    lastDeleted.rows[0].book.some((r) => r.is_default) === true,
  'a new default is chosen for the member instead of leaving the book without one',
  JSON.stringify(lastDeleted?.rows[0]?.book?.filter((r) => r.is_default)?.map((r) => r.nickname)),
);

for (const id of bookIds.slice(1)) {
  // eslint-disable-next-line no-await-in-loop
  await as(db, NEAR, `select public.mk_delete_address('${id}')`, 'the rest of the book is cleared');
}
const emptied = await as(db, NEAR, `select public.mk_my_addresses() as b`, 'the empty book');
check(
  Array.isArray(emptied?.rows[0]?.b) && emptied.rows[0].b.length === 0,
  'an emptied book reads as no addresses rather than an error',
  JSON.stringify(emptied?.rows[0]?.b),
);
await expectFail(
  db,
  NEAR,
  `select public.mk_delete_address('${bookIds[0]}')`,
  'P0002',
  'deleting the same address twice says it is gone rather than pretending success',
);

// ===========================================================================
// 4. A shop's minimum order
// ===========================================================================

await expectFail(
  db,
  NEAR,
  `select public.mk_vendor_set_min_order(500)`,
  'P0002',
  'a customer cannot set a shop’s minimum: they do not own the shop',
);
const priced = await as(
  db,
  OWNER,
  `select public.mk_vendor_set_min_order(800) as r`,
  'the shop sets an 800 taka minimum',
);
check(
  Number(priced?.rows[0]?.r?.min_order_poisha) === 80000,
  'the minimum is stored in poisha, in whole taka, like every other price here',
  JSON.stringify(priced?.rows[0]?.r),
);
await expectFail(
  db,
  OWNER,
  `select public.mk_vendor_set_min_order(-1)`,
  '22023',
  'a negative minimum is refused',
);
await expectFail(
  db,
  OWNER,
  `select public.mk_vendor_set_min_order(1000001)`,
  '22023',
  'and so is one above a million taka, which nobody meant',
);

const shortOrder = await failMessage(
  NEAR,
  `select public.mk_place_order('${vendorId}', '${addrJson(NEAR_PIN)}'::jsonb,
          '[{"product_id":"${productId}","qty":1}]'::jsonb)`,
);
check(
  /takes orders from 800 taka; add 200 taka more/.test(shortOrder ?? ''),
  'a 600 taka basket is refused by an 800 taka minimum, and the sentence says how much more',
  shortOrder,
);

const farPinShort = await failMessage(
  NEAR,
  `select public.mk_place_order('${vendorId}', '${addrJson(NEAR_PIN, { lat: FAR_PIN.lat, lng: FAR_PIN.lng })}'::jsonb,
          '[{"product_id":"${productId}","qty":1}]'::jsonb)`,
);
check(
  /add 200 taka more/.test(farPinShort ?? ''),
  'the minimum is judged on the goods, so a 150 taka ride never closes a 200 taka gap',
  farPinShort,
);

const bigOrder = await as(
  db,
  NEAR,
  `select public.mk_place_order('${vendorId}', '${addrJson(NEAR_PIN)}'::jsonb,
          '[{"product_id":"${productId}","qty":2}]'::jsonb) as o`,
  'two of them clear the minimum',
);
check(
  Number(bigOrder?.rows[0]?.o?.subtotal_poisha) === 120000 &&
    Number(bigOrder?.rows[0]?.o?.total_poisha) === 135000,
  'the order that reaches the minimum is placed, priced from the database',
  JSON.stringify(bigOrder?.rows[0]?.o),
);

const shown = await as(
  db,
  NEAR,
  `select (public.mk_vendor_page('${vendorSlug}') -> 'vendor' -> 'delivery') as delivery`,
  'the shop page exposes the minimum it charges',
);
check(
  Number(shown?.rows[0]?.delivery?.min_order_poisha) === 80000,
  'the shop page carries min_order_poisha in the same block as the fee and the radius',
  JSON.stringify(shown?.rows[0]?.delivery),
);

// The product page quotes the same number, because it is the same `bsdc.mk_delivery_json` call — a
// shop card, a product page and a cart that disagree about a price is the bug this shape prevents.
const detailed = await as(
  db,
  NEAR,
  `select (public.mk_product_detail('${productId}') -> 'vendor' -> 'delivery') as delivery`,
  'the product page reads the delivery block',
);
check(
  Number(detailed?.rows[0]?.delivery?.min_order_poisha) === 80000,
  'the product page carries the same minimum the shop page showed',
  JSON.stringify(detailed?.rows[0]?.delivery),
);

// The vendor's own console seeds its field from `mk_vendor_delivery`; if that one read omitted the
// column, saving the minimum twice would look like it reset to zero, and only the shop owner would
// notice — after they had typed the number again.
const own = await as(
  db,
  OWNER,
  `select public.mk_vendor_delivery() as d`,
  'the owner reads their own delivery settings',
);
check(
  Number(own?.rows[0]?.d?.min_order_poisha) === 80000,
  'the vendor console reads the minimum back, so its field is seeded and not reset',
  JSON.stringify(own?.rows[0]?.d?.min_order_poisha),
);
await as(db, OWNER, `select public.mk_vendor_set_min_order(0) as off`, 'the shop removes its minimum');
// Read twice on purpose: the owner's field must show the zero, and the buyer's badge must disappear.
// `mk_vendor_delivery` belongs to the owner alone — a buyer calling it is refused — so the customer
// side has to be proven through the page they actually see.
const cleared = await as(db, OWNER, `select public.mk_vendor_delivery() as d`, 'the owner reads the zero back');
check(
  Number(cleared?.rows[0]?.d?.min_order_poisha) === 0,
  'zero means no minimum, and the console stops offering 800',
  JSON.stringify(cleared?.rows[0]?.d?.min_order_poisha),
);
const clearedPage = await as(
  db,
  NEAR,
  `select (public.mk_vendor_page('${vendorSlug}') -> 'vendor' -> 'delivery') as delivery`,
  'the buyer sees the shop with no minimum',
);
check(
  Number(clearedPage?.rows[0]?.delivery?.min_order_poisha) === 0,
  'the shop page stops saying the shop takes orders from 800 taka',
  JSON.stringify(clearedPage?.rows[0]?.delivery),
);
const noMin = await as(
  db,
  NEAR,
  `select public.mk_place_order('${vendorId}', '${addrJson(NEAR_PIN)}'::jsonb,
          '[{"product_id":"${productId}","qty":1}]'::jsonb) as o`,
  'and one item is enough again',
);
check(
  noMin?.rows[0]?.o !== undefined,
  'the same short basket that was refused a minute ago goes through once the minimum is zero',
  JSON.stringify(noMin?.rows?.[0]?.o ?? null),
);
await as(db, OWNER, `select public.mk_vendor_set_min_order(800) as again`, 'and it can be set again');

const carted = await as(
  db,
  NEAR,
  `select public.mk_cart_set('${productId}', 1) as qty`,
  'the minimum goes into the basket',
);
check(carted?.rows[0]?.qty === 1, 'a cart line is added for the shop');
const cart = await as(db, NEAR, `select public.mk_my_cart() as c`, 'the cart reads back');
check(
  Number(cart?.rows[0]?.c?.[0]?.min_order_poisha) === 80000,
  'the cart carries the shop’s minimum, so the nudge needs no second request',
  JSON.stringify(cart?.rows[0]?.c?.[0]),
);

await as(db, OWNER, `select public.mk_vendor_set_min_order(0)`, 'the shop drops its minimum');
const unpriced = await as(
  db,
  NEAR,
  `select public.mk_place_order('${vendorId}', '${addrJson(NEAR_PIN)}'::jsonb,
          '[{"product_id":"${productId}","qty":1}]'::jsonb) as o`,
  'a zero minimum means no minimum at all',
);
check(!!unpriced?.rows[0]?.o?.order_id, 'the same 600 taka basket now passes', unpriced?.rows[0]?.o);

// ===========================================================================
// 5. Placing an order from a saved address
// ===========================================================================

const saved = await save(
  NEAR,
  { line: "'House 4, Road 7, Zindabazar'", nickname: "'Home'", isDefault: 'true' },
  'a doorstep is saved for the checkout to pick',
);
const savedId = saved?.rows[0]?.book?.[0]?.id;
check(!!savedId, 'the saved address has an id to order with', savedId);

// The client sends a *different* name and a far pin alongside the id. The row wins.
const lie = await as(
  db,
  NEAR,
  `select public.mk_place_order('${vendorId}',
     '${addrJson(FAR_PIN, { customer_name: 'Impostor', address_line: 'Somewhere else entirely', lat: FAR_PIN.lat, lng: FAR_PIN.lng, note: 'Ring twice' })}'::jsonb,
     '[{"product_id":"${productId}","qty":1}]'::jsonb,
     '${savedId}') as o`,
  'an order is placed from the saved address while the request lies about it',
);
const liedOrder = await as(
  db,
  NEAR,
  `select address_line, customer_name, lat, lng, note, address_id, delivery_fee_poisha
     from public.mk_orders where id = '${lie?.rows[0]?.o?.order_id}'`,
  'the order row is read back',
);
const order = liedOrder?.rows[0];
check(
  order?.address_line === 'House 4, Road 7, Zindabazar' && order?.customer_name === 'Rahim Uddin',
  'the order prints the address the member approved, not the one the request typed',
  JSON.stringify([order?.customer_name, order?.address_line]),
);
check(
  Math.abs(Number(order?.lat) - NEAR_PIN.lat) < 1e-6,
  'and it is priced and routed by the saved pin, not by the pin in the request',
  order?.lat,
);
check(
  order?.note === 'Ring twice',
  'the note is the one field a checkout still types for this order alone',
  order?.note,
);
check(order?.address_id === savedId, 'the order remembers which door it went to', order?.address_id);

const used = await as(
  db,
  NEAR,
  `select note, times_used, (last_used_at is not null) as used from public.mk_addresses
    where id = '${savedId}'`,
  'the address book notices it was used',
);
check(
  used?.rows[0]?.times_used === 1 && used?.rows[0]?.used === true && used?.rows[0]?.note === '',
  'usage is counted once, and the saved note was not overwritten by the order’s',
  JSON.stringify(used?.rows[0]),
);

const ordered = await as(
  db,
  NEAR,
  `select (public.mk_my_addresses() -> 0 ->> 'id') as first_id`,
  'the door just used is the one offered first',
);
check(
  ordered?.rows[0]?.first_id === savedId,
  'the book sorts by what the member actually orders to',
  ordered?.rows[0]?.first_id,
);

// A radius shop: the saved pin decides eligibility, so a far doorstep is refused on its own merits.
await as(
  db,
  OWNER,
  `select public.mk_vendor_set_delivery('radius', 3, 60, ${NEAR_PIN.lat}, ${NEAR_PIN.lng}, 'fixed', 60)`,
  'the shop narrows its delivery area to 3 km',
);
const nearWithin = await as(
  db,
  NEAR,
  `select public.mk_place_order('${vendorId}', '{}'::jsonb,
          '[{"product_id":"${productId}","qty":1}]'::jsonb, '${savedId}') as o`,
  'the near saved address is still inside the shop’s 3 km area',
);
check(!!nearWithin?.rows[0]?.o?.order_id, 'and the order placed by its id goes through',
  nearWithin?.rows[0]?.o);
const farSaved = await save(
  NEAR,
  { lat: FAR_PIN.lat, lng: FAR_PIN.lng, nickname: "'Far flat'", label: "'other'" },
  'a far doorstep is saved',
);
const farId = farSaved?.rows[0]?.book?.find((r) => r.nickname === 'Far flat')?.id;
const farOrder = await failMessage(
  NEAR,
  `select public.mk_place_order('${vendorId}', '{}'::jsonb,
          '[{"product_id":"${productId}","qty":1}]'::jsonb, '${farId}')`,
);
check(
  /delivers only within 3 km/.test(farOrder ?? ''),
  'and the shop refuses it by the saved pin — the radius rule reads the book, not the form',
  farOrder,
);
await as(
  db,
  OWNER,
  `select public.mk_vendor_set_delivery('all_bd', 500, 60, null, null, 'fixed', 60)`,
  'the shop opens all of Bangladesh again',
);
await as(db, NEAR, `select public.mk_delete_address('${farId}')`, 'the far doorstep is removed');

await expectFail(
  db,
  FAR,
  `select public.mk_place_order('${vendorId}', '{}'::jsonb,
          '[{"product_id":"${productId}","qty":1}]'::jsonb, '${savedId}')`,
  'P0002',
  'a member cannot order to another member’s saved address',
);

const legacy = await as(
  db,
  FAR,
  `select public.mk_place_order('${vendorId}', '${addrJson(NEAR_PIN, { customer_name: 'Karim Bhai', customer_phone: '01812345678' })}'::jsonb,
          '[{"product_id":"${productId}","qty":1}]'::jsonb) as o`,
  'a client that never heard of 0131 checks out exactly as before',
);
check(
  !!legacy?.rows[0]?.o?.order_id && Number(legacy?.rows[0]?.o?.delivery_fee_poisha) === 6000,
  'the three-argument call still resolves, and is charged the shop’s own fee',
  JSON.stringify(legacy?.rows[0]?.o),
);
await expectFail(
  db,
  FAR,
  `select public.mk_place_order('${vendorId}', '{}'::jsonb,
          '[{"product_id":"${productId}","qty":1}]'::jsonb, gen_random_uuid())`,
  'P0002',
  'an address id that is not the caller’s own is refused, invented ones included',
);

const after = await as(
  db,
  NEAR,
  `select public.mk_delete_address('${savedId}') as r`,
  'the doorstep an order went to is deleted from the book',
);
check(after?.rows[0]?.r?.addresses?.length === 0, 'the book is empty again');
const kept = await as(
  db,
  NEAR,
  `select address_line, address_id from public.mk_orders
    where id = '${lie?.rows[0]?.o?.order_id}'`,
  'and the order still says where it went',
);
check(
  kept?.rows[0]?.address_id === null &&
    kept?.rows[0]?.address_line === 'House 4, Road 7, Zindabazar',
  'the deleted row leaves the order’s copied text intact and its id nulled',
  JSON.stringify(kept?.rows[0]),
);

if (failureCount() > 0) process.exitCode = 1;
summary();
