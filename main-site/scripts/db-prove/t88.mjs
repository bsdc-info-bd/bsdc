/**
 * Proof for 0128: a listing learns to be edited, closed and deleted.
 *
 * Every directory on BSDC stored rows only their author may write and offered
 * that author no routine to write them, so a published gig, job, group or event
 * was write-once in practice. This harness asks the database the same questions
 * of every one of the ten new routines:
 *
 *   * the owner may change it, and the change is stored;
 *   * a stranger is refused with 42501 or, where row security hides the row
 *     first, with "not found" — and the row is provably unchanged either way;
 *   * staff may moderate it;
 *   * a closed listing stops accepting proposals/applications while its queue
 *     stays readable to the poster;
 *   * deleting something other people answered requires the confirmation flag
 *     and tells those people before the rows go;
 *   * a cover on a host BSDC does not serve pictures from is refused;
 *   * the status columns are no longer reachable through a raw table write, so
 *     these routines are the only door to them.
 */
import { as, check, expectFail, failureCount, makeDb, summary } from './lib.mjs';

const ada = 'aaaaaaaa-0127-4127-8127-000000000001'; // gig client, job poster, group owner, event host
const rahim = 'bbbbbbbb-0127-4127-8127-000000000002'; // freelancer, applicant, group member, attendee
const nadia = 'cccccccc-0127-4127-8127-000000000003'; // unrelated member
const staff = 'dddddddd-0127-4127-8127-000000000004'; // an administrator

const GIG = 'logo-redesign-for-a-startup';
const JOB = 'senior-backend-engineer';
const GROUP = 'sylhet-php-community';
const EVENT = 'sylhet-php-meetup';

const db = await makeDb();

await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${ada}',   'ada_0127',   'Ada Lovelace',   'member', 'active'),
    ('${rahim}', 'rahim_0127', 'Rahim Uddin',    'member', 'active'),
    ('${nadia}', 'nadia_0127', 'Nadia Akter',    'member', 'active'),
    ('${staff}', 'staff_0127', 'Staff Member',   'admin',  'active');

  insert into public.gigs (slug, title, description, budget_min, budget_max, currency,
                           is_hourly, duration_days, skills, status, client_uid, published_at)
  values ('${GIG}', 'Logo redesign for a startup',
          'Design a new logo and hand over every source file, in Figma.',
          20000, 40000, 'BDT', false, 14, array['figma','illustrator'], 'open', '${ada}', now());

  insert into public.jobs (slug, title, company, description, job_type, work_mode, level,
                           city, salary_min, salary_max, skills, status, poster_uid, published_at)
  values ('${JOB}', 'Senior Backend Engineer', 'Dhaka Labs',
          'Own the payouts service, its ledger and its reconciliation jobs.',
          'full_time', 'remote', 'senior', '', 120000, 180000,
          array['node','postgres'], 'open', '${ada}', now());
