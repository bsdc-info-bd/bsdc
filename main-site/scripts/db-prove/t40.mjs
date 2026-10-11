/**
 * Proof for 0067: a gig has a page, and an address that is not a page answers
 * as missing.
 *
 * The gig page reads its row straight from the gigs table, so the database's
 * own visibility rule is what decides what a visitor sees. The sitemap and the
 * crawler metadata are checked against that same rule, and so is the answer
 * for a record-shaped address that matches nothing.
 */
import { as, asAnon, makeDb } from './lib.mjs';

const ada = 'aaaaaaaa-1111-4111-8111-000000000001'; // client
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002'; // freelancer
const GIG_OPEN = 'gig-api-for-payments';
const GIG_CLOSED = 'gig-old-landing-page';
const GIG_DRAFT = 'gig-unpublished-draft';
const GIG_TITLE_CLOSED = 'Rebuild the Old Landing Page';

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
    ('${rahim}', 'Rahim Uddin', 'rahim');

  insert into public.gigs (slug, title, description, budget_min, budget_max, currency,
                           is_hourly, duration_days, skills, status, client_uid, published_at) values
    ('${GIG_OPEN}', 'Payments API for a Dhaka fintech', 'Design and build a REST API for merchant payouts.',
     80000, 120000, 'BDT', false, 45, array['node','postgres'], 'open', '${ada}', now()),
    ('${GIG_CLOSED}', '${GIG_TITLE_CLOSED}', 'A landing page the client has since cancelled.',
     null, null, 'BDT', true, null, array[]::text[], 'closed', '${ada}', now() - interval '9 days'),
    ('${GIG_DRAFT}', 'Secret Unpublished Brief', 'Not ready yet.',
     null, null, 'BDT', false, null, array[]::text[], 'draft', '${ada}', null);

  insert into public.tags (slug, label_en, description, posts_count) values
    ('proof-talk', 'Proof Talk', 'Talks used by the proof.', 3),
    ('proof-empty', 'Proof Empty', '', 0);
`);

// ---------------------------------------------------------------------------
// what a visitor reads on the gig page (the page reads the row directly)
// ---------------------------------------------------------------------------
const anonOpen = await asAnon(
  db,
  `select title, description, status from public.gigs where slug = '${GIG_OPEN}'`,
  'anonymous reads an open gig',
);
check(
  'an anonymous visitor reads an open gig, with its description',
  anonOpen?.rows.length === 1 && anonOpen.rows[0].description.startsWith('Design and build'),
);

const anonClosed = await asAnon(
  db,
  `select slug from public.gigs where slug = '${GIG_CLOSED}'`,
  'anonymous reads a closed gig',
);
check('a closed gig is invisible to an anonymous visitor', anonClosed?.rows.length === 0);

const anonDraft = await asAnon(
  db,
  `select slug from public.gigs where slug = '${GIG_DRAFT}'`,
  'anonymous reads a draft gig',
);
check('a draft gig is invisible to an anonymous visitor', anonDraft?.rows.length === 0);

const adaClosed = await as(
  db,
  ada,
  `select status::text from public.gigs where slug = '${GIG_CLOSED}'`,
  'the client reads their own closed gig',
);
check('the client can still open their own closed gig', adaClosed?.rows[0]?.status === 'closed');

// ---------------------------------------------------------------------------
// the freelancer's own proposal status
// ---------------------------------------------------------------------------
await as(
  db,
  rahim,
  `select public.submit_proposal(
     (select id from public.gigs where slug = '${GIG_OPEN}'),
     'I have built payout services on Postgres for two years.', 95000, 30)`,
  'freelancer sends a proposal',
);
const mine = await as(
  db,
  rahim,
  `select status::text from public.gig_proposals
    where gig_id = (select id from public.gigs where slug = '${GIG_OPEN}')`,
  'freelancer reads their own proposal',
);
check('the freelancer sees their own proposal status', mine?.rows[0]?.status === 'submitted');

// The table grants nothing to anonymous visitors, so the read must be refused
// by the grant itself (42501), before any row policy is consulted.
let anonRefused = false;
try {
  await db.exec(
    `set role anon; select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', false);`,
  );
  await db.query(`select id from public.gig_proposals`);
} catch (error) {
  anonRefused = error.code === '42501';
} finally {
  await db.exec('reset role;');
}
check('an anonymous visitor is refused every read of proposals', anonRefused);

