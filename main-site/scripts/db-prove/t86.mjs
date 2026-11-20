/**
 * 0126: complete applications stay private, links are validated, and one
 * permission-checked queue is the employer's complete review surface.
 */
import {
  as,
  asAnon,
  check,
  expectFail,
  failureCount,
  makeDb,
  summary,
} from './lib.mjs';

const db = await makeDb();

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
const poster = 'aaaaaaaa-0126-4126-8126-000000000001';
const applicant = 'bbbbbbbb-0126-4126-8126-000000000002';
const stranger = 'cccccccc-0126-4126-8126-000000000003';
const staff = 'dddddddd-0126-4126-8126-000000000004';
const jobId = 'eeeeeeee-0126-4126-8126-000000000005';
const expiredJobId = 'eeeeeeee-0126-4126-8126-000000000006';
const closedJobId = 'eeeeeeee-0126-4126-8126-000000000007';
const fallbackJobId = 'eeeeeeee-0126-4126-8126-000000000009';
const fallbackApplicant = 'fffffff0-0126-4126-8126-000000000009';
const imageOne = 'https://i.ibb.co/AbCdEf/certificate.png';
const imageTwo = 'https://i7.ibb.co.com/qwerty/project.webp';

function applySql(job = jobId, overrides = {}) {
  const input = {
    p_job_id: `'${job}'::uuid`,
    p_cover_letter: `'I have shipped accessible production applications.'`,
    p_resume_url: `'https://drive.google.com/file/d/resume/view'`,
    p_applicant_name: `'Nusrat Jahan'`,
    p_phone: `'+880 1712-345678'`,
    p_email: `'nusrat@example.com'`,
    p_location: `'Sylhet, Bangladesh'`,
    p_years_experience: '7',
    p_education: `'BSc in Computer Science'`,
    p_expected_salary_poisha: '12500000',
    p_portfolio_url: `'https://portfolio.example.dev'`,
    p_linkedin_url: `'https://www.linkedin.com/in/nusrat-jahan'`,
    p_notice_period: `'30 days'`,
    p_skills: `array['Kotlin', 'React', 'Postgres']::text[]`,
    p_certification_image_urls: `array['${imageOne}', '${imageTwo}']::text[]`,
    ...overrides,
  };
  return `select public.apply_to_job(${Object.entries(input)
    .map(([key, value]) => `${key} => ${value}`)
    .join(', ')})`;
}

await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status, privacy) values
    ('${poster}', 'job_poster', 'Job Poster', 'member', 'active', '{"showEmail": false}'::jsonb),
    ('${applicant}', 'nusrat', 'Nusrat Profile Name', 'member', 'active', '{"showEmail": false}'::jsonb),
    ('${stranger}', 'stranger', 'Stranger', 'member', 'active', '{}'::jsonb),
    ('${staff}', 'staff_reviewer', 'Staff Reviewer', 'admin', 'active', '{}'::jsonb);

  insert into public.jobs (
    id, slug, title, company, description, job_type, work_mode, level,
    city, country, skills, status, poster_uid, expires_at, published_at
  ) values
    ('${jobId}', 'application-rich-profile', 'Application Rich Profile', 'BSDC',
     'A role used to prove the rich application workflow.', 'full_time', 'remote', 'senior',
     '', 'BD', array['Kotlin'], 'open', '${poster}', now() + interval '30 days', now()),
    ('${expiredJobId}', 'application-expired-profile', 'Expired Application Profile', 'BSDC',
     'An expired role.', 'full_time', 'remote', 'mid', '', 'BD', array[]::text[],
     'open', '${poster}', now() - interval '1 day', now() - interval '30 days'),
    ('${closedJobId}', 'application-closed-profile', 'Closed Application Profile', 'BSDC',
     'A closed role.', 'full_time', 'remote', 'mid', '', 'BD', array[]::text[],
     'closed', '${poster}', null, now() - interval '30 days');
`);
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status, privacy)
  values ('${fallbackApplicant}', 'fallback_email', 'Email Fallback', 'member', 'active', '{"showEmail": true}'::jsonb);
  insert into public.jobs (id, slug, title, company, work_mode, city, country, poster_uid, status, published_at)
  values ('${fallbackJobId}', 'application-email-fallback', 'Email Fallback', 'BSDC', 'remote', '', 'BD', '${poster}', 'open', now());
`);