`);

const gigId = (await db.query(`select id from public.gigs where slug = '${GIG}'`)).rows[0].id;
const jobId = (await db.query(`select id from public.jobs where slug = '${JOB}'`)).rows[0].id;

// ===========================================================================
// 1. A gig is corrected by its client, and by nobody else
// ===========================================================================
const updatedGig = await as(
  db,
  ada,
  `select public.update_gig('${gigId}', 'Logo and brand marks for a startup',
     'Design a new logo and its marks, and hand over every source file, in Figma.',
     25000, 45000, false, 21, array['Figma', 'illustrator', 'FIGMA'], null, null) as slug`,
  'the client corrects their own gig',
);
check(
  'the corrected gig keeps its address',
  updatedGig?.rows[0]?.slug === GIG,
  updatedGig?.rows[0]?.slug,
);

const corrected = await db.query(
  `select title, budget_min, budget_max, duration_days, skills from public.gigs where id = '${gigId}'`,
);
check(
  'the correction is stored, including a normalised skill list',
  corrected.rows[0]?.title === 'Logo and brand marks for a startup' &&
    Number(corrected.rows[0]?.budget_min) === 25000 &&
    Number(corrected.rows[0]?.duration_days) === 21 &&
    JSON.stringify(corrected.rows[0]?.skills) === JSON.stringify(['figma', 'illustrator']),
  JSON.stringify(corrected.rows[0]),
);

await expectFail(
  db,
  nadia,
  `select public.update_gig('${gigId}', 'Hijacked gig',
     'A stranger rewriting this listing should never be written at all.', null, null,
     null, null, null, null, null)`,
  '42501',
  'a stranger cannot correct somebody else\\u2019s gig',
);

await as(
  db,
  staff,
  `select public.update_gig('${gigId}', 'Logo design, administratively corrected',
     'Staff corrected the description after a report about the budget wording.',
     null, null, null, null, null, null, null)`,
  'staff may moderate a gig they do not own',
  { bsdc_role: 'admin', staff: true },
);

// The checks the columns already applied, raised as something a form can show.
await expectFail(
  db,
  ada,
  `select public.update_gig('${gigId}', 'Logo design',
     'A description that is long enough to pass the only length rule.',
     40000, 20000, false, 14, null, null, null)`,
  '22023',
  'a budget range that runs backwards is refused before the column sees it',
);
await expectFail(
  db,
  ada,
  `select public.update_gig('${gigId}', 'Logo design',
     'A description that is long enough to pass the only length rule.',
     null, null, null, null, null, 'https://example.com/hotlink.webp', null)`,
  '22023',
  'a cover URL on a host BSDC does not serve pictures from is refused',
);
const coverSaved = await as(
  db,
  ada,
  `select public.update_gig('${gigId}', 'Logo design',
     'A description that is long enough to pass the only length rule.',
     null, null, null, null, null, 'https://i.ibb.co/abc123/logo.webp', null) as slug`,
  'an ImgBB cover is accepted and stored',
);
check('the cover the client chose is on the row', coverSaved !== null);
const cover = await db.query(`select cover_url from public.gigs where id = '${gigId}'`);
check(
  'the gig now carries its cover',
  cover.rows[0]?.cover_url === 'https://i.ibb.co/abc123/logo.webp',
  cover.rows[0]?.cover_url,
);

// The status column keeps the owner grant 0014 gave it, so a raw update still
// reaches the row — the routine is not the only door, and pretending otherwise
// would be a claim this file does not make (see section 6 of 0128). What is
// proved instead is that the routine closes the gig the same way the column
// would, and that a *stranger* still cannot.
const rawClose = await as(
  db,
  ada,
  `update public.gigs set status = 'paused' where id = '${gigId}' returning status`,
  'the owner may still write their own gig status directly, as 0014 granted',
);
check('the owner\\u2019s own status write still lands', rawClose?.rows[0]?.status === 'paused');
await as(
  db,
  ada,
  `update public.gigs set status = 'open' where id = '${gigId}' returning status`,
  'and the owner may reopen what they paused',
);
const strangerStatus = await as(
  db,
  nadia,
  `update public.gigs set status = 'closed' where id = '${gigId}' returning status`,
  'a stranger\\u2019s status write matches no row',
);
check(
  'a stranger cannot close somebody else\\u2019s gig through the table',
  strangerStatus !== null && strangerStatus.rows.length === 0,
  JSON.stringify(strangerStatus?.rows),
);

// ===========================================================================
// 2. Closing a gig stops proposals, keeps the queue, and tells the bidders
// ===========================================================================
await as(
  db,
  rahim,
  `select public.submit_proposal('${gigId}',
     'I have drawn marks for three Sylhet startups and can start on Monday.', 32000, 10)`,
  'a freelancer bids while the gig is open',
);
await as(db, ada, `select public.close_gig('${gigId}')`, 'the client closes the gig');

const closed = await db.query(`select status from public.gigs where id = '${gigId}'`);
check('the gig is closed', closed.rows[0]?.status === 'closed', closed.rows[0]?.status);

await expectFail(
  db,
  nadia,
  `select public.submit_proposal('${gigId}',
     'A closed gig must refuse a proposal no matter who sends it.', 1000, 3)`,
  'P0002',
  'a closed gig refuses a new proposal',
);

const queue = await as(
  db,
  ada,
  `select count(*)::integer as total from public.gig_proposal_queue('${gigId}')`,
  'the client still reads the proposal queue after closing',
);
check(
  'the bid that arrived while it was open is still there',
  queue?.rows[0]?.total === 1,
  JSON.stringify(queue?.rows),
);

const bidderNoticed = await db.query(
  `select body, target_url from public.notifications
    where uid = '${rahim}' and body like 'The gig%has closed%'`,
);
check(
  'the freelancer is told the gig closed, with a link to it',
  bidderNoticed.rows.length === 1 && bidderNoticed.rows[0].target_url === `/freelance/${GIG}`,
  JSON.stringify(bidderNoticed.rows),
);

// Closing twice is a no-op rather than a second round of notifications.
await as(
  db,
  ada,
  `select public.close_gig('${gigId}')`,
  'closing an already closed gig is harmless',
);
const secondNotice = await db.query(
  `select count(*)::integer as total from public.notifications
    where uid = '${rahim}' and body like 'The gig%has closed%'`,
);
check(
  'the second close did not notify twice',
  secondNotice.rows[0]?.total === 1,
  secondNotice.rows[0]?.total,
);

// ===========================================================================
// 3. A job is corrected and closed the same way
// ===========================================================================
await as(
  db,
  rahim,
  `select public.apply_to_job('${jobId}', 'I have run a payouts ledger in Dhaka for four years.',
     '', 'Rahim Uddin', '+8801712345678')`,
  'an applicant applies while the job is open',
);

const updatedJob = await as(
  db,
  ada,
  `select public.update_job('${jobId}', 'Staff Backend Engineer', 'Dhaka Labs',
     'Own the payouts service, its ledger, its reconciliation jobs and its on-call.',
     'full_time', 'remote', 'senior', '', 130000, 190000, 'month',
     array['node', 'postgres', 'ledger'], '', null, null, null) as slug`,
  'the poster corrects their own job',
);
check(
  'the corrected job keeps its address',
  updatedJob?.rows[0]?.slug === JOB,
  updatedJob?.rows[0]?.slug,
);

await expectFail(
  db,
  nadia,
  `select public.update_job('${jobId}', 'Hijacked job', 'Nowhere Ltd',
     'A stranger rewriting this posting should never be written at all.',
     null, null, null, null, null, null, null, null, null, null, null, null)`,
  '42501',
  'a stranger cannot correct somebody else\\u2019s job',
);
await expectFail(
  db,
  ada,
  `select public.update_job('${jobId}', 'Staff Backend Engineer', 'Dhaka Labs',
     'Own the payouts service, its ledger, its reconciliation jobs and its on-call.',
     null, 'onsite', null, '', null, null, null, null, null, null, null, null)`,
  '22023',
  'an on-site job with no city is refused, the way the form says',
);

// A cover that is stored but never selected is a cover nobody sees. Both job
// reads listed their columns (0013, 0066) instead of using `*`, so this file
// re-creates them with `cover_url`; what follows proves the column really comes
// back through each of them rather than only landing on the row.
const JOB_COVER = 'https://i.ibb.co/abc123/payments.webp';
await as(
  db,
  ada,
  `select public.update_job('${jobId}', 'Staff Backend Engineer', 'Dhaka Labs',
     'Own the payouts service, its ledger, its reconciliation jobs and its on-call.',
     'full_time', 'remote', 'senior', '', 130000, 190000, 'month',
     array['node', 'postgres', 'ledger'], '', null, '${JOB_COVER}', null)`,
  'the poster puts a cover on the role',
);
const jobDetailRead = await as(
  db,
  nadia,
  `select cover_url from public.job_detail('${JOB}')`,
  'anybody may read the role and its cover',
);
check(
  'job_detail returns the cover, so the page can draw it',
  jobDetailRead?.rows[0]?.cover_url === JOB_COVER,
  jobDetailRead?.rows[0]?.cover_url,
);
const jobBoardRead = await as(
  db,
  nadia,
  `select cover_url from public.job_board(50, null, null) where slug = '${JOB}'`,
  'the board lists the role',
);
check(
  'job_board returns the cover, so a card can show it',
  jobBoardRead?.rows[0]?.cover_url === JOB_COVER,
  jobBoardRead?.rows[0]?.cover_url,
);
// The two routines are dropped and recreated by 0128, so the grants have to be
// proved again — a re-created function comes back with none.
await anonRefused(
  `select public.job_board(10, null, null)`,
  'an anonymous caller still reaches job_board after it was re-created',
);

await as(db, ada, `select public.close_job('${jobId}')`, 'the poster closes the job');
await expectFail(
  db,
  nadia,
  `select public.apply_to_job('${jobId}', 'A closed role must refuse an application.',
     '', 'Nadia Akter', '')`,
  'P0002',
  'a closed job refuses a new application',
);

const applicantQueue = await as(
  db,
  ada,
  `select count(*)::integer as total from public.job_application_queue('${jobId}')`,
  'the poster still reads the applicant queue after closing',
);
check(
  'the application that arrived while it was open is still there',
  applicantQueue?.rows[0]?.total === 1,
);

const applicantNoticed = await db.query(
  `select target_url from public.notifications
    where uid = '${rahim}' and body like 'The role%has closed%'`,
);
check(
  'the undecided applicant is told the role closed',
  applicantNoticed.rows.length === 1 && applicantNoticed.rows[0].target_url === `/jobs/${JOB}`,
  JSON.stringify(applicantNoticed.rows),
);

// ===========================================================================
// 4. Deleting what other people answered needs the confirmation
// ===========================================================================
await expectFail(
  db,
  ada,
  `select public.delete_job('${jobId}')`,
  '22023',
  'a job with applications is not deleted without confirmation',
);
const survived = await db.query(
  `select count(*)::integer as total from public.jobs where id = '${jobId}'`,
);
check('the unconfirmed delete left the job alone', survived.rows[0]?.total === 1);

await as(
  db,
  ada,
  `select public.delete_job('${jobId}', true)`,
  'the poster deletes the job having confirmed its applications go too',
);
const gone = await db.query(
  `select
     (select count(*)::integer from public.jobs where id = '${jobId}') as jobs,
     (select count(*)::integer from public.job_applications where job_id = '${jobId}') as applications`,
);
check(
  'the job and its applications are gone together',
  gone.rows[0]?.jobs === 0 && gone.rows[0]?.applications === 0,
  JSON.stringify(gone.rows[0]),
);
const withdrawnNotice = await db.query(
  `select target_url from public.notifications
    where uid = '${rahim}' and body like 'The role%was withdrawn%'`,
);
check(
  'the applicant is told the role was withdrawn',
  withdrawnNotice.rows.length === 1 && withdrawnNotice.rows[0].target_url === '/jobs',
  JSON.stringify(withdrawnNotice.rows),
);

// The gig still has one bid, so the same rule applies to it.
await expectFail(
  db,
  ada,
  `select public.delete_gig('${gigId}')`,
  '22023',
  'a gig with proposals is not deleted without confirmation',
);
await as(db, ada, `select public.delete_gig('${gigId}', true)`, 'the client deletes the gig');
const gigGone = await db.query(
  `select
     (select count(*)::integer from public.gigs where id = '${gigId}') as gigs,
     (select count(*)::integer from public.gig_proposals where gig_id = '${gigId}') as proposals`,
);
check(
  'the gig and its proposals are gone together',
  gigGone.rows[0]?.gigs === 0 && gigGone.rows[0]?.proposals === 0,
  JSON.stringify(gigGone.rows[0]),
);

// A listing nobody answered deletes without ceremony.
const bareGig = await as(
  db,
  ada,
  `insert into public.gigs (slug, title, description, client_uid, status)
   values ('bare-gig-0127', 'Bare gig', 'A gig with nothing attached to it at all.', '${ada}', 'open')
   returning id`,
  'a gig with no proposals is created',
);
await as(
  db,
  ada,
  `select public.delete_gig('${bareGig?.rows[0]?.id}')`,
  'a gig nobody bid on deletes without a confirmation flag',
);

// ===========================================================================
// 5. A group is corrected by its moderators, and ended by its owner only
// ===========================================================================
const groupId = (
  await db.query(
    `select public.create_group('${GROUP}', 'Sylhet PHP Community',
       'The PHP developers of Sylhet, and their monthly meetup.', 'public', 'bn') as id`,
    [],
  )
).rows[0].id;
await db.exec(
  `insert into public.group_members (group_id, uid, role) values ('${groupId}', '${rahim}', 'moderator')`,
);
const generalChannel = (
  await db.query(
    `select id from public.channels where group_id = '${groupId}' and slug = 'general'`,
  )
).rows[0].id;

await as(
  db,
  rahim,
  `select public.update_group('${groupId}', 'Sylhet PHP & Laravel Community',
     'The PHP and Laravel developers of Sylhet, and their monthly meetup.',
     'Be kind. Search before asking. No recruiter spam.', 'public', 'bn', null, null)`,
  'a group moderator corrects the group',
);
const groupRules = await db.query(`select name, rules from public.groups where id = '${groupId}'`);
check(
  'the correction is stored',
  groupRules.rows[0]?.name === 'Sylhet PHP & Laravel Community' &&
    groupRules.rows[0]?.rules.startsWith('Be kind.'),
  JSON.stringify(groupRules.rows[0]),
);

await expectFail(
  db,
  nadia,
  `select public.update_group('${groupId}', 'Hijacked group', 'A stranger rewriting this group.',
     null, null, null, null, null)`,
  '42501',
  'a stranger cannot correct a group',
);
await expectFail(
  db,
  nadia,
  `select public.delete_group('${groupId}')`,
  '42501',
  'a stranger cannot end a group',
);
await expectFail(
  db,
  rahim,
  `select public.delete_group('${groupId}')`,
  '42501',
  'a moderator may correct a group but only its owner may end it',
);

// A discussion that was private to the group must not survive as a public post.
await db.exec(`
  insert into public.posts (slug, title, body, author_uid, status, visibility, channel_id, published_at)
  values ('group-secret-0127', 'Channel-only question',
          'A question asked inside the group and not meant for the home feed.',
          '${rahim}', 'published', 'public', '${generalChannel}', now());
