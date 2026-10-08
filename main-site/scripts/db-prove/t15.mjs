// Authorization posture, behaviourally: staff consoles and escalation paths
// must refuse a plain member and an anonymous caller, and a certificate must
// be impossible to obtain without passing the quiz.
import { makeDb, as, asAnon, asOwner, expectFail, summary } from './lib.mjs';
const db = await makeDb();
await asOwner(
  db,
  `
  insert into public.profiles (uid, username, display_name, role) values
    ('alice','alice','Alice','member'),('bob','bob','Bob','member');
  insert into public.posts (author_uid, slug, kind, status, visibility, title, excerpt, published_at)
    values ('alice','public-post','post','published','public','Public Post','e', now()),
           ('alice','draft-post','post','draft','public','Draft Post','secret', now());
  insert into public.courses (slug, title, instructor_uid, pass_mark, grants_certificate, status)
    values ('alice-course','Alice Course','alice', 70, true, 'published');
  insert into public.enrollments (course_id, uid) select id, 'bob' from public.courses where slug='alice-course';
  insert into public.quizzes (course_id, title, max_attempts) select id, 'Quiz 1', 3 from public.courses where slug='alice-course';
  insert into public.quiz_questions (quiz_id, prompt, marks, "position")
    select id, 'What is 2+2?', 10, 0 from public.quizzes limit 1;
  insert into public.quiz_options (question_id, label, is_correct, "position")
    select id, '4', true, 0 from public.quiz_questions limit 1;
  insert into public.quiz_options (question_id, label, is_correct, "position")
    select id, '5', false, 1 from public.quiz_questions limit 1;
  insert into public.reports (reporter_uid, subject_type, subject_id, reason)
    values ('bob','post','public-post','spam');
`,
);

// --- 1. the permission helpers default to no access -------------------------
await asAnon(
  db,
  `select 1 where bsdc.has_permission('moderation.read') = false`,
  'anon has no permission',
);
await asAnon(db, `select 1 where bsdc.current_uid() is null`, 'anon has no uid');
await as(
  db,
  'bob',
  `select 1 where bsdc.has_permission('moderation.read') = false`,
  'a member has no moderation permission',
);
await as(
  db,
  'bob',
  `select 1 where bsdc.has_permission('people.role') = false`,
  'a member has no role permission',
);

// --- 2. the staff reads return nothing (never "everything") -----------------
await as(
  db,
  'bob',
  `select 1 where (select count(*) from public.admin_overview()) = 0`,
  'admin_overview is empty for a member',
);
await as(
  db,
  'bob',
  `select 1 where (select count(*) from public.admin_people()) = 0`,
  'admin_people is empty for a member',
);
await as(
  db,
  'bob',
  `select 1 where (select count(*) from public.admin_audit(10)) = 0`,
  'admin_audit is empty for a member',
);
await as(
  db,
  'bob',
  `select 1 where (select count(*) from public.moderation_queue('open', 10)) = 0`,
  'moderation_queue is empty for a member',
);
await asAnon(
  db,
  `select 1 where (select count(*) from public.admin_people()) = 0`,
  'admin_people is empty for anonymous',
);
await as(
  db,
  'bob',
  `select 1 where (select count(*) from public.audit_log) = 0`,
  'the audit table is empty for a member',
);

// --- 3. the staff writes raise, and escalation is refused -------------------
await expectFail(
  db,
  'bob',
  `select public.set_user_role('bob','admin')`,
  '42501',
  'a member cannot promote themselves',
);
await expectFail(
  db,
  'bob',
  `select public.set_user_role('alice','admin')`,
  '42501',
  'nor anybody else',
);
await expectFail(
  db,
  'bob',
  `select public.set_account_status('alice','suspended','because')`,
  '42501',
  'a member cannot suspend anybody',
);
await expectFail(
  db,
  'bob',
  `select public.set_plugin_enabled('media.imgbb', false)`,
  '42501',
  'a member cannot switch features off',
);
await expectFail(
  db,
  'bob',
  `select public.claim_report((select id from public.reports limit 1))`,
  '42501',
  'a member cannot claim a report',
);
await expectFail(
  db,
  'bob',
  `select public.resolve_report((select id from public.reports limit 1), 'dismiss', '')`,
  '42501',
  'a member cannot resolve a report',
);
await expectFail(
  db,
  'bob',
  `update public.profiles set role = 'admin' where uid = 'bob'`,
  '42501',
  'a member cannot write the role column',
);
await expectFail(
  db,
  'bob',
  `insert into public.feature_flags (key, enabled, audience, description) values ('x', true, 'all', '')`,
  '42501',
  'a member cannot add a flag',
);
await expectFail(
  db,
  'bob',
  `update public.feature_flags set enabled = true`,
  '42501',
  'a member cannot flip a flag',
);

