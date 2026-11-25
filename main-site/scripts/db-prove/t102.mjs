/**
 * Proof for 0142: a case joins the reports that belong together.
 *
 * A case exists so that three complaints about one member read as one incident,
 * and so that what happened is still on the record afterwards. The checks that
 * matter:
 *
 *   * the timeline cannot be edited or deleted — by a moderator, by an owner, by
 *     anybody — and the refusal says what to do instead;
 *   * a report can belong to two cases, and joining it twice is a no-op rather
 *     than a duplicate;
 *   * a closed case has an outcome and a date, and the table refuses one without;
 *   * closing tells the member, and a `no_action` outcome does not pretend a
 *     report was upheld;
 *   * reopening is counted, because a case that keeps returning was closed too
 *     early;
 *   * a member reads their own case but not the staffroom notes.
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
    console.log(`FAIL  ${label}${detail ? `  -> ${detail}` : ''}`);
  }
}

const db = await makeDb();

const OWNER = '00000000-0000-4000-8000-000000000501';
const MOD = '00000000-0000-4000-8000-000000000502';
const SUBJECT = '00000000-0000-4000-8000-000000000503';
const REPORTER = '00000000-0000-4000-8000-000000000504';
const REPORTER2 = '00000000-0000-4000-8000-000000000505';
const BYSTANDER = '00000000-0000-4000-8000-000000000506';

await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${OWNER}',     'caseowner',   'Case Owner',    'owner',   'active'),
    ('${MOD}',       'casemod',     'Case Mod',      'moderator', 'active'),
    ('${SUBJECT}',   'casesubject', 'Case Subject',  'member',  'active'),
    ('${REPORTER}',  'caserep1',    'Case Reporter', 'member',  'active'),
    ('${REPORTER2}', 'caserep2',    'Case Reporter Two', 'member', 'active'),
    ('${BYSTANDER}', 'caseother',   'Case Bystander','member',  'active')
  on conflict do nothing;
`);
await db.exec(`update public.admin_settings set value = 'false'::jsonb where key = 'ops.audit_trigger_disabled'`);

async function as(uid, sql) {
  const claims = JSON.stringify({ sub: uid, role: 'authenticated' });
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', $jwt$${claims}$jwt$, false);`);
  const multi = /;\s*\S/.test(sql.trim());
  try {
    if (multi) {
      await db.exec(sql);
      return { rows: [], error: null };
    }
    const result = await db.query(sql);
    return { rows: result.rows, error: null };
  } catch (error) {
    try {
      await db.exec('rollback');
    } catch {
      /* not in a transaction */
    }
    return { rows: [], error };
  } finally {
    try {
      await db.exec('reset role;');
    } catch {
      /* already reset */
    }
  }
}

async function asSystem(sql) {
  await db.exec(`select set_config('request.jwt.claims', '{}', false);`);
  const multi = /;\s*\S/.test(sql.trim());
  try {
    if (multi) {
      await db.exec(sql);
      return { rows: [], error: null };
    }
    const result = await db.query(sql);
    return { rows: result.rows, error: null };
  } catch (error) {
    try {
      await db.exec('rollback');
    } catch {
      /* not in a transaction */
    }
    return { rows: [], error };
  }
}

const rows = async (sql) => (await asSystem(sql)).rows;

// Three reports about the same member, filed by two people. One post is shared
// between them, which is the case a simple foreign key could not represent.
const post = await rows(`
  insert into public.posts (author_uid, kind, slug, title, body, status, published_at, visibility)
  values ('${SUBJECT}', 'post', 'the-post-under-complaint', 'The post under complaint',
          'body text', 'published', now(), 'public')
  returning id
`);
const postId = post[0]?.id;
check(typeof postId === 'string', 'a post exists for the reports to be about');
const otherPost = await rows(`
  insert into public.posts (author_uid, kind, slug, title, body, status, published_at, visibility)
  values ('${SUBJECT}', 'post', 'a-second-post', 'A second post', 'body text', 'published', now(), 'public')
  returning id
`);
const otherPostId = otherPost[0]?.id;

async function fileReport(uid, subjectId, reason) {
  return as(
    uid,
    `insert into public.reports (reporter_uid, subject_type, subject_id, reason, details)
     values ('${uid}', 'post', '${subjectId}', '${reason}', 'details for the case proof')`,
  );
}
const filedA = await fileReport(REPORTER, postId, 'harassment');
check(filedA.error === null, 'the first report is filed', filedA.error?.message ?? '');
const filedB = await fileReport(REPORTER2, postId, 'spam');
check(filedB.error === null, 'a second person reports the same post', filedB.error?.message ?? '');
const filedC = await fileReport(REPORTER, otherPostId, 'harassment');
check(filedC.error === null, 'and a third report on another post', filedC.error?.message ?? '');