const strangerProposals = await as(
  db,
  ada,
  `select id from public.gig_proposals where gig_id = (select id from public.gigs where slug = '${GIG_OPEN}')`,
  'the client reads proposals on their gig',
);
check('the client of the gig reads its proposals', strangerProposals?.rows.length === 1);

// ---------------------------------------------------------------------------
// sitemap
// ---------------------------------------------------------------------------
const gigLocs = await asAnon(
  db,
  `select loc from public.sitemap_urls('gigs', 1, 1000) order by loc`,
  'sitemap lists gigs',
);
check(
  'the gigs sitemap lists exactly the open gig',
  JSON.stringify((gigLocs?.rows ?? []).map((row) => row.loc)) ===
    JSON.stringify([`/freelance/${GIG_OPEN}`]),
  JSON.stringify(gigLocs?.rows),
);

const sections = await asAnon(
  db,
  `select urls from public.sitemap_sections(1000) where section = 'gigs'`,
  'sitemap section count for gigs',
);
check('the sitemap index counts one gig', sections?.rows[0]?.urls === 1);

// ---------------------------------------------------------------------------
// what a crawler is told
// ---------------------------------------------------------------------------
async function seo(path) {
  const result = await asAnon(
    db,
    `select title, description, robots, source, canonical from public.seo_for_path('${path}')`,
    `crawler asks for ${path}`,
  );
  return result?.rows[0] ?? null;
}

const openMeta = await seo(`/freelance/${GIG_OPEN}`);
check(
  'an open gig is indexed with its own title',
  openMeta?.robots === 'index' && openMeta.source === 'gig' &&
    openMeta.title.includes('Payments API'),
  JSON.stringify(openMeta),
);

const closedMeta = await seo(`/freelance/${GIG_CLOSED}`);
check(
  'a closed gig is noindex and its title does not reach a crawler',
  closedMeta?.robots === 'noindex' &&
    !closedMeta.title.includes('Landing') &&
    !closedMeta.description.includes('Landing'),
  JSON.stringify(closedMeta),
);

const draftMeta = await seo(`/freelance/${GIG_DRAFT}`);
check(
  'a draft gig is noindex and its title does not reach a crawler',
  draftMeta?.robots === 'noindex' && !draftMeta.title.includes('Secret'),
  JSON.stringify(draftMeta),
);

const unknownGig = await seo('/freelance/no-such-gig');
check(
  'an unknown gig is answered as missing and kept out of the index',
  unknownGig?.source === 'missing' && unknownGig.robots === 'noindex',
  JSON.stringify(unknownGig),
);

const tagMeta = await seo('/tag/proof-talk');
check(
  'a tag with posts is indexed with its own label',
  tagMeta?.robots === 'index' && tagMeta.source === 'tag' && tagMeta.title.includes('Proof Talk'),
  JSON.stringify(tagMeta),
);

const emptyTag = await seo('/tag/proof-empty');
check('a tag with no posts is noindex', emptyTag?.robots === 'noindex', JSON.stringify(emptyTag));

const unknownTag = await seo('/tag/no-such-tag');
check('an unknown tag is missing', unknownTag?.source === 'missing', JSON.stringify(unknownTag));

for (const path of [
  '/p/no-such-post',
  '/shop/no-such-product',
  '/learn/no-such-course',
  '/g/no-such-group',
  '/projects/no-such-project',
  '/jobs/no-such-job',
  '/events/no-such-event',
  '/@nobody-here',
]) {
  const meta = await seo(path);
  check(
    `an unknown record address answers missing: ${path}`,
    meta?.source === 'missing' && meta.robots === 'noindex',
    JSON.stringify(meta),
  );
}

const about = await seo('/about');
check(
  'a static page is not treated as a missing record',
  about !== null && about.source !== 'missing' && about.robots === 'index',
  JSON.stringify(about),
);

console.log(`\n${fails === 0 ? 'all' : fails} ${fails === 0 ? 'checks' : 'failed'} for 0067`);
if (fails > 0) process.exitCode = 1;
await db.close();
