/**
 * Proof for 0067: a listing has a page, and the sitemap tells the truth.
 *
 * The sitemap advertised /jobs/<slug> and /events/<slug>, but the app had no
 * such pages. This harness seeds one listing of each kind that a reader should
 * and should not see, then asks the database three questions: what a visitor
 * may read through job_detail and event_detail, what a crawler is told through
 * seo_for_path, and what the sitemap lists. Every answer is checked against the
 * visibility rule the row-level security policies already enforce.
 */
import { as, asAnon, makeDb } from './lib.mjs';

const ada = 'aaaaaaaa-1111-4111-8111-000000000001'; // host, poster, group owner
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002'; // applicant, RSVP, private member
const sultana = 'cccccccc-3333-4333-8333-000000000003'; // stranger

const JOB_OPEN = 'job-open-role';
const JOB_EXPIRED = 'job-expired-role';
const JOB_CLOSED = 'job-closed-role';
const JOB_LATER = 'job-later-role';
const EVT_ONLINE = 'evt-online-meetup';
const EVT_PRIVATE = 'evt-private-plans';
const EVT_CANCELLED = 'evt-cancelled-session';
const EVT_IN_PERSON = 'evt-in-person-workshop';
const SECRET_TITLE = 'Board of Secret Plans';
const JOB_TITLE = 'Senior Backend Engineer';

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
    ('${sultana}', 'Sultana Razia', 'sultana');

  insert into public.groups (slug, name, privacy, owner_uid) values
    ('open-club', 'Open Club', 'public', '${ada}'),
    ('secret-club', 'Secret Club', 'private', '${ada}');
  insert into public.group_members (group_id, uid, role)
    select id, '${rahim}', 'member' from public.groups where slug = 'secret-club';

  insert into public.jobs (slug, title, company, description, job_type, work_mode, level,
                           city, country, salary_min, salary_max, skills, apply_url,
                           status, poster_uid, expires_at, published_at) values
    ('${JOB_OPEN}', '${JOB_TITLE}', 'Shohoz Labs', 'Build payment rails for two million riders.',
     'full_time', 'hybrid', 'senior', 'Dhaka', 'BD', 150000, 220000, array['node','postgres'],
     'https://example.com/apply', 'open', '${ada}', now() + interval '30 days', now()),
    ('${JOB_LATER}', 'Frontend Engineer', 'Pathao Works', 'Ship the rider app.',
     'contract', 'remote', 'mid', '', 'BD', null, null, array['react'], '',
     'open', '${ada}', now() + interval '10 days', now()),
    ('${JOB_EXPIRED}', 'Expired Data Role', 'Old Co', 'This role closed last week.',
     'full_time', 'onsite', 'junior', 'Sylhet', 'BD', null, null, array[]::text[], '',
     'open', '${ada}', now() - interval '1 day', now() - interval '20 days'),
    ('${JOB_CLOSED}', 'Closed Design Role', 'Hidden Co', 'Filled internally.',
     'part_time', 'onsite', 'entry', 'Dhaka', 'BD', null, null, array[]::text[], '',
     'closed', '${ada}', null, now() - interval '5 days');

  insert into public.events (slug, title, description, mode, venue, city, join_url, starts_at,
                             ends_at, host_uid, group_id, is_cancelled, going_count) values
    ('${EVT_ONLINE}', 'Friday Meetup', 'Talks on Postgres.', 'online', '', '',
     'https://meet.example.com/abc', now() + interval '3 days', now() + interval '3 days 2 hours',
     '${ada}', null, false, 0),
    ('${EVT_IN_PERSON}', 'Hands On Workshop', 'Bring a laptop.', 'in_person', 'Sylhet Tech Hub',
     'Sylhet', '', now() + interval '6 days', now() + interval '6 days 3 hours',
     '${ada}', null, false, 0),
    ('${EVT_CANCELLED}', 'Cancelled Session', 'Postponed indefinitely.', 'online', '', '',
     'https://meet.example.com/cancel', now() + interval '8 days', now() + interval '8 days 1 hour',
     '${ada}', null, true, 0),
    ('${EVT_PRIVATE}', '${SECRET_TITLE}', 'Members only.', 'online', '', '',
     'https://meet.example.com/private', now() + interval '4 days', now() + interval '4 days 1 hour',
     '${ada}', (select id from public.groups where slug = 'secret-club'), false, 0);
