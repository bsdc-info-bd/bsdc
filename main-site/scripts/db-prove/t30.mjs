/**
 * Proof for the create flows: a member can add to every directory, and the
 * checks the form mirrors are the checks the database actually applies.
 *
 * The complaint was that the marketplace, the groups, the calendar, the job
 * board and the showcase were all empty with no way to put anything in them.
 * The tables were there and their policies already compared the author column
 * against the caller — so what is proved here is that a member's insert lands,
 * that it is readable by the people who should read it, that one member cannot
 * write as another, and that every constraint the form warns about is a
 * constraint that would otherwise have arrived as a bare 23514.
 */
import { makeDb } from './lib.mjs';

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002';

let pass = 0;
const bad = [];
function check(condition, label, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`ok    ${label}`);
  } else {
    bad.push(label);
    console.log(`FAIL  ${label}${detail ? `  -> ${detail}` : ''}`);
  }
}

const db = await makeDb();
await db.exec(`
  insert into public.profiles (uid, username, display_name, role) values
    ('${ada}', 'adafirst',   'Ada First',   'member'),
    ('${rahim}', 'rahimsecond','Rahim Second','member');
`);

async function as(sub, sql) {
  const payload = JSON.stringify({
    sub,
    role: 'authenticated',
    bsdc_role: 'member',
    email: `${sub.slice(0, 8)}@bsdc.info.bd`,
    email_verified: true,
  });
  try {
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claims', $jwt$${payload}$jwt$, false);`,
    );
    return { ok: true, rows: (await db.query(sql)).rows };
  } catch (error) {
    return { ok: false, code: error.code, message: String(error.message).split('\n')[0] };
  } finally {
    await db.exec('reset role;');
  }
}

/** Refused, and refused for the reason the form says it would be. */
function refused(result, code, label) {
  check(
    !result.ok && result.code === code,
    label,
    `${result.code ?? 'accepted'} ${result.message ?? ''}`,
  );
}

// ------------------------------------------------------------- the calendar ---
const eventColumns = `slug, title, description, mode, venue, city, join_url, cover_url,
     starts_at, ends_at, timezone, capacity, host_uid`;

const event = await as(
  ada,
  `insert into public.events (${eventColumns}) values
     ('sylhet-developer-meetup-k2h9x1', 'Sylhet Developer Meetup',
      'An evening of talks and the sort of arguments only Bangladeshi developers have.',
      'in_person', 'Zindabazar Community Hall', 'Sylhet', '', '',
      '2027-03-04T18:00:00+06', '2027-03-04T21:00:00+06', 'Asia/Dhaka', null, '${ada}')
   returning id, slug, going_count`,
);
check(
  event.ok && typeof event.rows?.[0]?.id === 'string',
  'a member puts an event on the calendar',
  event.code ?? event.message ?? '',
);
const eventId = event.rows?.[0]?.id ?? '';
check(event.rows?.[0]?.going_count === 0, 'and it starts with nobody counted as going yet');

refused(
  await as(
    ada,
    `insert into public.events (${eventColumns}) values
       ('online-no-link-a1b2c3', 'An online event with no way in', '', 'online', '', '', '', '',
        '2027-03-05T18:00:00+06', '2027-03-05T20:00:00+06', 'Asia/Dhaka', null, '${ada}')`,
  ),
  '23514',
  'an online event without a join link is refused, as the form says',
);

refused(
  await as(
    ada,
    `insert into public.events (${eventColumns}) values
       ('ends-before-start-d4e5f6', 'Backwards', '', 'online', '', '', 'https://meet.bsdc.info.bd/x', '',
        '2027-03-05T20:00:00+06', '2027-03-05T18:00:00+06', 'Asia/Dhaka', null, '${ada}')`,
  ),
  '23514',
  'an event that ends before it starts is refused, as the form says',
);

refused(
  await as(
    ada,
    `insert into public.events (${eventColumns}) values
       ('no-venue-g7h8i9', 'Somewhere', '', 'in_person', '', 'Sylhet', '', '',
        '2027-03-06T18:00:00+06', '2027-03-06T20:00:00+06', 'Asia/Dhaka', null, '${ada}')`,
  ),
  '23514',
  'an in-person event with no venue is refused, as the form says',
);

refused(
  await as(
    rahim,
    `insert into public.events (${eventColumns}) values
       ('written-as-somebody-else-j1', 'Not mine', '', 'online', '', '', 'https://meet.bsdc.info.bd/y', '',
        '2027-03-07T18:00:00+06', '2027-03-07T20:00:00+06', 'Asia/Dhaka', null, '${ada}')`,
  ),
  '42501',
  'one member cannot host an event as another',
);

const seen = await as(
  rahim,
  `select count(*)::int as n from public.events where id = '${eventId}'`,
);
check(seen.ok && seen.rows?.[0]?.n === 1, 'and everybody else can read the calendar it joins');