const reportIds = (await rows(`select id, subject_id from public.reports order by subject_id, reporter_uid`)).map(
  (r) => ({ id: r.id, subjectId: r.subject_id }),
);
check(reportIds.length === 3, 'three reports exist', JSON.stringify(reportIds.length));

// ===========================================================================
// 1. Opening a case
// ===========================================================================
const opened = await as(
  MOD,
  `select public.open_case('${SUBJECT}', null, 'Three complaints about one member in a day')`,
);
check(opened.error === null, 'a moderator opens a case', opened.error?.message ?? '');
const caseId = opened.rows[0]?.open_case;
check(typeof caseId === 'string', 'and gets its id back', JSON.stringify(caseId));

const memberOpens = await as(SUBJECT, `select public.open_case(null, null, 'a self-serving case')`);
check(memberOpens.error !== null, 'a member cannot open a case about anybody', memberOpens.error?.message ?? 'accepted');

const unknownSubject = await as(MOD, `select public.open_case('${BYSTANDER}0', null, 'nobody')`);
check(unknownSubject.error !== null, 'a case about a member who does not exist is refused', unknownSubject.error?.message ?? 'accepted');

// ===========================================================================
// 2. Reports join the case, and a report can be in two cases
// ===========================================================================
const reportOnPost = reportIds.find((r) => r.subjectId === postId);
const reportOnOther = reportIds.find((r) => r.subjectId === otherPostId);

for (const r of reportIds) {
  const attached = await as(MOD, `select public.attach_report_to_case('${caseId}', '${r.id}') as added`);
  check(attached.error === null, `a report joins the case`, attached.error?.message ?? '');
}

const again = await as(MOD, `select public.attach_report_to_case('${caseId}', '${reportIds[0].id}') as added`);
check(again.rows[0]?.added === false, 'joining the same report twice is a no-op rather than a duplicate', JSON.stringify(again.rows[0]));
const joinCount = await rows(`select count(*)::int as n from public.case_reports where case_id = '${caseId}'`);
check(Number(joinCount[0]?.n) === 3, 'and the join table still holds three rows', JSON.stringify(joinCount[0]?.n));

// The shared post's report matters to a second case about the other reporter.
const secondCase = await as(MOD, `select public.open_case(null, null, 'A second incident touching the same post')`);
const secondCaseId = secondCase.rows[0]?.open_case;
const shared = await as(MOD, `select public.attach_report_to_case('${secondCaseId}', '${reportOnPost.id}') as added`);
check(shared.error === null && shared.rows[0]?.added === true, 'the same report can belong to a second case', shared.error?.message ?? '');
const bothCases = await rows(`select count(*)::int as n from public.case_reports where report_id = '${reportOnPost.id}'`);
check(Number(bothCases[0]?.n) === 2, 'which is a many-to-many and not a duplicate', JSON.stringify(bothCases[0]?.n));

const unknownReport = await as(MOD, `select public.attach_report_to_case('${caseId}', gen_random_uuid())`);
check(unknownReport.error !== null, 'attaching a report that does not exist is refused', unknownReport.error?.message ?? 'accepted');

// ===========================================================================
// 3. The timeline is append-only
// ===========================================================================
const noted = await as(MOD, `select public.add_case_note('${caseId}', 'Asked the reporter for the rest of the thread', 'note')`);
check(noted.error === null, 'a moderator writes a note', noted.error?.message ?? '');
const eventId = noted.rows[0]?.add_case_note;

const edit = await asSystem(`update public.case_events set body = 'something else' where id = ${eventId}`);
check(edit.error !== null, 'the note cannot be edited, by anyone', edit.error?.message ?? 'accepted');
check(
  String(edit.error?.message ?? '').includes('Add an event saying what changed'),
  'and the refusal says what to do instead of editing',
  edit.error?.message,
);

const remove = await asSystem(`delete from public.case_events where id = ${eventId}`);
check(remove.error !== null, 'and cannot be deleted', remove.error?.message ?? 'accepted');

const updateAsOwner = await as(OWNER, `update public.case_events set body = 'x' where id = ${eventId}`);
check(updateAsOwner.error !== null, 'not even for an owner through their own session', updateAsOwner.error?.message ?? 'accepted');

const bodyIntact = await rows(`select body from public.case_events where id = ${eventId}`);
check(
  bodyIntact[0]?.body === 'Asked the reporter for the rest of the thread',
  'the original wording survives the attempts',
  JSON.stringify(bodyIntact[0]?.body),
);

// A trigger cannot be dropped by anyone holding only a normal session, so the
// guarantee is not one a staff member can lift.
const disableTrigger = await as(OWNER, `alter table public.case_events disable trigger case_events_no_update`);
check(disableTrigger.error !== null, 'and the trigger is not something a session can disable', disableTrigger.error?.message ?? 'accepted');

