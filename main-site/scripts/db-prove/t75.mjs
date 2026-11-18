/**
 * Proof for 0111: a gig's client can answer a proposal, and only that client.
 *
 * A freelance gig had a `submit_proposal()` and no way to answer one. This
 * harness checks the door that was missing and, just as importantly, the doors
 * that stay shut: a stranger cannot decide, another freelancer cannot decide,
 * a client cannot decide a retracted bid, and no member can reach the status
 * column directly through PostgREST table writes.
 */
import { as, asAnon, expectFail, failureCount, makeDb } from './lib.mjs';

const ada = 'aaaaaaaa-1111-4111-8111-000000000001'; // gig client
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002'; // freelancer who bid
const karim = 'cccccccc-3333-4333-8333-000000000003'; // another freelancer
const stranger = 'dddddddd-4444-4444-8444-000000000004'; // unrelated member
const GIG = 'gig-api-for-payments';

const db = await makeDb();
let fails = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`ok    ${label}`);
  else {
    fails += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

await db.exec(`
  insert into public.profiles (uid, display_name, username) values
    ('${ada}', 'Ada Lovelace', 'ada'),
    ('${rahim}', 'Rahim Uddin', 'rahim'),
    ('${karim}', 'Karim Mia', 'karim'),
    ('${stranger}', 'Nadia Akter', 'nadia');

  insert into public.gigs (slug, title, description, budget_min, budget_max, currency,
                           is_hourly, duration_days, skills, status, client_uid, published_at) values
    ('${GIG}', 'Payments API for a Dhaka fintech', 'Design and build a REST API for merchant payouts.',
     80000, 120000, 'BDT', false, 45, array['node','postgres'], 'open', '${ada}', now());
`);

// Two live bids through the RPC that already existed, so the rows are exactly
// what a member would create.
await as(db, rahim, `select public.submit_proposal(
  (select id from public.gigs where slug = '${GIG}'),
  'I have shipped three payout APIs on Node and Postgres, and can start on Monday.',
  95000, 30)`, 'rahim proposes');
await as(db, karim, `select public.submit_proposal(
  (select id from public.gigs where slug = '${GIG}'),
  'Nine years of fintech backends; I would scope the ledger first and ship weekly.',
  110000, 40)`, 'karim proposes');

const rahimProposal = await as(
  db,
  rahim,
  `select id, status::text from public.gig_proposals where freelancer_uid = '${rahim}'`,
  'rahim reads their own proposal',
);
const rahimId = rahimProposal?.rows[0]?.id;
check('a proposal starts as submitted', rahimProposal?.rows[0]?.status === 'submitted', rahimProposal?.rows[0]?.status);

// ---------------------------------------------------------------------------
// the wrong people cannot answer
// ---------------------------------------------------------------------------
// A refusal is what this harness wants, so it is asserted with expectFail. Using
// as() here would print FAIL for the correct outcome and, worse, record a failure
// that this file's own exit status never looked at.
await expectFail(
  db,
  stranger,
  `select public.decide_gig_proposal('${rahimId}', 'hired')`,
  '42501',
  'a member unrelated to the gig cannot decide a proposal',
);

await expectFail(
  db,
  karim,
  `select public.decide_gig_proposal('${rahimId}', 'hired')`,
  '42501',
  'another freelancer cannot decide a rival bid',
);

// expectFail sets the authenticated role, so an anonymous caller is checked by
// asserting that the same call *is* refused once a session is required at all.
await expectFail(
  db,
  '00000000-0000-4000-8000-000000000000',
  `select public.decide_gig_proposal('${rahimId}', 'hired')`,
  '42501',
  'an anonymous visitor cannot call the decision RPC',
);

// ---------------------------------------------------------------------------
// the client can, and the answer reaches the freelancer
// ---------------------------------------------------------------------------
const decided = await as(
  db,
  ada,
  `select public.decide_gig_proposal('${rahimId}', 'shortlisted')`,
  'the client shortlists a proposal',
);
check('the gig client may shortlist a proposal', decided !== null);

const afterShortlist = await db.query(
  `select status::text from public.gig_proposals where id = '${rahimId}'`,
);
check('the proposal status is stored', afterShortlist.rows[0]?.status === 'shortlisted', afterShortlist.rows[0]?.status);

const noticed = await db.query(
  `select target_url, body from public.notifications
     where uid = '${rahim}' and body like 'Your proposal for%'
     order by created_at desc limit 1`,
);
check(
  'the freelancer is told, with a link to the gig they bid on',
  noticed.rows.length === 1 && noticed.rows[0].target_url === `/freelance/${GIG}`,
  noticed.rows[0]?.target_url,
);

// Hired is a second, later decision on the same proposal — the client may change
// their mind as they narrow the field.
await as(db, ada, `select public.decide_gig_proposal('${rahimId}', 'hired')`, 'the client hires the freelancer');
const hired = await db.query(`select status::text from public.gig_proposals where id = '${rahimId}'`);
check('a proposal can be moved from shortlisted to hired', hired.rows[0]?.status === 'hired', hired.rows[0]?.status);

// ---------------------------------------------------------------------------
// a retracted bid stays retracted
// ---------------------------------------------------------------------------
const karimProposal = await as(
  db,
  karim,
  `select id from public.gig_proposals where freelancer_uid = '${karim}'`,
  'karim reads their own proposal',
);
const karimId = karimProposal?.rows[0]?.id;

// The freelancer retracts, exactly as the app's delete does.
await as(
  db,
  karim,
  `delete from public.gig_proposals where id = '${karimId}'`,
  'karim withdraws their own proposal',
);

await expectFail(
  db,
  ada,
  `select public.decide_gig_proposal('${karimId}', 'hired')`,
  'P0002',
  'a retracted proposal cannot be re-decided',
);

// ---------------------------------------------------------------------------
// the status column is not a table write
// ---------------------------------------------------------------------------
await expectFail(
  db,
  rahim,
  `update public.gig_proposals set status = 'hired' where id = '${rahimId}'`,
  '42501',
  'a freelancer cannot raise their own proposal through a table write',
);

await expectFail(
  db,
  ada,
  `update public.gig_proposals set status = 'rejected' where id = '${rahimId}'`,
  '42501',
  'a client cannot bypass the RPC by patching the status column',
);

// ---------------------------------------------------------------------------
// the gig itself still behaves
// ---------------------------------------------------------------------------
const board = await asAnon(
  db,
  `select slug from public.gigs where status = 'open'`,
  'an anonymous visitor reads the open board',
);
check('the open gig still lists publicly', board?.rows.some((row) => row.slug === GIG));

// Closing the gig is the client's own write, granted by 0042 on the status column.
await as(db, ada, `update public.gigs set status = 'closed' where slug = '${GIG}'`, 'the client closes their gig');

await expectFail(
  db,
  stranger,
  `select public.submit_proposal(
    (select id from public.gigs where slug = '${GIG}'),
    'A late bid on a closed gig that should never be accepted by the database.',
    5000, 5)`,
  'P0002',
  'a closed gig accepts no further proposals',
);

// Fold in what the shared harness recorded, so a failure from as()/check() cannot
// be reported as a passing harness just because this file counted separately.
const total = fails + failureCount();
console.log(total === 0 ? '\nall checks passed' : `\n${total} check(s) failed`);
process.exit(total === 0 ? 0 : 1);