// -------------------------------------------------------------- the job board ---
const jobColumns = `slug, title, company, description, job_type, work_mode, level, city, country,
     salary_min, salary_max, salary_currency, salary_period, skills, apply_url, status,
     poster_uid, expires_at, published_at`;

const posted = await as(
  ada,
  `insert into public.jobs (${jobColumns}) values
     ('bsdc-senior-platform-engineer-m3n4', 'Senior Platform Engineer', 'BSDC',
      'Own the data layer: migrations, the queue, and the incidents that come with it.',
      'full_time', 'remote', 'senior', '', 'BD', 180000, 260000, 'BDT', 'month',
      array['postgres','typescript'], '', 'open', '${ada}', null, now())
   returning id, applications_count`,
);
check(
  posted.ok && typeof posted.rows?.[0]?.id === 'string',
  'a member posts a job',
  posted.code ?? posted.message ?? '',
);
const jobId = posted.rows?.[0]?.id ?? '';
check(posted.rows?.[0]?.applications_count === 0, 'with nobody applied to it yet');

refused(
  await as(
    ada,
    `insert into public.jobs (${jobColumns}) values
       ('onsite-with-no-city-o5p6', 'Office Manager', 'BSDC', 'A real description of the work.',
        'full_time', 'onsite', 'mid', '', 'BD', null, null, 'BDT', 'month',
        array[]::text[], '', 'open', '${ada}', null, now())`,
  ),
  '23514',
  'a job that is not remote has to name a city, as the form says',
);

refused(
  await as(
    ada,
    `insert into public.jobs (${jobColumns}) values
       ('salary-backwards-q7r8', 'Designer', 'BSDC', 'A real description of the work.',
        'contract', 'remote', 'mid', '', 'BD', 200000, 80000, 'BDT', 'month',
        array[]::text[], '', 'open', '${ada}', null, now())`,
  ),
  '23514',
  'a salary range that goes down is refused, as the form says',
);

// An UPDATE that row security refuses does not raise: the row is simply not there
// to match, and nothing comes back.
const closed = await as(
  rahim,
  `update public.jobs set status = 'closed' where id = '${jobId}' returning id`,
);
check(
  !closed.ok || (closed.rows ?? []).length === 0,
  'and one member cannot close another member\u2019s posting',
  JSON.stringify(closed.rows ?? closed.code),
);
const stillOpen = await db.query(`select status from public.jobs where id = '${jobId}'`);
check(stillOpen.rows[0]?.status === 'open', 'so the posting is still open');

const applications = await as(
  rahim,
  `select public.apply_to_job('${jobId}', 'I have run this queue for three years.', '') as status`,
);
check(
  applications.ok && typeof applications.rows?.[0]?.status === 'string',
  'somebody can apply to what was just posted',
  applications.code ?? applications.message ?? '',
);
const counted = await db.query(`select applications_count from public.jobs where id = '${jobId}'`);
check(counted.rows[0]?.applications_count === 1, 'and the posting counts it');

// -------------------------------------------------------------- the freelance ---
const gigColumns = `slug, title, description, budget_min, budget_max, currency, is_hourly,
     duration_days, skills, status, client_uid, published_at`;

const gig = await as(
  ada,
  `insert into public.gigs (${gigColumns}) values
     ('illustrate-a-childrens-book-s9t1', 'Illustrate a children\u2019s book',
      'Twenty-four watercolour spreads, a cover, and two rounds of revision.',
      40000, 60000, 'BDT', false, 45, array['illustration'], 'open', '${ada}', now())
   returning id, proposals_count`,
);
check(
  gig.ok && typeof gig.rows?.[0]?.id === 'string',
  'a member posts a gig',
  gig.code ?? gig.message ?? '',
);
const gigId = gig.rows?.[0]?.id ?? '';

refused(
  await as(
    ada,
    `insert into public.gigs (${gigColumns}) values
       ('budget-backwards-u2v3', 'A gig', 'A real description of the work.',
        60000, 40000, 'BDT', false, null, array[]::text[], 'open', '${ada}', now())`,
  ),
  '23514',
  'a budget that goes down is refused, as the form says',
);

refused(
  await as(
    ada,
    `insert into public.gigs (${gigColumns}) values
       ('impossible-deadline-w4x5', 'A gig', 'A real description of the work.',
        null, null, 'BDT', false, 0, array[]::text[], 'open', '${ada}', now())`,
  ),
  '23514',
  'and so is a delivery in zero days',
);

const proposal = await as(
  rahim,
  `select public.submit_proposal('${gigId}', 'I have done three books like this.', 52000, 40) as status`,
);
check(
  proposal.ok && typeof proposal.rows?.[0]?.status === 'string',
  'somebody can propose against it',
  proposal.code ?? proposal.message ?? '',
);
const proposals = await db.query(`select proposals_count from public.gigs where id = '${gigId}'`);
check(proposals.rows[0]?.proposals_count === 1, 'and the gig counts the proposal');

