/**
 * 0101: self-service advertising. An advertiser builds a campaign, pays BSDC by
 * bKash, and staff approve the payment (crediting the wallet) before the
 * campaign goes to creative review.
 *
 * Proves:
 *  - a campaign is built in one transaction and checked by the staff rules
 *  - the budget, bid, schedule, pricing and copy are bounded
 *  - a payment needs a Bangladeshi mobile, an account name and a transaction ID,
 *    and each transaction ID funds one request, ever
 *  - only the owner sees their campaign and payments; others get "no such campaign"
 *  - the advertiser cannot approve their own payment or write the ledger
 *  - an approved payment credits exactly the requested amount, and only then can
 *    the campaign be sent for review
 *  - a rejected payment needs a reason and leaves the campaign in draft
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
const staff = 'ad-pay-staff';
const owner = 'ad-pay-owner';
const other = 'ad-pay-other';

await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${staff}', 'ad_pay_staff', 'Ads Staff', 'admin', 'active'),
    ('${owner}', 'ad_pay_owner', 'Ads Owner', 'member', 'active'),
    ('${other}', 'ad_pay_other', 'Other Member', 'member', 'active');
  insert into public.mk_settings (key, value) values ('bikash_number', '01712345678')
    on conflict (key) do update set value = excluded.value;
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

const validCampaign = () =>
  JSON.stringify({
    name: 'Eid sale 2026',
    pricing: 'cpc',
    bid: 200,
    total_budget: 50000,
    daily_budget: 5000,
    placement: 'feed',
    headline: 'Eid sale is live',
    body: 'Up to 40% off on every order',
    target_url: 'https://example.com/eid',
    image_url: '',
    cta_label: 'Shop now',
    platforms: ['web', 'android'],
    language: 'bn',
    cities: ['Dhaka'],
  });
const lit = (s) => `$j$${s}$j$`;

// Guests and unknown members
const guest = await run(`select public.ad_create_campaign(${lit(validCampaign())}::jsonb)`, null);
check(code(guest) === '42501', 'a guest cannot build a campaign', code(guest) || 'it succeeded');

// Build a campaign
const built = await run(`select public.ad_create_campaign(${lit(validCampaign())}::jsonb) as r`, owner);
check(ok(built), 'the owner builds a campaign from the form', built.error?.message);
const campaignId = built.rows[0]?.r?.campaign_id;
check(Boolean(campaignId), 'the build returns a campaign id');
const row = await run(
  `select status, total_budget, daily_budget, target_language from public.ad_campaigns where id = '${campaignId}'`,
  owner,
);
check(row.rows[0]?.status === 'draft', 'a new campaign starts in draft, never live');
check(row.rows[0]?.target_language === 'bn', 'the chosen language is stored');

const bad1 = [
  ['a name shorter than 3 characters', { name: 'ab' }],
  ['a budget under ৳100', { total_budget: 5000 }],
  ['a bid under the floor', { bid: 10 }],
  ['a daily cap above the budget', { daily_budget: 90000 }],
  ['a plain http destination', { target_url: 'http://example.com/eid' }],
  ['an image not hosted on ImgBB', { image_url: 'https://example.com/a.png' }],
  ['no delivery platform', { platforms: [] }],
  ['an unknown placement', { placement: 'popup' }],
  ['an end date before the start', { ends_at: '2020-01-01T00:00:00Z' }],
];
for (const [label, over] of bad1) {
  const r = await run(
    `select public.ad_create_campaign(${lit(JSON.stringify({ ...JSON.parse(validCampaign()), ...over }))}::jsonb)`,
    owner,
  );
  check(code(r) === '22023', `a campaign with ${label} is refused`, code(r) || 'it succeeded');
}

// The payment form
const instr = await run(`select public.ad_payment_instructions() as r`, owner);
check(ok(instr) && instr.rows[0]?.r?.bikash_number === '01712345678', 'the advertiser sees the BSDC bKash number');
const guestInstr = await run(`select public.ad_payment_instructions()`, null);
check(code(guestInstr) === '42501', 'a guest cannot read the bKash number through the ads flow');

const notMine = await run(
  `select public.ad_submit_payment('${campaignId}', '01711111111', 'Other Person', 'TXNOTHER01')`,
  other,
);
check(code(notMine) === 'P0002', 'another member cannot pay for this campaign', code(notMine) || 'it succeeded');

const badSender = await run(
  `select public.ad_submit_payment('${campaignId}', '0201234567', 'Ads Owner', 'TXN000001')`,
  owner,
);
check(code(badSender) === '22023', 'a non-Bangladeshi sender number is refused');

const shortTxn = await run(
  `select public.ad_submit_payment('${campaignId}', '01711111111', 'Ads Owner', 'ab')`,
  owner,
);
check(code(shortTxn) === '22023', 'a transaction ID shorter than 4 characters is refused');

const paid = await run(
  `select public.ad_submit_payment('${campaignId}', '+8801711111111', 'Ads Owner', 'TXN0000001') as r`,
  owner,
);
check(ok(paid) && paid.rows[0]?.r?.status === 'pending', 'a complete payment report is recorded as pending', paid.error?.message);

const twice = await run(
  `select public.ad_submit_payment('${campaignId}', '01711111111', 'Ads Owner', 'TXN0000002')`,
  owner,
);
check(code(twice) === '22023', 'a second payment for the same campaign waits for the first');

const reused = await run(
  `select public.ad_create_campaign(${lit(validCampaign({ name: 'Second campaign' }))}::jsonb) as r`,
  owner,
);
const campaignTwo = reused.rows[0]?.r?.campaign_id;
const sameTxn = await run(
  `select public.ad_submit_payment('${campaignTwo}', '01711111111', 'Ads Owner', 'txn0000001')`,
  owner,
);
check(code(sameTxn) === '22023', 'a transaction ID cannot fund a second campaign, even in another case');

// Privacy of the request table
const direct = await run(`select count(*) from public.ad_payment_requests`, owner);
check(code(direct) === '42501', 'the owner cannot read the payment table directly', code(direct) || 'it read rows');
const mine = await run(`select public.ad_my_payment_requests(10) as r`, owner);
check(ok(mine) && mine.rows[0]?.r?.length === 1, 'the owner sees only their own payment requests');
const theirs = await run(`select public.ad_my_payment_requests(10) as r`, other);
check(ok(theirs) && theirs.rows[0]?.r?.length === 0, 'another member sees none of those requests');

// The advertiser cannot decide or credit
const selfApprove = await run(
  `select public.ad_admin_list_payment_requests('pending', 10)`,
  owner,
);
check(code(selfApprove) === '42501', 'the advertiser cannot list payments for review', code(selfApprove) || 'it listed');
const requestId = mine.rows[0]?.r?.[0]?.id;
const forge = await run(
  `select public.ad_admin_decide_payment_request('${requestId}', 'approve', '')`,
  owner,
);
check(code(forge) === '42501', 'the advertiser cannot approve their own payment', code(forge) || 'it approved');
const forgeWallet = await run(
  `insert into public.ad_wallet_entries (owner_uid, kind, amount, memo) values ('${owner}', 'topup', 50000, 'forged')`,
  owner,
);
check(code(forgeWallet) === '42501', 'the advertiser cannot write their wallet directly', code(forgeWallet) || 'it wrote');

// Too early to send for review
const early = await run(`select public.ad_owner_submit_campaign('${campaignId}')`, owner);
check(code(early) === '22023', 'a campaign cannot be sent for review before its payment is approved', code(early) || 'it sent');

// Staff review and approval
const queue = await run(`select public.ad_admin_list_payment_requests('pending', 50) as r`, staff);
check(ok(queue) && queue.rows[0]?.r?.length === 1, 'staff see the pending payment in the queue', queue.error?.message);
const senderStored = queue.rows[0]?.r?.[0]?.sender_number;
check(senderStored === '01711111111', 'a +880 sender number is stored as a 01 number', senderStored);

const shortNote = await run(
  `select public.ad_admin_decide_payment_request('${requestId}', 'reject', 'no')`,
  staff,
);
check(code(shortNote) === '22023', 'a rejection needs a reason of at least five characters');

const approved = await run(
  `select public.ad_admin_decide_payment_request('${requestId}', 'approve', '') as r`,
  staff,
);
check(ok(approved) && approved.rows[0]?.r?.status === 'approved', 'staff approve the payment', approved.error?.message);

const balance = await run(`select public.ad_wallet_balance() as b`, owner);
check(ok(balance) && Number(balance.rows[0]?.b) === 50000, 'approval credits exactly the requested budget to the wallet', String(balance.rows[0]?.b));

const twiceApproved = await run(
  `select public.ad_admin_decide_payment_request('${requestId}', 'approve', '')`,
  staff,
);
check(code(twiceApproved) === '22023', 'an approved payment cannot be credited twice');

const sent = await run(`select public.ad_owner_submit_campaign('${campaignId}') as r`, owner);
check(ok(sent) && sent.rows[0]?.r?.status === 'pending_review', 'once funded, the owner sends the campaign for review', sent.error?.message);

const staffApprove = await run(
  `select public.decide_campaign('${campaignId}', true, '') as s`,
  staff,
);
check(ok(staffApprove) && staffApprove.rows[0]?.s === 'active', 'staff approve the creative and the campaign goes live', staffApprove.error?.message);

// Rejection path on the second campaign
const payTwo = await run(
  `select public.ad_submit_payment('${campaignTwo}', '01722222222', 'Ads Owner', 'TXNTWO00001') as r`,
  owner,
);
check(ok(payTwo), 'the second campaign can be paid for with its own transaction', payTwo.error?.message);
const reqTwo = payTwo.rows[0]?.r?.request_id;
const refuse = await run(
  `select public.ad_admin_decide_payment_request('${reqTwo}', 'reject', 'Transaction not found on the statement') as r`,
  staff,
);
check(ok(refuse) && refuse.rows[0]?.r?.status === 'rejected', 'staff can reject a payment with a reason', refuse.error?.message);
const stillDraft = await run(`select status from public.ad_campaigns where id = '${campaignTwo}'`, owner);
check(stillDraft.rows[0]?.status === 'draft', 'a rejected payment leaves the campaign in draft');
const retry = await run(
  `select public.ad_submit_payment('${campaignTwo}', '01722222222', 'Ads Owner', 'TXNTWO00002') as r`,
  owner,
);
check(ok(retry) && retry.rows[0]?.r?.status === 'pending', 'the owner can report a corrected payment');

const unpaidSend = await run(`select public.ad_owner_submit_campaign('${campaignTwo}')`, owner);
check(code(unpaidSend) === '22023', 'the second campaign cannot be sent before its new payment is approved');

// The first campaign is live and still reserves its budget, so a second payment
// on the same wallet must be checked against what is left, not what is there.
const retryReq = retry.rows[0]?.r?.request_id;
const approveRetry = await run(
  `select public.ad_admin_decide_payment_request('${retryReq}', 'approve', '') as r`,
  staff,
);
check(ok(approveRetry) && approveRetry.rows[0]?.r?.status === 'approved', 'staff approve the corrected payment', approveRetry.error?.message);
const balanceTwo = await run(`select public.ad_wallet_balance() as b`, owner);
check(Number(balanceTwo.rows[0]?.b) === 100000, 'the wallet now holds both budgets', String(balanceTwo.rows[0]?.b));
const sentTwo = await run(`select public.ad_owner_submit_campaign('${campaignTwo}') as r`, owner);
check(ok(sentTwo) && sentTwo.rows[0]?.r?.status === 'pending_review', 'the funded second campaign goes to review', sentTwo.error?.message);

console.log(`\n${pass} checks passed, ${bad.length} failed`);
if (bad.length) {
  console.log(`Failed: ${bad.join('; ')}`);
  process.exit(1);
}
process.exit(0);