// ===========================================================================
// 4. A case that closes has an outcome and a date
// ===========================================================================
const badOutcome = await as(MOD, `select public.close_case('${caseId}', 'we felt like it', '', '')`);
check(badOutcome.error !== null, 'an outcome outside the vocabulary is refused', badOutcome.error?.message ?? 'accepted');
check(
  String(badOutcome.error?.message ?? '').includes('account_suspended'),
  'and the refusal lists the outcomes that are allowed',
  badOutcome.error?.message,
);

const directClose = await asSystem(`update public.cases set status = 'closed' where id = '${caseId}'`);
check(directClose.error !== null, 'a case cannot be closed by a bare UPDATE with no outcome', directClose.error?.message ?? 'accepted');

const closed = await as(
  MOD,
  `select public.close_case('${caseId}', 'content_removed', 'post_removed_harassment',
     'The post was taken down and the author emailed')`,
);
check(closed.error === null, 'a moderator closes it with an outcome', closed.error?.message ?? '');

const closedRow = await rows(
  `select status, outcome, closed_at is not null as dated, outcome_message_key, reopened_count
     from public.cases where id = '${caseId}'`,
);
check(closedRow[0]?.status === 'closed', 'the case is closed', closedRow[0]?.status);
check(closedRow[0]?.outcome === 'content_removed', 'with the outcome recorded', closedRow[0]?.outcome);
check(closedRow[0]?.dated === true, 'and a closing time, so the duration is measurable', JSON.stringify(closedRow[0]?.dated));
check(
  closedRow[0]?.outcome_message_key === 'post_removed_harassment',
  'and a message key rather than a sentence, so the console owns the copy',
  closedRow[0]?.outcome_message_key,
);

const closeTwice = await as(MOD, `select public.close_case('${caseId}', 'warned', '', '')`);
check(closeTwice.error !== null, 'closing a closed case is refused', closeTwice.error?.message ?? 'accepted');

const noteOnClosed = await as(MOD, `select public.add_case_note('${caseId}', 'one more thing')`);
check(noteOnClosed.error !== null, 'and nothing can be written on it until it is reopened', noteOnClosed.error?.message ?? 'accepted');

// ===========================================================================
// 5. The member is told, and told the truth
// ===========================================================================
const inbox = await as(SUBJECT, `select * from public.my_notifications_page(50, null, false)`);
const told = inbox.rows.find((r) => String(r.body_en).includes('reviewed') || String(r.body_en).includes('acted on'));
check(told !== undefined, 'the member is told the case was resolved', JSON.stringify(inbox.rows.map((r) => r.body_en)));
check(
  String(told?.body_en ?? '').includes('taken down'),
  'and the note travels, so it is not a form letter',
  told?.body_en,
);

// A case that ends in no action must not tell the member a report was upheld.
const thirdCase = await as(MOD, `select public.open_case('${SUBJECT}', null, 'a complaint that turns out to be nothing')`);
const thirdId = thirdCase.rows[0]?.open_case;
await as(MOD, `select public.close_case('${thirdId}', 'no_action', '', 'Looked at the whole thread; no rule was broken')`);
const inboxAfter = await rows(
  `select body from public.notifications where uid = '${SUBJECT}' order by created_at desc limit 3`,
);
check(
  !inboxAfter.some((r) => String(r.body).includes('acted on') && String(r.body).includes('no rule was broken')),
  'a no-action outcome does not claim a report was acted on',
  JSON.stringify(inboxAfter.map((r) => r.body)),
);

// ===========================================================================
// 6. Reopening is counted
// ===========================================================================
const shortReason = await as(MOD, `select public.reopen_case('${caseId}', 'no')`);
check(shortReason.error !== null, 'reopening needs a reason of some substance', shortReason.error?.message ?? 'accepted');

// A case that is still open is not reopened — and the case used here is created
// for this check rather than borrowed, because `thirdId` is closed a line earlier
// and reopening a closed case is the *allowed* path.
const stillOpen = await as(MOD, `select public.open_case('${SUBJECT}', null, 'a case that stays open')`);
const stillOpenId = stillOpen.rows[0]?.open_case;
const reopenOpen = await as(MOD, `select public.reopen_case('${stillOpenId}', 'it is not closed')`);
check(reopenOpen.error !== null, 'an open case cannot be reopened', reopenOpen.error?.message ?? 'accepted');

const reopened = await as(
  MOD,
  `select public.reopen_case('${caseId}', 'The member appealed and produced the rest of the thread')`,
);
check(reopened.error === null, 'a closed case can be reopened', reopened.error?.message ?? '');