// --------------------------------------------------------------- the showcase ---
const projectColumns = `slug, name, tagline, description, repo_url, demo_url, cover_url, tech,
     license, looking_for_contributors, owner_uid`;

const project = await as(
  ada,
  `insert into public.projects (${projectColumns}) values
     ('padma-river-monitor-y6z7', 'Padma',
      'A river-level monitor that runs on a solar board and a prayer.',
      'It reads a sensor every ten minutes and publishes the level to anyone who asks.',
      'https://github.com/bsdc-info-bd/padma', '', '', array['rust','postgres'],
      'Apache-2.0', true, '${ada}')
   returning id, stars_count`,
);
check(
  project.ok && typeof project.rows?.[0]?.id === 'string',
  'a member publishes a project',
  project.code ?? project.message ?? '',
);
const projectId = project.rows?.[0]?.id ?? '';

refused(
  await as(
    ada,
    `insert into public.projects (${projectColumns}) values
       ('P', 'P', '', 'Something.', '', '', '', array[]::text[], '', false, '${ada}')`,
  ),
  '23514',
  'a project with a one-letter name is refused, as the form says',
);

refused(
  await as(
    ada,
    `insert into public.projects (slug, name, owner_uid) values ('BAD SLUG-a1b2', 'Fine Name', '${ada}')`,
  ),
  '23514',
  'and so is an address the pattern will not take',
);

const starsBefore = await db.query(
  `select stars_count from public.projects where id = '${projectId}'`,
);
check(starsBefore.rows[0]?.stars_count === 0, 'a new project starts unstarred');

// ------------------------------------------------------------------- groups ---
const created = await as(
  ada,
  `select public.create_group('sylhet-devs', 'Sylhet Devs', 'The group the meetup came out of.', 'public', 'en') as id`,
);
check(
  created.ok && typeof created.rows?.[0]?.id === 'string',
  'a member creates a group through its only door',
  created.code ?? created.message ?? '',
);
const groupId = created.rows?.[0]?.id ?? '';

const membership = await db.query(
  `select role from public.group_members where group_id = '${groupId}' and uid = '${ada}'`,
);
check(
  membership.rows[0]?.role === 'owner',
  'and the RPC makes them its owner, which the table alone would not',
);

const directory = await as(
  rahim,
  `select count(*)::int as n from public.group_directory(p_limit := 40)`,
);
check(
  directory.ok && directory.rows?.[0]?.n >= 1,
  'the new group is in the directory other members read',
);

// 0059 takes the grant away. A bare group row is a group with no owner and no
// channel, and the routine that writes all three is a definer, so it did not
// need the grant in the first place.
refused(
  await as(
    rahim,
    `insert into public.groups (slug, name, owner_uid) values ('sneaky-group', 'Sneaky', '${rahim}') returning id`,
  ),
  '42501',
  'while a member cannot insert a group behind the RPC\u2019s back',
);
check(
  (
    await as(
      ada,
      `select count(*)::int as n from public.group_members where group_id = '${groupId}'`,
    )
  ).rows?.[0]?.n === 1,
  'and the group the RPC made still has exactly one member: its owner',
);

// The same migration leaves channels alone, because a group's moderators write
// them directly and there is no routine for it.
const channel = await as(
  ada,
  `insert into public.channels (group_id, slug, name, "position")
     values ('${groupId}', 'announcements', 'announcements', 1) returning slug`,
);
check(
  channel.ok,
  'and its owner can still add a channel to it',
  channel.code ?? channel.message ?? '',
);

// ------------------------------------------------------- a group's own event ---
const groupEvent = await as(
  ada,
  `insert into public.events (${eventColumns}, group_id) values
     ('group-meetup-c8d9', 'Group Meetup', '', 'in_person', 'The usual hall', 'Sylhet', '', '',
      '2027-04-04T18:00:00+06', '2027-04-04T20:00:00+06', 'Asia/Dhaka', null, '${ada}', '${groupId}')
   returning id`,
);
check(
  groupEvent.ok,
  'an event can belong to the group that came out of it',
  groupEvent.code ?? groupEvent.message ?? '',
);
refused(
  await as(
    rahim,
    `insert into public.events (${eventColumns}, group_id) values
       ('not-my-group-e1f2', 'Barging in', '', 'in_person', 'The usual hall', 'Sylhet', '', '',
        '2027-04-05T18:00:00+06', '2027-04-05T20:00:00+06', 'Asia/Dhaka', null, '${rahim}', '${groupId}')`,
  ),
  '42501',
  'but only somebody who can moderate that group may post into it',
);

await db.close();
console.log('');
console.log(`SUMMARY: ${pass} passed, ${bad.length} failed`);
if (bad.length) console.log(`  failed: ${bad.join(', ')}`);
process.exit(bad.length === 0 ? 0 : 1);
