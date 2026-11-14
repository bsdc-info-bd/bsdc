/**
 * 0094: the new cash-on-delivery marketplace, end to end, on real migrations.
 *
 * Proves the business rules from the owner's brief:
 *  - applications need every agreement, a pinned Bangladesh location, a valid NID
 *    and mobile, and a credit package; a bKash/Nagad transaction ID is used once
 *  - the BSDC payment number is visible only to signed-in applicants
 *  - an applicant is not listed until staff approve, and approval grants credits
 *  - accepting an order consumes exactly one credit; declining consumes none
 *  - at zero credits the shop is unlisted, cannot take orders, and is relisted
 *    only after a new package is approved
 *  - delivery fee 150 taka (15000 poisha) and DB-side pricing
 *  - stock is locked, decremented, and restored on cancellation
 *  - reviews only after delivery, once per order
 *  - customers cannot read other customers' orders; vendors see contact details
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
    console.log(`FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

const db = await makeDb();
const staff = 'mk-staff';
const vendorUid = 'mk-vendor';
const vendor2Uid = 'mk-vendor-2';
const cust1 = 'mk-customer-1';
const cust2 = 'mk-customer-2';
const applicant2 = 'mk-applicant-2';

await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${staff}', 'mk_staff', 'MK Staff', 'admin', 'active'),
    ('${vendorUid}', 'mk_vendor', 'MK Vendor', 'member', 'active'),
    ('${vendor2Uid}', 'mk_vendor2', 'MK Vendor Two', 'member', 'active'),
    ('${cust1}', 'mk_cust1', 'MK Customer One', 'member', 'active'),
    ('${cust2}', 'mk_cust2', 'MK Customer Two', 'member', 'active'),
    ('${applicant2}', 'mk_applicant2', 'MK Applicant Two', 'member', 'active');
`);

async function run(sql, uid) {
  const claims = uid ? JSON.stringify({ sub: uid, role: 'authenticated' }) : '{}';
  const role = uid ? 'authenticated' : 'anon';
  await db.exec(
    `set role ${role}; select set_config('request.jwt.claims', $jwt$${claims}$jwt$, false);`,
  );
  try {
    const result = await db.query(sql);
    return { rows: result.rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec('reset role');
  }
}

const ok = (r) => r.error === null;
const code = (r) => r.error?.code ?? '';

// Application payload builder
const agreements = {
  terms: true,
  privacy: true,
  vendor_policy: true,
  cod_policy: true,
  self_delivery: true,
  accuracy: true,
};
const application = (overrides = {}) => ({
  full_name: 'Rahim Uddin',
  shop_name: 'Sylhet Fresh Mart',
  nid_number: '1234567890123',
  mobile: '01712345678',
  vendor_type: 'grocery',
  address_line: 'Zindabazar, Sylhet Sadar',
  lat: 24.8949,
  lng: 91.8687,
  place_label: 'Zindabazar, Sylhet, Bangladesh',
  trade_license_no: '',
  package_code: '10',
  agreements,
  payment_sender: '01888000111',
  payment_holder: 'Rahim Uddin',
  payment_txn_id: 'TXN-A-0001',
  ...overrides,
});
const appJson = (p) => `'${JSON.stringify(p).replace(/'/g, "''")}'::jsonb`;

// 1. Payment number is for signed-in applicants only
const anonPay = await run(`select public.mk_payment_instructions()`, null);
check(code(anonPay) === '42501', 'anonymous visitors cannot see the BSDC payment number', code(anonPay));

await db.exec(`insert into public.mk_settings (key, value) values ('bikash_number', '') on conflict (key) do nothing;`);
const memberSet = await run(
  `select public.mk_admin_set_setting('bikash_number', '01711111111')`,
  vendorUid,
);
check(code(memberSet) === '42501', 'a member cannot change the bKash number', code(memberSet));
const badSet = await run(
  `select public.mk_admin_set_setting('bikash_number', '12345')`,
  staff,
);
check(code(badSet) === '22023', 'the bKash number must be a valid Bangladesh mobile', code(badSet));
const setBikash = await run(
  `select public.mk_admin_set_setting('bikash_number', '01711111111')`,
  staff,
);
check(ok(setBikash), 'staff set the BSDC bKash number', setBikash.error?.message);

const pay = await run(`select public.mk_payment_instructions() as p`, vendorUid);
check(
  pay.rows[0]?.p?.bikash_number === '01711111111' &&
    pay.rows[0]?.p?.delivery_fee_poisha === 15000 &&
    pay.rows[0]?.p?.packages?.length === 3,
  'signed-in applicant sees the bKash number, 150-taka fee, and three packages',
  JSON.stringify(pay.rows[0]?.p),
);

// 2. Application validation
const noAgree = await run(
  `select public.mk_submit_vendor_application(${appJson(application({ agreements: { ...agreements, privacy: false } }))})`,
  vendorUid,
);
check(code(noAgree) === '22023', 'an unticked agreement blocks the application', code(noAgree));

const noPin = await run(
  `select public.mk_submit_vendor_application(${appJson(application({ lat: 40.7, lng: -74.0 }))})`,
  vendorUid,
);
check(code(noPin) === '22023', 'a location outside Bangladesh is rejected', code(noPin));

const badNid = await run(
  `select public.mk_submit_vendor_application(${appJson(application({ nid_number: '12345' }))})`,
  vendorUid,
);
check(code(badNid) === '22023' || code(badNid) === '23514', 'an invalid NID number is rejected', code(badNid));

const badPkg = await run(
  `select public.mk_submit_vendor_application(${appJson(application({ package_code: '7' }))})`,
  vendorUid,
);
check(code(badPkg) === '22023', 'an unknown credit package is rejected', code(badPkg));

const badType = await run(
  `select public.mk_submit_vendor_application(${appJson(application({ vendor_type: 'casino' }))})`,
  vendorUid,
);
check(code(badType) === '22023', 'an unknown shop type is rejected', code(badType));

const submit = await run(
  `select public.mk_submit_vendor_application(${appJson(application())}) as r`,
  vendorUid,
);
const appId = submit.rows[0]?.r?.application_id;
check(submit.rows[0]?.r?.status === 'submitted' && Boolean(appId), 'a complete application is submitted', submit.error?.message);

const dupApp = await run(
  `select public.mk_submit_vendor_application(${appJson(application({ shop_name: 'Second Shop' }))})`,
  vendorUid,
);
check(code(dupApp) === '23505', 'a second open application from the same person is refused', code(dupApp));

const dupTxn = await run(
  `select public.mk_submit_vendor_application(${appJson(application({
    full_name: 'Other Person', shop_name: 'Other Shop', mobile: '01999000111',
    payment_txn_id: 'txn-a-0001', nid_number: '9876543210987',
  }))})`,
  applicant2,
);
check(code(dupTxn) === '23505', 'a transaction ID already used cannot be reused, case-insensitively', code(dupTxn));

// 3. Not listed before approval
const beforeApprove = await run(`select public.mk_list_vendors(null, '', null, null, 50) as v`, null);
check(beforeApprove.rows[0]?.v?.length === 0, 'an unapproved applicant is not listed', JSON.stringify(beforeApprove.rows[0]?.v));

const memberDecide = await run(
  `select public.mk_admin_decide_application('${appId}', 'approve', '')`,
  vendorUid,
);
check(code(memberDecide) === '42501', 'a member cannot approve an application', code(memberDecide));

const rejectShort = await run(
  `select public.mk_admin_decide_application('${appId}', 'reject', 'no')`,
  staff,
);
check(code(rejectShort) === '22023', 'a rejection needs a reason of at least 5 characters', code(rejectShort));

const approve = await run(
  `select public.mk_admin_decide_application('${appId}', 'approve', 'Documents verified') as r`,
  staff,
);
const vendorId = approve.rows[0]?.r?.vendor_id;
check(approve.rows[0]?.r?.status === 'approved' && Boolean(vendorId), 'staff approve creates the shop', approve.error?.message);

const dash = await run(`select public.mk_vendor_dashboard() as d`, vendorUid);
check(
  dash.rows[0]?.d?.credits === 10 && dash.rows[0]?.d?.listed === true,
  'approval grants 10 order credits and lists the shop',
  JSON.stringify(dash.rows[0]?.d),
);
const slugRow = await db.query(`select slug from public.mk_vendors where id = $1`, [vendorId]);
const slug = slugRow.rows[0]?.slug;

// 4. Catalogue
const catSave = await run(
  `select public.mk_vendor_save_category(null, 'Rice & Oil', 1) as id`,
  vendorUid,
);
const catId = catSave.rows[0]?.id;
check(Boolean(catId), 'vendor creates a category', catSave.error?.message);

const httpImg = await run(
  `select public.mk_vendor_save_product(null, ${appJson({
    name: 'Nazirshail Rice 5kg', price_poisha: 45000, stock: 5, status: 'active',
    category_id: catId, images: ['http://insecure.example/rice.jpg'],
  })})`,
  vendorUid,
);
check(code(httpImg) === '22023', 'product images must be https links', code(httpImg));

const prodSave = await run(
  `select public.mk_vendor_save_product(null, ${appJson({
    name: 'Nazirshail Rice 5kg', description: 'Premium Sylhet rice', price_poisha: 45000,
    stock: 5, status: 'active', category_id: catId, images: ['https://i.ibb.co/demo/rice.webp'],
  })}) as id`,
  vendorUid,
);
const productId = prodSave.rows[0]?.id;
check(Boolean(productId), 'vendor publishes a product with stock 5 at 450 taka', prodSave.error?.message);

const oilSave = await run(
  `select public.mk_vendor_save_product(null, ${appJson({
    name: 'Soybean Oil 1L', price_poisha: 18000, stock: 10, status: 'active',
    images: ['https://i.ibb.co/demo/oil.webp'],
  })}) as id`,
  vendorUid,
);
const oilId = oilSave.rows[0]?.id;

const vendorPage = await run(`select public.mk_vendor_page('${slug}') as p`, null);
check(
  vendorPage.rows[0]?.p?.products?.length === 2,
  'anonymous visitors see the shop and its active products',
  vendorPage.error?.message,
);

// Product update keeps images and status when omitted
await run(
  `select public.mk_vendor_save_product('${productId}', ${appJson({ name: 'Nazirshail Rice 5kg', price_poisha: 45000 })})`,
  vendorUid,
);
const kept = await db.query(`select status, array_length(images, 1) as n from public.mk_products where id = $1`, [productId]);
check(kept.rows[0]?.status === 'active' && kept.rows[0]?.n === 1, 'updating a product keeps its status and images when omitted');

// 5. Cart and direct order
const cartAdd = await run(`select public.mk_cart_set('${productId}', 2) as q`, cust1);
check(cartAdd.rows[0]?.q === 2, 'customer adds 2 to cart', cartAdd.error?.message);
const cartBad = await run(`select public.mk_cart_set('${productId}', 99)`, cust1);
check(code(cartBad) === '22023', 'cart quantity above 50 is refused', code(cartBad));

const cart = await run(`select public.mk_my_cart() as c`, cust1);
check(cart.rows[0]?.c?.[0]?.orderable === true, 'cart line is orderable', JSON.stringify(cart.rows[0]?.c));

const addrBad = await run(
  `select public.mk_place_order('${vendorId}', ${appJson({
    customer_name: 'Karim', customer_phone: '0171', address_line: 'Sylhet Sadar road',
    lat: 24.9, lng: 91.87,
  })}, null)`,
  cust1,
);
check(code(addrBad) === '22023', 'an invalid phone number blocks checkout', code(addrBad));

const addr = {
  customer_name: 'Karim Ahmed',
  customer_phone: '01555123456',
  address_line: 'House 12, Road 4, Amberkhana',
  landmark: 'Opposite the mosque',
  lat: 24.9045,
  lng: 91.8611,
  place_label: 'Amberkhana, Sylhet',
  note: 'Call before arriving',
};

const placeCart = await run(
  `select public.mk_place_order('${vendorId}', ${appJson(addr)}, null) as o`,
  cust1,
);
const order1 = placeCart.rows[0]?.o;
check(
  order1?.subtotal_poisha === 90000 && order1?.delivery_fee_poisha === 15000 && order1?.total_poisha === 105000,
  'cart order totals 900 taka plus the 150-taka delivery fee, priced by the database',
  placeCart.error?.message ?? JSON.stringify(order1),
);

const stockAfter1 = await db.query(`select stock from public.mk_products where id = $1`, [productId]);
check(stockAfter1.rows[0]?.stock === 3, 'placing an order decrements stock (5 to 3)');

const cartAfter = await run(`select public.mk_my_cart() as c`, cust1);
check((cartAfter.rows[0]?.c ?? []).length === 0, 'ordered items leave the cart');

// 6. Vendor sees customer contact details; customers do not see each other's orders
const vOrders = await run(`select public.mk_vendor_orders(null, 50) as o`, vendorUid);
const seen = vOrders.rows[0]?.o?.[0];
check(
  seen?.customer_phone === '01555123456' && seen?.landmark === 'Opposite the mosque' && seen?.distance_km > 0,
  'vendor sees the customer phone, landmark, location, and distance',
  vOrders.error?.message,
);
const orderId = seen?.id;

const c2Orders = await run(`select public.mk_my_orders(30) as o`, cust2);
check((c2Orders.rows[0]?.o ?? []).length === 0, 'customer two sees none of customer one\'s orders');
const c2Cancel = await run(`select public.mk_customer_cancel_order('${orderId}', 'mine') `, cust2);
check(code(c2Cancel) === 'P0002', 'customer two cannot cancel customer one\'s order', code(c2Cancel));

const directOrder = await run(
  `select public.mk_place_order('${vendorId}', ${appJson(addr)}, '[{"product_id":"${productId}","qty":1},{"product_id":"${productId}","qty":1}]') as o`,
  cust2,
);
check(
  directOrder.rows[0]?.o?.subtotal_poisha === 90000,
  'direct order merges duplicate lines and prices from the database (2 x 450 taka)',
  directOrder.error?.message ?? JSON.stringify(directOrder.rows[0]?.o),
);
const order2 = directOrder.rows[0]?.o?.order_id;
const stockAfter2 = await db.query(`select stock from public.mk_products where id = $1`, [productId]);
check(stockAfter2.rows[0]?.stock === 1, 'direct order takes stock to 1');

const overStock = await run(
  `select public.mk_place_order('${vendorId}', ${appJson(addr)}, '[{"product_id":"${productId}","qty":2}]') as o`,
  cust1,
);
check(code(overStock) === '22023', 'an order above remaining stock is refused', code(overStock));

// Cancel the second order by the vendor (decline): no credit consumed, stock restored
const decline = await run(
  `select public.mk_vendor_set_order_status('${order2}', 'cancelled', 'Out of stock on this line') as r`,
  vendorUid,
);
check(decline.rows[0]?.r?.credits_left === 10, 'declining an order consumes no credit', decline.error?.message);
const stockAfterDecline = await db.query(`select stock from public.mk_products where id = $1`, [productId]);
check(stockAfterDecline.rows[0]?.stock === 3, 'declining restores the reserved stock (1 to 3)');

const declineNoReason = await run(
  `select public.mk_vendor_set_order_status('${orderId}', 'cancelled', '')`,
  vendorUid,
);
check(code(declineNoReason) === '22023', 'a cancellation needs a reason', code(declineNoReason));

// 7. Accept consumes exactly one credit
const acceptEarly = await run(
  `select public.mk_vendor_set_order_status('${orderId}', 'packaged', '')`,
  vendorUid,
);
check(code(acceptEarly) === '22023', 'an order cannot skip straight from placed to packaged', code(acceptEarly));

const review1 = await run(`select public.mk_submit_review('${orderId}', 5, 'Great')`, cust1);
check(code(review1) === '22023', 'a review is refused before delivery', code(review1));

const accept = await run(
  `select public.mk_vendor_set_order_status('${orderId}', 'accepted', '') as r`,
  vendorUid,
);
check(accept.rows[0]?.r?.credits_left === 9, 'accepting consumes exactly one credit (10 to 9)', accept.error?.message);

const acceptAgain = await run(
  `select public.mk_vendor_set_order_status('${orderId}', 'accepted', '')`,
  vendorUid,
);
check(code(acceptAgain) === '22023', 'an accepted order cannot be accepted again (no double charge)', code(acceptAgain));

const creditRows = await db.query(
  `select count(*)::int as n from public.mk_credit_ledger where order_id = $1 and kind = 'order'`,
  [orderId],
);
check(creditRows.rows[0]?.n === 1, 'exactly one ledger charge exists for the order');

for (const next of ['packaged', 'out_for_delivery', 'delivered']) {
  const step = await run(
    `select public.mk_vendor_set_order_status('${orderId}', '${next}', '')`,
    vendorUid,
  );
  check(ok(step), `order moves to ${next}`, step.error?.message);
}

// 8. Reviews after delivery, once
const review = await run(`select public.mk_submit_review('${orderId}', 5, 'Fresh and on time') as r`, cust1);
check(review.rows[0]?.r?.rating === 5, 'customer reviews a delivered order', review.error?.message);
const reviewTwice = await run(`select public.mk_submit_review('${orderId}', 4, 'again')`, cust1);
check(code(reviewTwice) === '23505', 'an order can be reviewed only once', code(reviewTwice));
const reviewOther = await run(`select public.mk_submit_review('${orderId}', 1, 'hack')`, cust2);
check(code(reviewOther) === 'P0002', 'only the customer who bought can review', code(reviewOther));

// 9. Customer cancel rules
const cancelAccepted = await run(
  `select public.mk_customer_cancel_order('${order2}', 'changed my mind')`,
  cust2,
);
check(code(cancelAccepted) === '22023', 'a cancelled order cannot be cancelled again by the customer', code(cancelAccepted));

const newOrder = await run(
  `select public.mk_place_order('${vendorId}', ${appJson(addr)}, '[{"product_id":"${oilId}","qty":2}]') as o`,
  cust2,
);
const order3 = newOrder.rows[0]?.o?.order_id;
const selfCancel = await run(
  `select public.mk_customer_cancel_order('${order3}', 'changed my mind')`,
  cust2,
);
check(ok(selfCancel), 'customer cancels a placed order', selfCancel.error?.message);
const oilStock = await db.query(`select stock from public.mk_products where id = $1`, [oilId]);
check(oilStock.rows[0]?.stock === 10, 'customer cancel restores stock');

// 10. Delivery fee is admin-editable and applies to new orders
const setFee = await run(`select public.mk_admin_set_setting('delivery_fee_poisha', '20000')`, staff);
check(ok(setFee), 'staff change the delivery fee to 200 taka', setFee.error?.message);
const feeOrder = await run(
  `select public.mk_place_order('${vendorId}', ${appJson(addr)}, '[{"product_id":"${oilId}","qty":1}]') as o`,
  cust1,
);
check(feeOrder.rows[0]?.o?.delivery_fee_poisha === 20000, 'new orders use the new fee', feeOrder.error?.message);
await run(`select public.mk_admin_set_setting('delivery_fee_poisha', '15000')`, staff);

// 11. Credits run out: shop unlisted, cannot take orders
const pending = await run(
  `select public.mk_place_order('${vendorId}', ${appJson(addr)}, '[{"product_id":"${oilId}","qty":1}]') as o`,
  cust1,
);
const pendingOrder = pending.rows[0]?.o?.order_id;

await db.exec(`
  insert into public.mk_credit_ledger (vendor_id, kind, orders_delta, memo)
  values ('${vendorId}', 'adjustment', -9, 'test: spend remaining credits');
`);
const zero = await run(`select public.mk_vendor_dashboard() as d`, vendorUid);
check(zero.rows[0]?.d?.credits === 0 && zero.rows[0]?.d?.listed === false, 'at zero credits the shop is unlisted', JSON.stringify(zero.rows[0]?.d));

const hidden = await run(`select public.mk_list_vendors(null, '', null, null, 50) as v`, null);
check(hidden.rows[0]?.v?.length === 0, 'an unlisted shop disappears from the marketplace');
const hiddenPage = await run(`select public.mk_vendor_page('${slug}')`, null);
check(code(hiddenPage) === 'P0002', 'an unlisted shop page is unavailable', code(hiddenPage));
const blockedOrder = await run(
  `select public.mk_place_order('${vendorId}', ${appJson(addr)}, '[{"product_id":"${oilId}","qty":1}]')`,
  cust2,
);
check(code(blockedOrder) === 'P0002', 'customers cannot order from an unlisted shop', code(blockedOrder));
const blockedAccept = await run(
  `select public.mk_vendor_set_order_status('${pendingOrder}', 'accepted', '')`,
  vendorUid,
);
check(
  code(blockedAccept) === 'P0001',
  'a vendor with no credits cannot accept an order',
  code(blockedAccept),
);
const stillPlaced = await db.query(`select status::text from public.mk_orders where id = $1`, [pendingOrder]);
check(stillPlaced.rows[0]?.status === 'placed', 'the order stays placed when acceptance is refused');

// 12. Re-purchase: unlisted until staff approve
const rebuy = await run(
  `select public.mk_vendor_buy_credits('50', '01888000111', 'Rahim Uddin', 'TXN-B-0050') as r`,
  vendorUid,
);
check(rebuy.rows[0]?.r?.status === 'pending', 'vendor buys a 50-order package (pending)', rebuy.error?.message);
const rebuyTxnDup = await run(
  `select public.mk_vendor_buy_credits('10', '01888000111', 'Rahim Uddin', 'txn-b-0050')`,
  vendorUid,
);
check(code(rebuyTxnDup) === '23505', 'a repeated transaction ID on a re-purchase is refused', code(rebuyTxnDup));
const stillOff = await run(`select public.mk_list_vendors(null, '', null, null, 50) as v`, null);
check(stillOff.rows[0]?.v?.length === 0, 'a pending purchase does not relist the shop');

const pendingList = await run(`select public.mk_admin_list_credit_purchases('pending', 50) as p`, staff);
const purchaseId = pendingList.rows[0]?.p?.find((p) => p.txn_id === 'TXN-B-0050')?.id;
check(Boolean(purchaseId), 'staff see the pending purchase with payment details', pendingList.error?.message);

const approvePurchase = await run(
  `select public.mk_admin_decide_credit_purchase('${purchaseId}', 'approve', '') as r`,
  staff,
);
check(approvePurchase.rows[0]?.r?.status === 'approved', 'staff approve the purchase', approvePurchase.error?.message);
const relisted = await run(`select public.mk_vendor_dashboard() as d`, vendorUid);
check(
  relisted.rows[0]?.d?.credits === 50 && relisted.rows[0]?.d?.listed === true,
  'approval relists the shop with 50 credits',
  JSON.stringify(relisted.rows[0]?.d),
);

const acceptAfter = await run(
  `select public.mk_vendor_set_order_status('${pendingOrder}', 'accepted', '') as r`,
  vendorUid,
);
check(acceptAfter.rows[0]?.r?.credits_left === 49, 'the pending order is accepted once credits return (50 to 49)', acceptAfter.error?.message);

// 13. A second vendor's application cannot be decided with the first one's purchase
const app2 = await run(
  `select public.mk_submit_vendor_application(${appJson(application({
    full_name: 'Second Vendor', shop_name: 'Book Corner', nid_number: '9876543210987',
    mobile: '01999000111', vendor_type: 'books', package_code: '100',
    payment_sender: '01999000111', payment_holder: 'Second Vendor', payment_txn_id: 'TXN-C-0100',
    lat: 24.90, lng: 91.87,
  }))}) as r`,
  applicant2,
);
const app2Id = app2.rows[0]?.r?.application_id;
const rejectApp2 = await run(
  `select public.mk_admin_decide_application('${app2Id}', 'reject', 'Trade licence unclear')`,
  staff,
);
check(rejectApp2.error === null, 'staff reject an application with a reason', rejectApp2.error?.message);
const pendingAfterReject = await db.query(
  `select status::text from public.mk_credit_purchases where txn_id = 'TXN-C-0100'`,
);
check(pendingAfterReject.rows[0]?.status === 'rejected', 'a rejected application rejects its payment record');

// 14. Customers cannot read orders table directly beyond their own rows
const directRead = await run(`select count(*)::int as n from public.mk_orders`, cust2);
check(
  directRead.error === null && directRead.rows[0]?.n === 2,
  'direct table read returns only the signed-in customer\'s own orders (RLS)',
  directRead.error?.message ?? String(directRead.rows[0]?.n),
);
const applicantsDirect = await run(`select count(*) from public.mk_vendor_applications`, cust1);
check(applicantsDirect.error !== null, 'applications (NID numbers) are not readable directly by members', '');

console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) {
  process.exit(1);
}