`);

// ---------------------------------------------------------------------------
// job_detail
// ---------------------------------------------------------------------------
const anonOpen = await asAnon(
  db,
  `select * from public.job_detail('${JOB_OPEN}')`,
  'anonymous reads an open job',
);
check(
  'an anonymous visitor reads an open job, description and apply link included',
  anonOpen?.rows.length === 1 &&
    anonOpen.rows[0].description.startsWith('Build payment') &&
    anonOpen.rows[0].apply_url === 'https://example.com/apply',
);

const anonExpired = await asAnon(
  db,
  `select * from public.job_detail('${JOB_EXPIRED}')`,
  'anonymous reads an expired job',
);
check('an expired job is invisible to an anonymous visitor', anonExpired?.rows.length === 0);

const anonClosed = await asAnon(
  db,
  `select * from public.job_detail('${JOB_CLOSED}')`,
  'anonymous reads a closed job',
);
check('a closed job is invisible to an anonymous visitor', anonClosed?.rows.length === 0);

const adaClosed = await as(
  db,
  ada,
  `select * from public.job_detail('${JOB_CLOSED}')`,
  'the poster reads their closed job',
);
check('the poster can still open their own closed job', adaClosed?.rows.length === 1);

const anonMissing = await asAnon(
  db,
  `select * from public.job_detail('no-such-job')`,
  'anonymous reads a job that does not exist',
);
check('an unknown job slug is an empty answer, not an error', anonMissing?.rows.length === 0);

const before = await as(
  db,
  rahim,
  `select my_status from public.job_detail('${JOB_OPEN}')`,
  'applicant reads the job before applying',
);
check('before applying, my_status is null', before?.rows[0]?.my_status === null);

await as(
  db,
  rahim,
  `select public.apply_to_job(
     (select id from public.jobs where slug = '${JOB_OPEN}'),
     'I have shipped three production Node services on Postgres.', '')`,
  'applicant applies to the open job',
);
const after = await as(
  db,
  rahim,
  `select my_status from public.job_detail('${JOB_OPEN}')`,
  'applicant reads the job after applying',
);
check('after applying, my_status shows the application', after?.rows[0]?.my_status === 'submitted');

const anonStatus = await asAnon(
  db,
  `select my_status from public.job_detail('${JOB_OPEN}')`,
  'anonymous reads my_status',
);
check(
  'an anonymous visitor never sees an application status',
  anonStatus?.rows[0]?.my_status === null,
);

// ---------------------------------------------------------------------------
// event_detail
// ---------------------------------------------------------------------------
const anonEvent = await asAnon(
  db,
  `select * from public.event_detail('${EVT_ONLINE}')`,
  'anonymous reads a public online event',
);
check(
  'an anonymous visitor reads a public event, without its join link',
  anonEvent?.rows.length === 1 && anonEvent.rows[0].join_url === '',
);

await as(
  db,
  rahim,
  `select public.rsvp_event((select id from public.events where slug = '${EVT_ONLINE}'), 'going')`,
  'applicant RSVPs going',
);
const rahimEvent = await as(
  db,
  rahim,
  `select join_url, my_status from public.event_detail('${EVT_ONLINE}')`,
  'the attendee reads the event',
);
check(
  'a person who said going is given the join link',
  rahimEvent?.rows[0]?.join_url === 'https://meet.example.com/abc' &&
    rahimEvent.rows[0].my_status === 'going',
);

const strangerEvent = await as(
  db,
  sultana,
  `select join_url from public.event_detail('${EVT_ONLINE}')`,
  'a stranger reads the event',
);
check('a stranger who has not RSVPed gets no join link', strangerEvent?.rows[0]?.join_url === '');

const hostEvent = await as(
  db,
  ada,
  `select join_url from public.event_detail('${EVT_ONLINE}')`,
  'the host reads the event',
);
check(
  'the host always sees the join link',
  hostEvent?.rows[0]?.join_url === 'https://meet.example.com/abc',
);

const anonCancelled = await asAnon(
  db,
  `select is_cancelled from public.event_detail('${EVT_CANCELLED}')`,
  'anonymous reads a cancelled event',
);
check(
  'a cancelled event still resolves so the page can say it was cancelled',
  anonCancelled?.rows.length === 1 && anonCancelled.rows[0].is_cancelled === true,
);

const anonPrivate = await asAnon(
  db,
  `select * from public.event_detail('${EVT_PRIVATE}')`,
  'anonymous reads a private-group event',
);
check('a private-group event is invisible to an anonymous visitor', anonPrivate?.rows.length === 0);

const strangerPrivate = await as(
  db,
  sultana,
  `select * from public.event_detail('${EVT_PRIVATE}')`,
  'a stranger reads a private-group event',
);
check('a private-group event is invisible to a non-member', strangerPrivate?.rows.length === 0);

const memberPrivate = await as(
  db,
  rahim,
  `select title from public.event_detail('${EVT_PRIVATE}')`,
  'a member reads a private-group event',
);
check('a member of the private group reads it', memberPrivate?.rows[0]?.title === SECRET_TITLE);

const anonInPerson = await asAnon(
  db,
  `select venue from public.event_detail('${EVT_IN_PERSON}')`,
  'anonymous reads an in-person event',
);
check(
  'an in-person event shows its venue to anyone',
  anonInPerson?.rows[0]?.venue === 'Sylhet Tech Hub',
);

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

const seoOpen = await seo(`/jobs/${JOB_OPEN}`);
check(
  'an open job is indexable and titled with the role',
  seoOpen?.robots === 'index' && seoOpen.source === 'job' && seoOpen.title.includes(JOB_TITLE),
  JSON.stringify(seoOpen),
);

const seoExpired = await seo(`/jobs/${JOB_EXPIRED}`);
check(
  'an expired job is noindex and its title is generic',
  seoExpired?.robots === 'noindex' && !seoExpired.title.includes('Expired Data'),
  JSON.stringify(seoExpired),
);

const seoClosed = await seo(`/jobs/${JOB_CLOSED}`);
check(
  'a closed job is noindex and leaks neither its title nor its description',
  seoClosed?.robots === 'noindex' &&
    !seoClosed.title.includes('Closed Design') &&
    !seoClosed.description.includes('Filled internally'),
  JSON.stringify(seoClosed),
);

const seoMissingJob = await seo('/jobs/never-existed');
check(
  'an unknown job is noindex with source missing',
  seoMissingJob?.robots === 'noindex' && seoMissingJob.source === 'missing',
  JSON.stringify(seoMissingJob),
);

const seoPublic = await seo(`/events/${EVT_ONLINE}`);
check(
  'a public event is indexable and titled with the event',
  seoPublic?.robots === 'index' &&
    seoPublic.title.includes('Friday Meetup') &&
    seoPublic.source === 'event',
  JSON.stringify(seoPublic),
);

const seoPrivate = await seo(`/events/${EVT_PRIVATE}`);
check(
  'a private-group event is noindex and its name never reaches a crawler',
  seoPrivate?.robots === 'noindex' &&
    !seoPrivate.title.includes('Secret') &&
    !seoPrivate.description.includes('Members only'),
  JSON.stringify(seoPrivate),
);

const seoCancelled = await seo(`/events/${EVT_CANCELLED}`);
check(
  'a cancelled event is noindex',
  seoCancelled?.robots === 'noindex' && seoCancelled.title.includes('Cancelled Session'),
);

const seoMissingEvent = await seo('/events/never-existed');
check(
  'an unknown event is noindex with source missing',
  seoMissingEvent?.robots === 'noindex' && seoMissingEvent.source === 'missing',
  JSON.stringify(seoMissingEvent),
);

// ---------------------------------------------------------------------------
// the sitemap
// ---------------------------------------------------------------------------
async function sitemap(section) {
  const result = await asAnon(
    db,
    `select loc from public.sitemap_urls('${section}', 1, 1000) order by loc`,
    `sitemap lists ${section}`,
  );
  return (result?.rows ?? []).map((row) => row.loc);
}

const jobLocs = await sitemap('jobs');
check(
  'the jobs sitemap lists exactly the open, unexpired roles',
  JSON.stringify(jobLocs) === JSON.stringify([`/jobs/${JOB_LATER}`, `/jobs/${JOB_OPEN}`]),
  JSON.stringify(jobLocs),
);

const eventLocs = await sitemap('events');
check(
  'the events sitemap lists public, live events only',
  JSON.stringify(eventLocs) ===
    JSON.stringify([`/events/${EVT_IN_PERSON}`, `/events/${EVT_ONLINE}`]),
  JSON.stringify(eventLocs),
);
check(
  'a private-group event slug is never published in the sitemap',
  !eventLocs.some((loc) => loc.includes(EVT_PRIVATE)),
);

const sections = await asAnon(
  db,
  `select section, urls from public.sitemap_sections(1000) where section in ('jobs','events') order by section`,
  'sitemap section counts',
);
const counts = Object.fromEntries((sections?.rows ?? []).map((row) => [row.section, row.urls]));
check(
  'the sitemap index counts agree with the URL lists',
  counts.jobs === jobLocs.length && counts.events === eventLocs.length,
  JSON.stringify(counts),
);

// ---------------------------------------------------------------------------
// privileges
// ---------------------------------------------------------------------------
const grants = await db.query(`
  select has_function_privilege('anon', 'public.job_detail(text)', 'execute') as job_anon,
         has_function_privilege('anon', 'public.event_detail(text)', 'execute') as event_anon,
         has_function_privilege('public', 'public.job_detail(text)', 'execute') as job_public
`);
check(
  'anonymous and authenticated may call the detail reads, and PUBLIC may not',
  grants.rows[0].job_anon === true &&
    grants.rows[0].event_anon === true &&
    grants.rows[0].job_public === false,
  JSON.stringify(grants.rows[0]),
);

console.log(`\n${fails === 0 ? 'all' : fails} ${fails === 0 ? 'checks' : 'failed'} for 0067`);
if (fails > 0) process.exitCode = 1;
await db.close();