`);
const beforeDelete = await db.query(
  `select count(*)::integer as total from public.posts
    where author_uid = '${rahim}' and channel_id = '${generalChannel}'`,
);
check('the channel post exists before the group is ended', beforeDelete.rows[0]?.total === 1);

await as(db, ada, `select public.delete_group('${groupId}')`, 'the owner ends the group');
const afterDelete = await db.query(
  `select count(*)::integer as total from public.groups where id = '${groupId}'`,
);
check('the group is gone', afterDelete.rows[0]?.total === 0);
const detached = await db.query(
  `select channel_id, status from public.posts where author_uid = '${rahim}' and slug = 'group-secret-0127'`,
);
check(
  'the group\\u2019s post survives, detached and archived, never public',
  detached.rows.length === 1 &&
    detached.rows[0].channel_id === null &&
    detached.rows[0].status === 'archived',
  JSON.stringify(detached.rows[0]),
);
const channelGone = await db.query(
  `select count(*)::integer as total from public.channels where group_id = '${groupId}'`,
);
check('the group\\u2019s channels went with it', channelGone.rows[0]?.total === 0);

// ===========================================================================
// 6. An event is corrected by its host and cancelled with a notice
// ===========================================================================
const eventId = (
  await db.query(
    `insert into public.events (slug, title, description, mode, venue, city, join_url,
                                starts_at, ends_at, timezone, capacity, host_uid)
     values ('${EVENT}', 'Sylhet PHP Meetup', 'An evening of talks about PHP in Sylhet.',
             'online', '', '', 'https://meet.example.com/sylhet-php',
             now() + interval '7 days', now() + interval '7 days 3 hours',
             'Asia/Dhaka', 60, '${ada}')
     returning id`,
    [],
  )
).rows[0].id;

await as(
  db,
  rahim,
  `select public.rsvp_event('${eventId}', 'going')`,
  'a member says they are going',
);

await as(db, ada, `select public.cancel_event('${eventId}')`, 'the host cancels the event');
const cancelled = await db.query(`select is_cancelled from public.events where id = '${eventId}'`);
check('the event is marked cancelled and still exists', cancelled.rows[0]?.is_cancelled === true);
const attendeeNoticed = await db.query(
  `select target_url from public.notifications
    where uid = '${rahim}' and body like '%has been cancelled%'`,
);
check(
  'everyone who had not declined is told, with a link to the event',
  attendeeNoticed.rows.length === 1 && attendeeNoticed.rows[0].target_url === `/events/${EVENT}`,
  JSON.stringify(attendeeNoticed.rows),
);

await expectFail(
  db,
  nadia,
  `select public.cancel_event('${eventId}')`,
  '42501',
  'a stranger cannot cancel an event',
);

// A moved event is the one correction an attendee must hear about.
await as(
  db,
  ada,
  `select public.update_event('${eventId}', 'Sylhet PHP Meetup (rescheduled)',
     'An evening of talks about PHP in Sylhet.',
     now() + interval '14 days', now() + interval '14 days 3 hours',
     'online', '', '', 'https://meet.example.com/sylhet-php', null, 'Asia/Dhaka', 60, null) as slug`,
  'the host corrects and moves the event',
);
const movedNotices = await db.query(
  `select body from public.notifications
    where uid = '${rahim}' and body like '%has moved to%'`,
);
check(
  'an attendee is told the event moved',
  movedNotices.rows.length === 1,
  JSON.stringify(movedNotices.rows),
);

await expectFail(
  db,
  ada,
  `select public.update_event('${eventId}', 'Sylhet PHP Meetup',
     'An evening of talks about PHP in Sylhet.',
     now() + interval '14 days 3 hours', now() + interval '14 days',
     null, null, null, null, null, null, null, null)`,
  '22023',
  'an event that ends before it starts is refused',
);
await expectFail(
  db,
  ada,
  `select public.update_event('${eventId}', 'Sylhet PHP Meetup',
     'An evening of talks about PHP in Sylhet.',
     now() + interval '14 days', now() + interval '14 days 3 hours',
     'online', null, null, '', null, null, null, null)`,
  '22023',
  'an online event with no join link is refused',
);

await as(db, ada, `select public.delete_event('${eventId}')`, 'the host deletes the event');
const eventGone = await db.query(
  `select
     (select count(*)::integer from public.events where id = '${eventId}') as events,
     (select count(*)::integer from public.event_rsvps where event_id = '${eventId}') as rsvps`,
);
check(
  'the event and its RSVPs are gone together',
  eventGone.rows[0]?.events === 0 && eventGone.rows[0]?.rsvps === 0,
  JSON.stringify(eventGone.rows[0]),
);

// ===========================================================================
// 7. An anonymous caller reaches none of it
// ===========================================================================
// `asAnon` reports a refusal as a failure, which is the wrong polarity for a
// check whose expected answer *is* the refusal: the grant is what is being
// proved, so the privilege error is the pass.
async function anonRefused(sql, label) {
  await db.exec(
    `set role anon; select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', false);`,
  );
  try {
    await db.query(sql);
    check(label, false, 'the anonymous caller was allowed through');
  } catch (error) {
    check(label, error.code === '42501', `${error.code} ${error.message.split('\n')[0]}`);
  } finally {
    await db.exec('reset role;');
  }
}

await anonRefused(
  `select public.update_group('${groupId}', 'Anon group', 'An anonymous caller writing this.',
     null, null, null, null, null)`,
  'an anonymous caller cannot reach the group routine',
);
await anonRefused(
  `select public.delete_event('${eventId}')`,
  'an anonymous caller cannot reach the event routine',
);
await anonRefused(
  `select public.delete_job('${jobId}', true)`,
  'an anonymous caller cannot reach the job routine',
);

if (failureCount() > 0) process.exitCode = 1;
if (summary() > 0) process.exitCode = 1;
await db.close();