// --- 4. a certificate cannot be forged --------------------------------------
await expectFail(
  db,
  'bob',
  `insert into public.certificates (code, course_id, uid, recipient_name, course_title, score)
  select 'BSDC-AAAA-BBBB-CCCC', id, 'bob', 'Bob', 'Alice Course', 100 from public.courses where slug='alice-course'`,
  '42501',
  'a member cannot insert their own certificate',
);
await expectFail(
  db,
  'bob',
  `select public.issue_certificate('workshop','Bob','Subject','bob')`,
  '42501',
  'a member cannot issue one',
);
await expectFail(
  db,
  'bob',
  `update public.enrollments set progress = 100 where uid = 'bob'`,
  '42501',
  'a member cannot forge course progress',
);
await expectFail(
  db,
  'bob',
  `insert into public.quiz_attempts (quiz_id, uid, score, earned_marks, total_marks, passed, answers)
  select id, 'bob', 100, 10, 10, true, '{}'::jsonb from public.quizzes limit 1`,
  '42501',
  'a member cannot write a passed attempt',
);
// and the honest path: a wrong answer does not pass, so no certificate appears.
// The option ids are read here as the owner: a member deliberately cannot read
// `quiz_options.is_correct`, which is the point — grading happens inside the
// function, not in the caller.
const qid = (await db.query(`select id::text from public.quiz_questions limit 1`)).rows[0].id;
const wrong = (
  await db.query(`select id::text from public.quiz_options where not is_correct limit 1`)
).rows[0].id;
const right = (await db.query(`select id::text from public.quiz_options where is_correct limit 1`))
  .rows[0].id;
await expectFail(
  db,
  'bob',
  `select id from public.quiz_options where is_correct`,
  '42501',
  'a member cannot read the answer key',
);
await as(
  db,
  'bob',
  `select 1 from public.grade_quiz_attempt((select id from public.quizzes limit 1),
  jsonb_build_object('${qid}', jsonb_build_array('${wrong}'))) where passed = false`,
  'the wrong answer does not pass',
);
await as(
  db,
  'bob',
  `select 1 where (select count(*) from public.certificates) = 0`,
  'so no certificate exists',
);
// the right answer passes, but progress is still 0, so still no certificate
await as(
  db,
  'bob',
  `select 1 from public.grade_quiz_attempt((select id from public.quizzes limit 1),
  jsonb_build_object('${qid}', jsonb_build_array('${right}'))) where passed = true`,
  'the right answer passes',
);
await as(
  db,
  'bob',
  `select 1 where (select count(*) from public.certificates) = 0`,
  'a pass without a finished course still does not certify',
);

// --- 5. search never shows what the viewer may not read ---------------------
await as(
  db,
  'bob',
  `select 1 where (select count(*) from public.global_search('Draft Post', array['post'])) = 0`,
  'a member search finds no draft',
);
await as(
  db,
  'bob',
  `select 1 where (select count(*) from public.global_search('Public Post', array['post'])) = 1`,
  'and does find the published one',
);
await asAnon(
  db,
  `select 1 where (select count(*) from public.global_search('Public Post', array['post'])) = 1`,
  'anonymous finds the published one',
);
await asAnon(
  db,
  `select 1 where (select count(*) from public.global_search('Draft Post', array['post'])) = 0`,
  'anonymous finds no draft',
);
summary();