await as(db, applicant, applySql(), 'applicant submits every rich application field');
const stored = await db.query(`
  select id, applicant_name, phone, email, location, years_experience, education,
         expected_salary_poisha, portfolio_url, linkedin_url, notice_period,
         skills, certification_image_urls, cover_letter, resume_url, status
    from public.job_applications where job_id = '${jobId}' and applicant_uid = '${applicant}'
`);
const applicationId = stored.rows[0]?.id;
check(
  'all applicant text, URL, number and image fields persist as submitted',
  stored.rows.length === 1 &&
    stored.rows[0].applicant_name === 'Nusrat Jahan' &&
    stored.rows[0].phone === '+880 1712-345678' &&
    stored.rows[0].email === 'nusrat@example.com' &&
    stored.rows[0].location === 'Sylhet, Bangladesh' &&
    stored.rows[0].years_experience === 7 &&
    stored.rows[0].education === 'BSc in Computer Science' &&
    stored.rows[0].expected_salary_poisha === 12500000 &&
    stored.rows[0].portfolio_url === 'https://portfolio.example.dev' &&
    stored.rows[0].linkedin_url === 'https://www.linkedin.com/in/nusrat-jahan' &&
    stored.rows[0].notice_period === '30 days' &&
    JSON.stringify(stored.rows[0].skills) === JSON.stringify(['Kotlin', 'React', 'Postgres']) &&
    JSON.stringify(stored.rows[0].certification_image_urls) === JSON.stringify([imageOne, imageTwo]) &&
    stored.rows[0].resume_url === 'https://drive.google.com/file/d/resume/view' &&
    stored.rows[0].status === 'submitted',
  JSON.stringify(stored.rows[0]),
);

const posterQueue = await as(
  db,
  poster,
  `select * from public.job_application_queue('${jobId}', 100)`,
  'job poster reads the complete review queue',
);
const row = posterQueue?.rows[0];
check(
  'queue returns complete contact and applicant detail, with the per-application name',
  posterQueue?.rows.length === 1 &&
    row?.applicant_name === 'Nusrat Jahan' &&
    row?.display_name === 'Nusrat Jahan' &&
    row?.phone === '+880 1712-345678' &&
    row?.email === 'nusrat@example.com' &&
    row?.expected_salary_poisha === 12500000 &&
    row?.certification_image_urls?.length === 2,
  JSON.stringify(row),
);

const staffQueue = await as(
  db,
  staff,
  `select count(*)::int as n from public.job_application_queue('${jobId}', 100)`,
  'staff can use the poster/staff-only queue',
  { bsdc_role: 'admin' },
);
check('staff queue contains the application', staffQueue?.rows[0]?.n === 1);

await expectFail(
  db,
  stranger,
  `select * from public.job_application_queue('${jobId}', 100)`,
  '42501',
  'a signed-in stranger is refused the complete applicant queue',
);
const anonQueue = await anonymousError(
  `select * from public.job_application_queue('${jobId}', 100)`,
);
check('anonymous cannot read the queue RPC', anonQueue === '42501', String(anonQueue));
const anonTable = await anonymousError(`select phone, email from public.job_applications`);
check('anonymous has no direct table path to contact columns', anonTable === '42501', String(anonTable));

const publicJob = await asAnon(
  db,
  `select to_jsonb(j)::text as payload from public.job_detail('application-rich-profile') j`,
  'public job detail remains readable',
);
const publicPayload = publicJob?.rows[0]?.payload ?? '';
check(
  'public job detail contains no applicant contact or application detail fields',
  !/("phone"|"email"|"applicant_name"|"expected_salary_poisha"|"certification_image_urls")/i.test(publicPayload),
  publicPayload,
);

const applicantTracker = await as(
  db,
  applicant,
  `select * from public.my_job_applications(40)`,
  'applicant reads their private application tracker',
);
check(
  'applicant tracker includes job/status/rejection fields but omits contact columns',
  applicantTracker?.rows.length === 1 &&
    applicantTracker.rows[0].job_title === 'Application Rich Profile' &&
    applicantTracker.rows[0].status === 'submitted' &&
    !('phone' in applicantTracker.rows[0]) &&
    !('email' in applicantTracker.rows[0]),
  JSON.stringify(applicantTracker?.rows[0]),
);
const strangerTracker = await as(
  db,
  stranger,
  `select count(*)::int as n from public.my_job_applications(40)`,
  'another member receives only their own tracker',
);
check('tracker does not reveal another member application', strangerTracker?.rows[0]?.n === 0);

await expectFail(
  db,
  applicant,
  applySql(jobId, { p_job_id: `'${expiredJobId}'::uuid` }),
  'P0002',
  'expired job cannot accept applications',
);
await expectFail(
  db,
  applicant,
  applySql(jobId, { p_job_id: `'${closedJobId}'::uuid` }),
  'P0002',
  'closed job cannot accept applications',
);
await expectFail(
  db,
  poster,
  applySql(jobId, { p_applicant_name: `'Poster'`, p_email: `''` }),
  '22023',
  'job poster cannot apply to their own role',
);
await expectFail(
  db,
  applicant,
  applySql(),
  '23505',
  'duplicate job application is refused',
);

