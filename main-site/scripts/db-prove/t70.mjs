// 0105: the owner can approve a vendor, and the owner holds every permission.
// Regression for "The database denied this request (42501)" on vendor approval.
import { makeDb, as, expectFail, summary } from './lib.mjs';

const db = await makeDb();

await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('rrc-owner', 'rrc_owner', 'Main Admin', 'member', 'active'),
    ('plain-member', 'plain_member', 'Plain Member', 'member', 'active'),
    ('gmember-1', 'gmember_one', 'Gmember One', 'member', 'active');
`);

// The vendor applicant, with a submitted application waiting for review.
await db.query(`insert into public.mk_vendor_applications (
  owner_uid, full_name, shop_name, nid_number, mobile, vendor_type, address_line, lat, lng,
  place_label, package_code, agreements, payment_sender, payment_holder, payment_txn_id
) values (
  'gmember-1', 'Gmember One', 'Dhaka Dev Gear', '1234567890', '01712345678', 'electronics',
  'House 1, Road 2, Dhanmondi', 23.7465, 90.3760, 'Dhanmondi, Dhaka', '10',
  '{"terms":true,"privacy":true,"vendor_policy":true,"cod_policy":true,"self_delivery":true,"accuracy":true}'::jsonb,
  '01712345678', 'Gmember One', 'TXN-70-SHOP'
)`);
const app = await db.query(`select id from public.mk_vendor_applications limit 1`);
const appId = app.rows[0].id;

// The main administrator signs in with a verified Google email. The profile
// row still says 'member'; the bootstrap rank must be what the database honours.
const ownerClaims = { email: 'rrc@bsdc.info.bd', email_verified: true };
const approved = await as(
  db,
  'rrc-owner',
  `select public.decide_shop('${appId}'::uuid, true, '') as ok`,
  'the main administrator can approve a vendor application (no 42501)',
  ownerClaims,
);
const status = await db.query(
  `select status from public.mk_vendor_applications where id = '${appId}'::uuid`,
);
if (approved !== null) {
  console.log(`      application status now: ${status.rows[0]?.status}`);
}

// A plain member must still be refused by the permission check itself.
await expectFail(
  db,
  'plain-member',
  `select public.decide_shop('${appId}'::uuid, true, '')`,
  '42501',
  'a plain member is refused a vendor decision with 42501',
);

// Anonymous callers never reach the function.
await db.exec(`set role anon;`);
let anonCode = null;
try {
  await db.query(`select public.decide_shop('${appId}'::uuid, true, '')`);
} catch (e) {
  anonCode = e.code;
}
await db.exec(`reset role;`);
if (anonCode === '42501') {
  console.log('ok    anonymous callers are refused decide_shop');
} else {
  console.log(`FAIL  anonymous callers are refused decide_shop -> code ${anonCode}`);
}

// The owner holds permissions that were never seeded into role_permissions.
await db.exec(
  `set role authenticated; select set_config('request.jwt.claims', '{"sub":"rrc-owner","role":"authenticated","email":"rrc@bsdc.info.bd","email_verified":true}', false);`,
);
const ownerHas = await db.query(`select bsdc.has_permission('a.permission.nobody.seeded') as ok`);
await db.exec(`reset role;`);
console.log(
  ownerHas.rows[0]?.ok === true
    ? 'ok    the owner passes a permission that was never seeded'
    : `FAIL  the owner passes a permission that was never seeded -> ${ownerHas.rows[0]?.ok} `,
);

summary();
