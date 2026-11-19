/**
 * 0125: the admin queue's marketplace read model returns the exact vendor
 * purchase identity needed for review, and the existing decision RPCs enforce
 * their permission checks and update each credit ledger once.
 */
import { as, check, expectFail, failureCount, makeDb, summary } from './lib.mjs';

const db = await makeDb();
const admin = 'credit-queue-admin';
const advertiser = 'credit-queue-advertiser';
const vendor = 'credit-queue-vendor';
const manager = 'credit-queue-manager';
const applicationId = 'aaaaaaaa-0125-4125-8125-000000000001';
const vendorId = 'bbbbbbbb-0125-4125-8125-000000000001';
const vendorPurchaseId = 'cccccccc-0125-4125-8125-000000000001';
const adApproveId = 'dddddddd-0125-4125-8125-000000000001';
const adRejectId = 'dddddddd-0125-4125-8125-000000000002';

async function anonymousError(sql) {
  await db.exec(`
    set role anon;
    select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', false);
  `);
  try {
    await db.query(sql);
    return null;
  } catch (error) {
    return error.code;
  } finally {
    await db.exec('reset role;');
  }
}

await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${admin}', 'credit_admin', 'Credit Queue Admin', 'admin', 'active'),
    ('${advertiser}', 'credit_advertiser', 'Ad Credit Buyer', 'member', 'active'),
    ('${vendor}', 'credit_vendor', 'Marketplace Vendor', 'member', 'active'),
    ('${manager}', 'credit_manager', 'Credit Queue Manager', 'manager', 'active');

  insert into public.mk_vendor_applications (
    id, owner_uid, full_name, shop_name, nid_number, mobile, vendor_type,
    address_line, lat, lng, place_label, package_code, agreements,
    payment_sender, payment_holder, payment_txn_id, status
  ) values (
    '${applicationId}', '${vendor}', 'Marketplace Vendor', 'Sylhet Tools',
    '1234567890123', '01712345678', 'electronics', 'Zindabazar, Sylhet',
    24.8949, 91.8687, 'Zindabazar, Sylhet', '10', '{}'::jsonb,
    '01812345678', 'Marketplace Vendor', 'APP-TXN-0125', 'approved'
  );

  insert into public.mk_vendors (
    id, owner_uid, application_id, slug, name, vendor_type, mobile,
    address_line, lat, lng, place_label
  ) values (
    '${vendorId}', '${vendor}', '${applicationId}', 'sylhet-tools', 'Sylhet Tools',
    'electronics', '01712345678', 'Zindabazar, Sylhet', 24.8949, 91.8687,
    'Zindabazar, Sylhet'
  );

  insert into public.mk_credit_purchases (
    id, owner_uid, vendor_id, package_code, orders, price_poisha,
    sender_number, account_holder, txn_id
  ) values (
    '${vendorPurchaseId}', '${vendor}', '${vendorId}', '10', 10, 10000,
    '01812345678', 'Marketplace Vendor', 'MK-TOPUP-0125'
  );

  insert into public.ad_credit_purchases (
    id, uid, credits, price_poisha, sender_number, txn_id
  ) values
    ('${adApproveId}', '${advertiser}', 500, 50000, '01812345678', 'AD-APPROVE-0125'),
    ('${adRejectId}', '${advertiser}', 600, 60000, '01812345678', 'AD-REJECT-0125');
`);

const marketQueue = await as(
  db,
  admin,
  `select public.mk_admin_list_credit_purchases('pending', 200) as queue`,
  'admin reads marketplace order-credit purchases',
  { bsdc_role: 'admin' },
);
const marketRows = marketQueue?.rows[0]?.queue ?? [];
check(
  marketRows.length === 1,
  'the pending marketplace top-up appears in the review queue',
  JSON.stringify(marketRows),
);
check(
  marketRows[0]?.id === vendorPurchaseId &&
    marketRows[0]?.owner_name === 'Marketplace Vendor' &&
    marketRows[0]?.vendor_name === 'Sylhet Tools' &&
    marketRows[0]?.vendor_slug === 'sylhet-tools',
  'top-up row includes the vendor and purchaser identity needed for review',
  JSON.stringify(marketRows[0]),
);

await expectFail(
  db,
  manager,
  `select public.mk_admin_list_credit_purchases('pending', 100)`,
  '42501',
  'a manager without marketplace.review cannot read the marketplace credit approval queue',
);
const guestMarketQueue = await anonymousError(
  `select public.mk_admin_list_credit_purchases('pending', 100)`,
);
check(
  guestMarketQueue === '42501',
  'anonymous caller cannot read marketplace credit approvals',
  String(guestMarketQueue),
);

const marketDecision = await as(
  db,
  admin,
  `select public.mk_admin_decide_credit_purchase('${vendorPurchaseId}', 'approve', '') as decision`,
  'admin approves a marketplace order-credit top-up',
  { bsdc_role: 'admin' },
);
check(
  marketDecision?.rows[0]?.decision?.status === 'approved',
  'marketplace approval returns the approved status',
  JSON.stringify(marketDecision?.rows[0]?.decision),
);
const vendorLedger = await db.query(
  `select orders_delta from public.mk_credit_ledger where purchase_id = '${vendorPurchaseId}'`,
);
check(
  vendorLedger.rows.length === 1 && vendorLedger.rows[0]?.orders_delta === 10,
  'approval credits the vendor exactly once',
);

const adQueue = await as(
  db,
  admin,
  `select public.ad_credit_queue('pending', 100) as queue`,
  'admin reads advertising-wallet credit requests',
  { bsdc_role: 'admin' },
);
const adRows = adQueue?.rows[0]?.queue ?? [];
check(
  adRows.length === 2,
  'both pending advertising credit requests are listed',
  JSON.stringify(adRows),
);
check(
  adRows.some((row) => row.id === adApproveId && row.display_name === 'Ad Credit Buyer'),
  'advertising queue includes the purchaser display name',
);

await expectFail(
  db,
  manager,
  `select public.ad_credit_queue('pending', 100)`,
  '42501',
  'a manager without advertising.review cannot read advertising credit approvals',
);
const guestAdQueue = await anonymousError(`select public.ad_credit_queue('pending', 100)`);
check(
  guestAdQueue === '42501',
  'anonymous caller cannot read advertising credit approvals',
  String(guestAdQueue),
);

const adApproval = await as(
  db,
  admin,
  `select public.decide_ad_credit_request('${adApproveId}', 'approve', '') as decision`,
  'admin approves advertising credits',
  { bsdc_role: 'admin' },
);
check(
  adApproval?.rows[0]?.decision?.status === 'approved',
  'advertising credit approval returns the approved status',
);
const adLedger = await db.query(
  `select count(*)::int as n, sum(amount)::int as amount
     from public.ad_wallet_entries where credit_purchase_id = '${adApproveId}'`,
);
check(
  adLedger.rows[0]?.n === 1 && adLedger.rows[0]?.amount === 50000,
  'advertising approval credits the wallet once for the recorded amount',
  JSON.stringify(adLedger.rows[0]),
);

const adRejection = await as(
  db,
  admin,
  `select public.decide_ad_credit_request('${adRejectId}', 'reject', 'Transaction not found') as decision`,
  'admin rejects advertising credits with an applicant-readable reason',
  { bsdc_role: 'admin' },
);
check(adRejection?.rows[0]?.decision?.status === 'rejected', 'the rejection is recorded');

if (failureCount() > 0) process.exitCode = 1;
summary();