const anotherJobId = 'eeeeeeee-0126-4126-8126-000000000008';
await db.exec(`
  insert into public.jobs (id, slug, title, company, work_mode, city, country, poster_uid, status, published_at)
  values ('${anotherJobId}', 'application-invalid-inputs', 'Invalid Inputs', 'BSDC', 'remote', '', 'BD', '${poster}', 'open', now());
`);
await as(
  db,
  applicant,
  applySql(anotherJobId, { p_email: `''` }),
  'applicant with hidden profile email does not expose JWT email as a fallback',
  { email: 'hidden@example.com' },
);
const hiddenFallback = await db.query(`
  select email from public.job_applications where job_id = '${anotherJobId}' and applicant_uid = '${applicant}'
`);
check('showEmail false keeps an omitted application email blank', hiddenFallback.rows[0]?.email === '');
await as(
  db,
  fallbackApplicant,
  applySql(fallbackJobId, { p_email: `''` }),
  'applicant with showEmail enabled may use their verified token email as a fallback',
  { email: 'fallback@example.com', email_verified: true },
);
const optedInEmail = await as(
  db,
  poster,
  `select email from public.job_application_queue('${fallbackJobId}', 100)`,
  'poster reads the opted-in application email fallback',
);
check('only opted-in email fallback reaches the employer queue', optedInEmail?.rows[0]?.email === 'fallback@example.com');
await expectFail(db, applicant, applySql(anotherJobId, { p_email: `'bad-email'` }), '22023', 'invalid email is refused');
await expectFail(db, applicant, applySql(anotherJobId, { p_phone: `'call me maybe'` }), '22023', 'invalid phone characters are refused');
await expectFail(db, applicant, applySql(anotherJobId, { p_resume_url: `'javascript:alert(1)'` }), '22023', 'unsafe résumé scheme is refused');
await expectFail(db, applicant, applySql(anotherJobId, { p_portfolio_url: `'http://portfolio.example'` }), '22023', 'non-HTTPS portfolio link is refused');
await expectFail(db, applicant, applySql(anotherJobId, { p_linkedin_url: `'data:text/plain,hello'` }), '22023', 'data LinkedIn URL is refused');
await expectFail(db, applicant, applySql(anotherJobId, { p_certification_image_urls: `array['https://evil.example/cert.png']::text[]` }), '22023', 'non-ImgBB certification image is refused');
await expectFail(db, applicant, applySql(anotherJobId, { p_certification_image_urls: `array['${imageOne}', '${imageOne}', '${imageOne}', '${imageOne}']::text[]` }), '22023', 'more than three certification images are refused');
await expectFail(db, applicant, applySql(anotherJobId, { p_expected_salary_poisha: '-1' }), '22023', 'negative expected salary is refused');

const decideReviewing = await as(
  db,
  poster,
  `select public.decide_application((select id from public.job_applications where job_id = '${jobId}'), 'reviewing')`,
  'employer moves application into review',
);
const decideShortlist = await as(
  db,
  poster,
  `select public.decide_application((select id from public.job_applications where job_id = '${jobId}'), 'shortlisted')`,
  'employer shortlists application',
);
const decideHire = await as(
  db,
  poster,
  `select public.decide_application((select id from public.job_applications where job_id = '${jobId}'), 'hired')`,
  'employer hires applicant through the single decision RPC',
);
check('review → shortlist → hire transitions persist', !!decideReviewing && !!decideShortlist && !!decideHire);

await as(
  db,
  poster,
  `select public.decide_application((select id from public.job_applications where job_id = '${jobId}'), 'rejected', 'The role required more Kotlin production experience.')`,
  'employer can reject with a saved and notified reason',
);
const rejected = await db.query(`
  select status, rejection_reason from public.job_applications where job_id = '${jobId}'
`);
check(
  'rejection reason is persisted with the decision',
  rejected.rows[0]?.status === 'rejected' &&
    rejected.rows[0]?.rejection_reason === 'The role required more Kotlin production experience.',
  JSON.stringify(rejected.rows[0]),
);
await expectFail(
  db,
  poster,
  `select public.decide_application((select id from public.job_applications where job_id = '${jobId}'), 'withdrawn', '')`,
  '22023',
  'employer cannot set the applicant-only withdrawn status',
);
await expectFail(
  db,
  poster,
  `select public.decide_application((select id from public.job_applications where job_id = '${jobId}'), 'rejected', '')`,
  '22023',
  'rejection requires a useful reason',
);
await expectFail(
  db,
  stranger,
  `select public.decide_application('${applicationId}'::uuid, 'hired', '')`,
  '42501',
  'stranger cannot decide an application',
);

const signatures = await db.query(`
  select p.proname, p.pronargs, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('apply_to_job', 'job_application_queue')
   order by p.proname, p.pronargs
`);
check(
  'PostgREST sees one extended apply RPC and one exact queue signature (no old overload)',
  signatures.rows.filter((r) => r.proname === 'apply_to_job').length === 1 &&
    signatures.rows.find((r) => r.proname === 'apply_to_job')?.pronargs === 15 &&
    signatures.rows.filter((r) => r.proname === 'job_application_queue').length === 1 &&
    signatures.rows.find((r) => r.proname === 'job_application_queue')?.pronargs === 2,
  JSON.stringify(signatures.rows),
);

check(
  'application count trigger remains in sync after the rich application insert',
  (await db.query(`select applications_count from public.jobs where id = '${jobId}'`)).rows[0]?.applications_count === 1,
);

if (failureCount() > 0) process.exitCode = 1;
summary();