const reopenedRow = await rows(
  `select status, outcome is null as cleared, closed_at is null as undated, reopened_count
     from public.cases where id = '${caseId}'`,
);
check(reopenedRow[0]?.status === 'open', 'and is open again', reopenedRow[0]?.status);
check(reopenedRow[0]?.cleared === true, 'with the outcome cleared, because there is no outcome yet', JSON.stringify(reopenedRow[0]?.cleared));
check(reopenedRow[0]?.undated === true, 'and no closing date', JSON.stringify(reopenedRow[0]?.undated));
check(Number(reopenedRow[0]?.reopened_count) === 1, 'the reopen count is the evidence that it was closed too early', JSON.stringify(reopenedRow[0]?.reopened_count));

const reopenEvent = await rows(
  `select kind, body from public.case_events where case_id = '${caseId}' and kind = 'reopened'`,
);
check(reopenEvent.length === 1, 'and the timeline says who reopened it and why', JSON.stringify(reopenEvent));
check(
  String(reopenEvent[0]?.body ?? '').includes('appealed'),
  'in their own words',
  reopenEvent[0]?.body,
);

// ===========================================================================
// 7. Reading a case
// ===========================================================================
const detail = await as(MOD, `select * from public.admin_case('${caseId}')`);
check(detail.error === null && detail.rows.length === 1, 'a moderator reads the case', detail.error?.message ?? '');
const one = detail.rows[0];
check(Number(one?.reports?.length) === 3, 'with its three reports', JSON.stringify(one?.reports?.length));
check(Array.isArray(one?.events) && one.events.length >= 5, 'and its timeline in order', JSON.stringify(one?.events?.length));
check(
  one?.events?.[0]?.kind === 'opened',
  'beginning with the opening',
  JSON.stringify(one?.events?.[0]?.kind),
);
check(one?.subject_name === 'Case Subject', 'and the member by name, not by uuid', one?.subject_name);

const memberView = await as(SUBJECT, `select * from public.cases where id = '${caseId}'`);
check(memberView.rows.length === 1, 'the member can read the case about themselves');

const memberEvents = await as(SUBJECT, `select * from public.case_events where case_id = '${caseId}'`);
check(memberEvents.rows.length >= 1, 'and its timeline');
check(
  !memberEvents.rows.some((e) => e.kind === 'note'),
  'but not the notes staff leave for each other',
  JSON.stringify(memberEvents.rows.map((e) => e.kind)),
);

const bystanderView = await as(BYSTANDER, `select * from public.cases where id = '${caseId}'`);
check(bystanderView.rows.length === 0, 'somebody else reads nothing', JSON.stringify(bystanderView.rows.length));

const bystanderDetail = await as(BYSTANDER, `select * from public.admin_case('${caseId}')`);
check(bystanderDetail.error !== null, 'and cannot use the staff read either', bystanderDetail.error?.message ?? 'accepted');

const memberQueue = await as(SUBJECT, `select * from public.case_queue('open', 50)`);
check(memberQueue.error !== null, 'a member cannot read the queue', memberQueue.error?.message ?? 'accepted');

// ===========================================================================
// 8. The queue
// ===========================================================================
const queue = await as(MOD, `select * from public.case_queue('open', 50)`);
check(queue.error === null, 'a moderator reads the open queue', queue.error?.message ?? '');
const queued = queue.rows.find((c) => c.id === caseId);
check(queued !== undefined, 'the reopened case is in it', JSON.stringify(queue.rows.map((c) => c.id)));
check(Number(queued?.reports) === 3, 'with its report count', JSON.stringify(queued?.reports));
check(typeof queued?.age_hours === 'number', 'and how long it has been open, in hours', JSON.stringify(queued?.age_hours));

const closedQueue = await as(MOD, `select * from public.case_queue('closed', 50)`);
check(
  closedQueue.rows.every((c) => c.status === 'closed'),
  'the closed queue holds only closed cases',
  JSON.stringify(closedQueue.rows.map((c) => c.status)),
);

const badQueue = await as(MOD, `select * from public.case_queue('whenever', 10)`);
check(badQueue.error !== null, 'an unknown queue name is refused rather than ignored', badQueue.error?.message ?? 'accepted');

const badLimit = await as(MOD, `select * from public.case_queue('open', 1000)`);
check(badLimit.error !== null, 'and a page larger than 200 is refused', badLimit.error?.message ?? 'accepted');

// ===========================================================================
// 9. A legal hold sorts ahead of everything
// ===========================================================================
await as(MOD, `select public.add_case_note('${secondCaseId}', 'Counsel asked us to keep this one', 'hold')`);
await asSystem(`update public.cases set legal_hold = true where id = '${secondCaseId}'`);
const heldQueue = await as(MOD, `select * from public.case_queue('open', 50)`);
check(heldQueue.rows[0]?.id === secondCaseId, 'a case under legal hold comes first in the queue', JSON.stringify(heldQueue.rows[0]?.id));

console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) {
  console.log(bad.map((b) => `  - ${b}`).join('\n'));
  process.exitCode = 1;
}
